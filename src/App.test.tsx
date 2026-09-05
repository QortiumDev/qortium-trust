// @vitest-environment jsdom
//
// App-level integration coverage for PR 1 (rating-flow reliability):
//  - submit -> pending -> poll confirmation clears pending
//  - submit -> pending -> no confirmation for 3 minutes -> timeout notice with Retry/Dismiss
//  - Retry re-arms polling; Dismiss drops the entry
//  - a SELECTED_ACCOUNT_CHANGED-style postMessage arriving mid-pending no longer wipes pending state
//    (the app binds to the first account loaded and never reloads on an account switch — item #1)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import App from './App';
import { loadRecentDirectory } from './recentActivity';
vi.mock('./browserAvatar', () => ({ fetchBrowserAvatar: vi.fn().mockResolvedValue({ kind: 'unavailable' }) }));
vi.mock('./recentActivity', () => ({ loadRecentDirectory: vi.fn() }));
import { getBridgeState } from './qdnRequest';
import {
  ensureAccountUnlocked,
  getAccountRatingsPage,
  getNodeStatus,
  getRatingCooldown,
  getRatingPreview,
  getTrustChanges,
  getTrustDerivationPage,
  getTrustExplanation,
  getTrustPolicy,
  getTrustProfile,
  getTrustSummary,
  resolveSelfAccount,
  submitRating,
} from './trustApi';
import { loadIdentityProfiles } from './identityProfiles';
import { PENDING_CONFIRM_POLL_MS, PENDING_CONFIRM_TIMEOUT_MS } from './ratingControl';
import type {
  AccountRatingCooldown,
  AccountTrustExplanation,
  AccountTrustProfile,
  BridgeState,
  RatingCounts,
  SelfAccount,
  TrustDerivation,
  TrustPolicy,
  TrustSummary,
} from './types';

vi.mock('./qdnRequest', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./qdnRequest')>();
  return { ...actual, getBridgeState: vi.fn() };
});

vi.mock('./trustApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./trustApi')>();
  return {
    ...actual,
    ensureAccountUnlocked: vi.fn(),
    getAccountRatingsPage: vi.fn(),
    getNodeStatus: vi.fn(),
    getRatingCooldown: vi.fn(),
    getRatingPreview: vi.fn(),
    getTrustChanges: vi.fn(),
    getTrustDerivationPage: vi.fn(),
    getTrustExplanation: vi.fn(),
    getTrustPolicy: vi.fn(),
    getTrustProfile: vi.fn(),
    getTrustSummary: vi.fn(),
    resolveSelfAccount: vi.fn(),
    submitRating: vi.fn(),
  };
});

vi.mock('./identityProfiles', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./identityProfiles')>();
  return { ...actual, loadIdentityProfiles: vi.fn() };
});

const getBridgeStateMock = vi.mocked(getBridgeState);
const ensureAccountUnlockedMock = vi.mocked(ensureAccountUnlocked);
const getAccountRatingsPageMock = vi.mocked(getAccountRatingsPage);
const getNodeStatusMock = vi.mocked(getNodeStatus);
const getRatingCooldownMock = vi.mocked(getRatingCooldown);
const getRatingPreviewMock = vi.mocked(getRatingPreview);
const getTrustChangesMock = vi.mocked(getTrustChanges);
const getTrustDerivationPageMock = vi.mocked(getTrustDerivationPage);
const getTrustExplanationMock = vi.mocked(getTrustExplanation);
const getTrustPolicyMock = vi.mocked(getTrustPolicy);
const getTrustProfileMock = vi.mocked(getTrustProfile);
const getTrustSummaryMock = vi.mocked(getTrustSummary);
const resolveSelfAccountMock = vi.mocked(resolveSelfAccount);
const submitRatingMock = vi.mocked(submitRating);
const loadIdentityProfilesMock = vi.mocked(loadIdentityProfiles);

const SELF: SelfAccount = { address: 'Qself', publicKey: 'selfPub', name: 'Self', isUnlocked: true };

function counts(): RatingCounts {
  return {
    positiveLowCount: 0,
    positiveMediumCount: 0,
    positiveHighCount: 0,
    positiveVeryHighCount: 0,
    negativeLowCount: 0,
    negativeMediumCount: 0,
    negativeHighCount: 0,
    negativeVeryHighCount: 0,
    positiveRatingCount: 0,
    negativeRatingCount: 0,
    totalRatingCount: 0,
  };
}

const TARGET_DERIVATION: TrustDerivation = {
  accountAddress: 'Qtarget',
  accountPublicKey: 'targetPub',
  blocksMinted: 10,
  categories: (['MANAGER', 'TRAINER', 'PLAYER', 'SUBJECT'] as const).map((category, index) => ({
    category,
    inboundRatings: counts(),
    level: index + 1,
    levelScore: index + 1,
    levelScoreCap: 100,
    mappedTrustStatus: 'SILVER',
    mappedTrustStatusValue: 3,
    mappedTrustWeightPercent: 50,
    score: (index + 1) * 10,
  })),
  derivedTrustStatus: 'SILVER',
  derivedTrustStatusValue: 3,
  derivedTrustWeightPercent: 50,
  mintingSeedMember: true,
};

function cooldown(overrides: Partial<AccountRatingCooldown> = {}): AccountRatingCooldown {
  return {
    targetPublicKey: 'targetPub',
    targetAddress: 'Qtarget',
    raterPublicKey: 'selfPub',
    raterAddress: 'Qself',
    category: 'SUBJECT',
    activeRating: null,
    cooldownBlocks: 0,
    latestRatingChangeHeight: null,
    currentHeight: 100,
    candidateChangeHeight: 100,
    earliestAllowedHeight: 100,
    blocksRemaining: 0,
    canChangeNow: true,
    ...overrides,
  };
}

// Drain the microtask queue (and any React state updates it triggers) a handful of times. Fake
// timers only pause macrotasks (setTimeout/Date), never native Promise resolution, so this is
// enough to let our mocked async calls (which resolve immediately) settle between assertions.
async function flush(hops = 20) {
  await act(async () => {
    for (let i = 0; i < hops; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await Promise.resolve();
    }
  });
}

async function renderAppAtAccountDetail() {
  render(<App />);
  await flush(20);

  const openButton = screen.getByRole('button', { name: /^Open /i });
  fireEvent.click(openButton);
  await flush(20);

  // The RatingForm's mount-time cooldown fetch must settle before the submit gate can clear.
  await flush(10);

  // Label reads "Remove rating" at the default (0) selection and "Submit rating" for any non-zero
  // pick — match either so this helper works before the test drives the two-step chooser.
  return screen.getByRole('button', { name: /submit rating|remove rating/i }) as HTMLButtonElement;
}

describe('App rating flow (pending -> confirm/timeout, and account-switch immunity)', () => {
  let cooldownActiveRating: number | null = null;

  beforeEach(() => {
    vi.mocked(loadRecentDirectory).mockReset().mockImplementation(async (_height, page) => ({ activity: {}, derivations: page.derivations, total: page.derivations.length }));
    // Only fake setTimeout/Date (what the poll loop and the timeout check use). Leaving
    // queueMicrotask/MessageChannel untouched keeps React's own effect-flushing scheduler (used by
    // `act()`) running normally, otherwise `act()` calls made under fake timers hang forever.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    // Each App mount reads the route from window.location on its first effect — reset it so a
    // previous test's navigateToRoute() push doesn't leak into the next test's fresh render.
    window.history.replaceState(null, '', '/');
    HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
    HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
    cooldownActiveRating = null;

    getBridgeStateMock.mockReset().mockResolvedValue({
      actions: ['RATE_ACCOUNT'],
      isHomeBridge: true,
      ui: 'test',
    } as BridgeState);
    getNodeStatusMock.mockReset().mockResolvedValue({ height: 10, isSynchronizing: false });
    getTrustSummaryMock.mockReset().mockResolvedValue({} as TrustSummary);
    getTrustPolicyMock.mockReset().mockResolvedValue({} as TrustPolicy);
    getTrustDerivationPageMock.mockReset().mockResolvedValue({ derivations: [TARGET_DERIVATION], total: 1 });
    getTrustChangesMock.mockReset().mockResolvedValue([]);
    getTrustProfileMock.mockReset().mockResolvedValue({
      targetPublicKey: 'targetPub',
      targetAddress: 'Qtarget',
      trustStatus: 'SILVER',
      trustStatusValue: 3,
      trustWeightPercent: 50,
      trustAllowsMinting: true,
      blocksMinted: 10,
      effectiveVoteWeight: 1,
      activeWeightCategory: 'SUBJECT',
      mintingSeedMember: true,
      categories: [],
    } as unknown as AccountTrustProfile);
    getTrustExplanationMock.mockReset().mockResolvedValue({
      targetPublicKey: 'targetPub',
      targetAddress: 'Qtarget',
      trustStatus: 'SILVER',
      trustStatusValue: 3,
      trustWeightPercent: 50,
      activeWeightCategory: 'SUBJECT',
      mintingSeedMember: true,
      categories: [],
    } as unknown as AccountTrustExplanation);
    getAccountRatingsPageMock.mockReset().mockResolvedValue({ ratings: [], nextOffset: null });
    resolveSelfAccountMock.mockReset().mockResolvedValue(SELF);
    ensureAccountUnlockedMock.mockReset().mockResolvedValue(SELF);
    submitRatingMock.mockReset().mockResolvedValue({ accepted: true } as never);
    getRatingPreviewMock.mockReset().mockResolvedValue({ canSubmit: true } as never);
    // Must resolve one profile per requested address (as the real bridge call does) — an address
    // that never gets a profile stays "missing" forever, which re-triggers this effect on every
    // render and spins the app in an infinite loop.
    loadIdentityProfilesMock.mockReset().mockImplementation(async (addresses: string[]) =>
      addresses.map((address) => ({ address, avatarSrc: null, name: null })),
    );

    getRatingCooldownMock.mockReset().mockImplementation(async () => cooldown({ activeRating: cooldownActiveRating }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it.each(['SUBJECT', 'PLAYER', 'TRAINER', 'MANAGER'] as const)('opens and submits the feed role %s without leaving the list', async (role) => {
    localStorage.setItem('qortium-trust.showAllRoles', 'true');
    render(<App />);
    await flush();
    const roleName = { SUBJECT: 'Minters', PLAYER: 'Voters', TRAINER: 'Guides', MANAGER: 'Designers' }[role];
    fireEvent.click(screen.getByRole('button', { name: `Rate ${roleName} — Qtarget` }));
    await flush();
    expect(screen.getByRole('dialog', { name: `Qtarget ${roleName}` })).toBeTruthy();
    expect(window.location.search).toBe('');
    expect(getRatingCooldownMock).toHaveBeenLastCalledWith(expect.objectContaining({ category: role, target: 'targetPub' }));
    fireEvent.click(screen.getByRole('button', { name: role === 'SUBJECT' ? 'Yes' : 'Positive' }));
    fireEvent.click(screen.getByRole('button', { name: 'Medium (2)' }));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Submit rating' }));
    await flush();
    expect(submitRatingMock).toHaveBeenCalledExactlyOnceWith({ category: role, rating: 2, targetPublicKey: 'targetPub' });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await flush();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Open Qtarget' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: `Rate ${roleName} — Qtarget` }));
    await flush();
    expect((screen.getByRole('button', { name: 'Pending...' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Medium (2)' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Qtarget' }));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${roleName}`) }));
    await flush();
    expect(document.querySelector('.detail-role-workspace')?.getAttribute('data-role')).toBe(role);
    expect((screen.getByRole('button', { name: 'Pending...' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps the rating dialog mounted during unlock/broadcast, then permits dismissal', async () => {
    localStorage.setItem('qortium-trust.showAllRoles', 'true');
    let finishUnlock!: (account: SelfAccount) => void;
    ensureAccountUnlockedMock.mockImplementationOnce(() => new Promise(resolve => { finishUnlock = resolve; }));
    render(<App />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Rate Voters — Qtarget' }));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Positive' }));
    fireEvent.click(screen.getByRole('button', { name: 'Medium (2)' }));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Submit rating' }));
    await flush();
    expect((screen.getByRole('button', { name: 'Dismiss' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    finishUnlock(SELF);
    await flush();
    expect(submitRatingMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await flush();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('returns through linked accounts and keeps browser Forward usable', async () => {
    const other = { ...TARGET_DERIVATION, accountAddress: 'Qother', accountPublicKey: 'otherPub' };
    getTrustDerivationPageMock.mockResolvedValue({ derivations: [TARGET_DERIVATION, other], total: 2 });
    getTrustExplanationMock.mockImplementation(async (publicKey) => ({
      targetPublicKey: publicKey, targetAddress: publicKey === 'targetPub' ? 'Qtarget' : 'Qother',
      trustStatus: 'SILVER', trustStatusValue: 3, trustWeightPercent: 70,
      activeWeightCategory: 'SUBJECT', mintingSeedMember: true,
      categories: [{ category: 'SUBJECT', level: 2, mappedTrustStatus: 'SILVER',
        score: 10, levelScore: 10, levelScoreCap: 100, mappedTrustStatusValue: 3, mappedTrustWeightPercent: 70,
        inboundRatings: counts(), positiveMinBranchCount: 2, suspiciousThreshold: -100,
        suspiciousLevelScoreCap: 100, suspiciousMinRaterCount: 2, suspiciousMinBranchCount: 2, suspiciousMinRatingConfidence: 2,
        configuredLevels: [], requirements: [], topNegativeImpacts: [],
        topPositiveImpacts: [{ raterAddress: publicKey === 'targetPub' ? 'Qother' : 'Qtarget', impact: 10, rating: 2,
          raterPublicKey: publicKey === 'targetPub' ? 'otherPub' : 'targetPub', ratingDirection: 'POSITIVE',
          ratingConfidence: 2, evaluatorLevel: 2, evaluatorScore: 10, trustBranchKeys: [], trustBranchCount: 0 }],
      }],
    }));
    render(<App />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Open Qtarget' }));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Qother' }));
    await flush();
    expect(window.location.search).toContain('account=Qother');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    await flush();
    expect(screen.getByRole('heading', { name: 'Qtarget' })).toBeTruthy();
    expect(window.location.search).toContain('account=Qtarget');
    await act(async () => { window.history.forward(); await vi.advanceTimersByTimeAsync(50); });
    await flush();
    expect(screen.getByRole('heading', { name: 'Qother' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    await flush();
    expect(screen.getByRole('button', { name: 'Open Qtarget' })).toBeTruthy();
    expect(window.location.search).toBe('');
  });

  it('keeps a direct-link Back inside the app and preserves display parameters', async () => {
    window.history.replaceState(null, '', '/?account=Qtarget&theme=dark');
    render(<App />);
    await flush();
    expect(screen.getByRole('heading', { name: 'Qtarget' })).toBeTruthy();
    const length = window.history.length;
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await flush();
    expect(screen.getByRole('button', { name: 'Open Qtarget' })).toBeTruthy();
    expect(window.location.search).toBe('?theme=dark');
    expect(window.history.length).toBe(length);
  });

  it('excludes non-members in recent and other sorts, including the directory summary', async () => {
    const outsider = { ...TARGET_DERIVATION, accountAddress: 'Qoutsider', accountPublicKey: 'outsiderPub', mintingSeedMember: false };
    getTrustDerivationPageMock.mockResolvedValue({ derivations: [TARGET_DERIVATION, outsider], total: 2 });
    render(<App />);
    await flush(20);
    expect(getTrustDerivationPageMock).toHaveBeenCalledWith(expect.objectContaining({ live: true, seedMember: true }));
    expect(screen.queryByRole('button', { name: /Open Qoutsider/ })).toBeNull();
    expect(document.querySelectorAll('tbody tr')).toHaveLength(1);
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort by' }), { target: { value: 'blocksMinted' } });
    await flush(20);
    expect(document.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(document.querySelector('.network-summary-strip')?.textContent).toContain('1 Silver');
  });

  it('keeps the role toggle available inside account detail', async () => {
    await renderAppAtAccountDetail();
    const toggle = screen.getByRole('checkbox', { name: 'Show all roles' });
    expect(toggle.closest('nav')).toBeTruthy();
    if (!(toggle as HTMLInputElement).checked) fireEvent.click(toggle);
    await flush();
    expect(screen.getByRole('region', { name: 'Trust roles' })).toBeTruthy();
    fireEvent.click(toggle);
    await flush();
    expect(screen.queryByRole('region', { name: 'Trust roles' })).toBeNull();
    expect(screen.getByRole('button', { name: /submit rating|remove rating/i })).toBeTruthy();
  });

  it.each(['refresh', 'sort'])('labels the fallback honestly and retries through %s', async (retry) => {
    vi.mocked(loadRecentDirectory).mockRejectedValueOnce(new Error('history incomplete'));
    render(<App />);
    await flush();
    expect(screen.getByText(/Recent activity unavailable/)).toBeTruthy();
    expect((screen.getByRole('combobox', { name: 'Sort by' }) as HTMLSelectElement).value).toBe('account');
    if (retry === 'refresh') fireEvent.click(screen.getByRole('button', { name: 'Refresh trust data' }));
    else fireEvent.change(screen.getByRole('combobox', { name: 'Sort by' }), { target: { value: 'latestRating' } });
    await flush();
    expect(screen.queryByText(/Recent activity unavailable/)).toBeNull();
    expect((screen.getByRole('combobox', { name: 'Sort by' }) as HTMLSelectElement).value).toBe('latestRating');
  });

  it('clears the pending entry once the confirmation poll sees the rating active', async () => {
    const submit = await renderAppAtAccountDetail();

    // Two-step Minter chooser: Yes + Medium confidence = +2 (equivalent to the old combobox pick).
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Medium (2)' }));
    await flush();
    expect(submit.disabled).toBe(false);

    fireEvent.click(submit);
    await flush();

    expect(submitRatingMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/waiting for block confirmation/i)).toBeTruthy();

    // The rating is now active on-chain (as the next cooldown fetch will report) — advance past one
    // poll interval so the app's confirmation poll picks it up.
    cooldownActiveRating = 2;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PENDING_CONFIRM_POLL_MS + 100);
    });
    await flush();

    expect(screen.queryByText(/waiting for block confirmation/i)).toBeNull();
    expect(screen.getByText(/current rating/i)).toBeTruthy();
  });

  it('times out an unconfirmed pending rating after 3 minutes, then Retry resumes tracking and Dismiss removes it', async () => {
    const submit = await renderAppAtAccountDetail();

    // Two-step Minter chooser: Yes + Medium confidence = +2 (equivalent to the old combobox pick).
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Medium (2)' }));
    await flush();
    fireEvent.click(submit);
    await flush();

    expect(screen.getByText(/waiting for block confirmation/i)).toBeTruthy();

    // Never confirms (cooldownActiveRating stays null) — advance well past the 3-minute cap.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PENDING_CONFIRM_TIMEOUT_MS + PENDING_CONFIRM_POLL_MS * 2);
    });
    await flush();

    expect(screen.queryByText(/waiting for block confirmation/i)).toBeNull();
    expect(screen.getByText(/still not confirmed/i)).toBeTruthy();
    const retryButton = screen.getByRole('button', { name: /retry/i });

    fireEvent.click(retryButton);
    await flush();

    // Retry re-arms the spinner/waiting state instead of the timeout notice.
    expect(screen.queryByText(/still not confirmed/i)).toBeNull();
    expect(screen.getByText(/waiting for block confirmation/i)).toBeTruthy();

    // Time out again, then Dismiss instead of retrying.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PENDING_CONFIRM_TIMEOUT_MS + PENDING_CONFIRM_POLL_MS * 2);
    });
    await flush();

    expect(screen.getByText(/still not confirmed/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    await flush();

    expect(screen.queryByText(/still not confirmed/i)).toBeNull();
    expect(screen.queryByText(/waiting for block confirmation/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /dismiss/i })).toBeNull();
  });

  it('does not clear a pending rating when a SELECTED_ACCOUNT_CHANGED-style message arrives', async () => {
    const submit = await renderAppAtAccountDetail();

    // Two-step Minter chooser: Yes + Medium confidence = +2 (equivalent to the old combobox pick).
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Medium (2)' }));
    await flush();
    fireEvent.click(submit);
    await flush();

    expect(screen.getByText(/waiting for block confirmation/i)).toBeTruthy();

    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: { action: 'SELECTED_ACCOUNT_CHANGED' } }));
    });
    await flush();

    // The account-follow revert (item #1): the app must not react to this message at all, so the
    // pending rating (and the account it's bound to) survives untouched.
    expect(resolveSelfAccountMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/waiting for block confirmation/i)).toBeTruthy();
  });
});
