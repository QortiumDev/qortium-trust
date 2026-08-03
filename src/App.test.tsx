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
  mintingSeedMember: false,
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
    // Only fake setTimeout/Date (what the poll loop and the timeout check use). Leaving
    // queueMicrotask/MessageChannel untouched keeps React's own effect-flushing scheduler (used by
    // `act()`) running normally, otherwise `act()` calls made under fake timers hang forever.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    // Each App mount reads the route from window.location on its first effect — reset it so a
    // previous test's navigateToRoute() push doesn't leak into the next test's fresh render.
    window.history.replaceState(null, '', '/');
    cooldownActiveRating = null;

    getBridgeStateMock.mockReset().mockResolvedValue({
      actions: ['RATE_ACCOUNT'],
      isHomeBridge: true,
      ui: 'test',
    } as BridgeState);
    getNodeStatusMock.mockReset().mockResolvedValue({});
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
      mintingSeedMember: false,
      categories: [],
    } as unknown as AccountTrustProfile);
    getTrustExplanationMock.mockReset().mockResolvedValue({
      targetPublicKey: 'targetPub',
      targetAddress: 'Qtarget',
      trustStatus: 'SILVER',
      trustStatusValue: 3,
      trustWeightPercent: 50,
      activeWeightCategory: 'SUBJECT',
      mintingSeedMember: false,
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

  it('clears the pending entry once the confirmation poll sees the rating active', async () => {
    const submit = await renderAppAtAccountDetail();

    // Two-step Minter chooser: Yes + Medium confidence = +2 (equivalent to the old combobox pick).
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Medium' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Medium' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Medium' }));
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
