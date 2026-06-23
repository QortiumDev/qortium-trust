// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { createElement, useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isRatingUnchanged,
  isSubmitDisabled,
  mapRatingError,
  useRatingControl,
  type RatingControl,
  type RatingControlArgs,
} from './ratingControl';
import { ensureAccountUnlocked, getRatingCooldown, resolveSelfAccount, submitRating } from './trustApi';
import type { AccountRatingCooldown, SelfAccount } from './types';
import type { PendingRatingEntry } from './viewTypes';

vi.mock('./trustApi', () => ({
  ensureAccountUnlocked: vi.fn(),
  getRatingCooldown: vi.fn(),
  resolveSelfAccount: vi.fn(),
  submitRating: vi.fn(),
}));

const ensureAccountUnlockedMock = vi.mocked(ensureAccountUnlocked);
const getRatingCooldownMock = vi.mocked(getRatingCooldown);
const resolveSelfAccountMock = vi.mocked(resolveSelfAccount);
const submitRatingMock = vi.mocked(submitRating);

describe('rating predicates (pure)', () => {
  it('mapRatingError translates known wire errors and passes others through', () => {
    expect(mapRatingError('rejected: TOO_SOON to change')).toMatch(/cooldown/i);
    expect(mapRatingError('CANNOT_RATE_SELF')).toMatch(/your own account/i);
    expect(mapRatingError('PUBLIC_KEY_UNKNOWN')).toMatch(/no on-chain history/i);
    expect(mapRatingError('UNCHANGED')).toMatch(/unchanged/i);
    expect(mapRatingError('INVALID_ACCOUNT_RATING')).toMatch(/whole number/i);
    expect(mapRatingError('NO_BALANCE')).toMatch(/insufficient balance/i);
    expect(mapRatingError('NEEDS_SYNC now')).toMatch(/syncing/i);
    expect(mapRatingError('node is SYNCHRONIZING')).toMatch(/syncing/i);
    expect(mapRatingError('some unexpected failure')).toBe('some unexpected failure');
  });

  it('isRatingUnchanged treats 0 as the no-op when there is no active rating', () => {
    expect(isRatingUnchanged(0, null)).toBe(true);
    expect(isRatingUnchanged(1, null)).toBe(false);
    expect(isRatingUnchanged(2, 2)).toBe(true);
    expect(isRatingUnchanged(3, 2)).toBe(false);
    expect(isRatingUnchanged(0, 2)).toBe(false);
  });

  it('isSubmitDisabled is true when any gate is set and false only when all clear', () => {
    const clear = { cooldownLoading: false, isPending: false, onCooldown: false, submitting: false, unchanged: false };

    expect(isSubmitDisabled(clear)).toBe(false);
    expect(isSubmitDisabled({ ...clear, submitting: true })).toBe(true);
    expect(isSubmitDisabled({ ...clear, cooldownLoading: true })).toBe(true);
    expect(isSubmitDisabled({ ...clear, onCooldown: true })).toBe(true);
    expect(isSubmitDisabled({ ...clear, unchanged: true })).toBe(true);
    expect(isSubmitDisabled({ ...clear, isPending: true })).toBe(true);
    expect(isSubmitDisabled({ ...clear, previewInvalid: true })).toBe(true);
    expect(isSubmitDisabled({ ...clear, previewInvalid: false })).toBe(false);
  });
});

// Test harness: mount the hook, expose its latest return value, and let tests drive it.
function Harness({ args, onControl }: { args: RatingControlArgs; onControl: (control: RatingControl) => void }) {
  const control = useRatingControl(args);

  useEffect(() => {
    onControl(control);
  });

  return null;
}

const SELF: SelfAccount = { address: 'Qrater', publicKey: 'raterPub', name: 'rater', isUnlocked: true };

// Flush the mount-time cooldown effect (which calls setRating(activeRating ?? 0)) so a subsequent
// setRating in a test is not clobbered when that promise resolves a tick later.
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function cooldown(overrides: Partial<AccountRatingCooldown> = {}): AccountRatingCooldown {
  return {
    targetPublicKey: 'tPub',
    targetAddress: 'Qtarget',
    raterPublicKey: 'raterPub',
    raterAddress: 'Qrater',
    category: 'SUBJECT',
    activeRating: null,
    cooldownBlocks: 0,
    latestRatingChangeHeight: null,
    currentHeight: 100,
    candidateChangeHeight: 0,
    earliestAllowedHeight: 0,
    blocksRemaining: 0,
    canChangeNow: true,
    ...overrides,
  };
}

function mountControl(overrides: Partial<RatingControlArgs> = {}) {
  let latest: RatingControl | null = null;
  const submitted: PendingRatingEntry[] = [];
  const args: RatingControlArgs = {
    category: 'SUBJECT',
    onSubmitted: (entry) => submitted.push(entry),
    pendingRating: undefined,
    ratingActionAvailable: true,
    self: SELF,
    targetAddress: 'Qtarget',
    targetPublicKey: 'tPub',
    ...overrides,
  };

  render(createElement(Harness, { args, onControl: (control: RatingControl) => (latest = control) }));

  return {
    get control() {
      if (!latest) {
        throw new Error('control not mounted');
      }
      return latest;
    },
    submitted,
  };
}

describe('useRatingControl.handleSubmit unlock branches', () => {
  beforeEach(() => {
    ensureAccountUnlockedMock.mockReset();
    getRatingCooldownMock.mockReset();
    resolveSelfAccountMock.mockReset();
    submitRatingMock.mockReset();
    // Default: cooldown resolves clear with no active rating so the control is interactive.
    getRatingCooldownMock.mockResolvedValue(cooldown());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns false and surfaces a message when unlock yields null', async () => {
    ensureAccountUnlockedMock.mockResolvedValue(null);
    const harness = mountControl();
    await flush();

    await act(async () => {
      harness.control.setRating(2);
    });

    let result: boolean | undefined;
    await act(async () => {
      result = await harness.control.handleSubmit();
    });

    expect(result).toBe(false);
    expect(submitRatingMock).not.toHaveBeenCalled();
    expect(harness.control.message?.tone).toBe('negative');
    expect(harness.submitted).toHaveLength(0);
  });

  it('returns false when unlock resolves with isUnlocked:false', async () => {
    ensureAccountUnlockedMock.mockResolvedValue({ address: 'Qrater', publicKey: null, name: 'rater', isUnlocked: false });
    const harness = mountControl();
    await flush();

    await act(async () => {
      harness.control.setRating(2);
    });

    let result: boolean | undefined;
    await act(async () => {
      result = await harness.control.handleSubmit();
    });

    expect(result).toBe(false);
    expect(submitRatingMock).not.toHaveBeenCalled();
    expect(harness.control.message?.text).toMatch(/unlock your account/i);
  });

  it('submits and emits a pending entry on a successful unlock', async () => {
    ensureAccountUnlockedMock.mockResolvedValue({ address: 'Qrater', publicKey: null, name: 'rater', isUnlocked: true });
    submitRatingMock.mockResolvedValue({ signature: 'sig' } as never);
    const harness = mountControl();
    await flush();

    await act(async () => {
      harness.control.setRating(3);
    });

    let result: boolean | undefined;
    await act(async () => {
      result = await harness.control.handleSubmit();
    });

    expect(result).toBe(true);
    expect(submitRatingMock).toHaveBeenCalledWith({ category: 'SUBJECT', rating: 3, targetPublicKey: 'tPub' });
    // Same account unlocked, so no re-resolve and the cached rater public key is used.
    expect(resolveSelfAccountMock).not.toHaveBeenCalled();
    expect(harness.submitted).toEqual([
      { category: 'SUBJECT', rating: 3, raterPublicKey: 'raterPub', targetAddress: 'Qtarget', targetPublicKey: 'tPub' },
    ]);
  });

  it('re-resolves self when the unlocked account differs from the cached self (item #5)', async () => {
    ensureAccountUnlockedMock.mockResolvedValue({
      address: 'Qother',
      publicKey: null,
      name: 'other',
      isUnlocked: true,
    });
    resolveSelfAccountMock.mockResolvedValue({ address: 'Qother', publicKey: 'otherPub', name: 'other', isUnlocked: true });
    submitRatingMock.mockResolvedValue({ signature: 'sig' } as never);
    const harness = mountControl();
    await flush();

    await act(async () => {
      harness.control.setRating(2);
    });

    let result: boolean | undefined;
    await act(async () => {
      result = await harness.control.handleSubmit();
    });

    expect(result).toBe(true);
    expect(resolveSelfAccountMock).toHaveBeenCalledTimes(1);
    // The optimistic pending entry must carry the freshly-resolved rater, not the stale cached one.
    expect(harness.submitted).toEqual([
      { category: 'SUBJECT', rating: 2, raterPublicKey: 'otherPub', targetAddress: 'Qtarget', targetPublicKey: 'tPub' },
    ]);
  });

  it('aborts when the re-resolved self is the rating target (cannot rate self)', async () => {
    ensureAccountUnlockedMock.mockResolvedValue({
      address: 'Qtarget',
      publicKey: null,
      name: 'target',
      isUnlocked: true,
    });
    resolveSelfAccountMock.mockResolvedValue({ address: 'Qtarget', publicKey: 'targetPub', name: 'target', isUnlocked: true });
    const harness = mountControl();
    await flush();

    await act(async () => {
      harness.control.setRating(2);
    });

    let result: boolean | undefined;
    await act(async () => {
      result = await harness.control.handleSubmit();
    });

    expect(result).toBe(false);
    expect(submitRatingMock).not.toHaveBeenCalled();
    expect(harness.control.message?.text).toMatch(/your own account/i);
  });
});

describe('useRatingControl.submitDisabled gating', () => {
  beforeEach(() => {
    ensureAccountUnlockedMock.mockReset();
    getRatingCooldownMock.mockReset();
    resolveSelfAccountMock.mockReset();
    submitRatingMock.mockReset();
  });

  it('is disabled while the cooldown is still loading, then enabled for a valid new rating', async () => {
    let resolveCooldown!: (value: AccountRatingCooldown) => void;
    getRatingCooldownMock.mockReturnValue(
      new Promise<AccountRatingCooldown>((resolve) => {
        resolveCooldown = resolve;
      }),
    );
    const harness = mountControl();

    // While loading, unchanged (rating 0 / activeRating null) AND cooldownLoading both gate it.
    expect(harness.control.submitDisabled).toBe(true);

    await act(async () => {
      resolveCooldown(cooldown({ activeRating: null }));
    });
    await act(async () => {
      harness.control.setRating(2);
    });

    expect(harness.control.cooldownLoading).toBe(false);
    expect(harness.control.submitDisabled).toBe(false);
  });

  it('is disabled when the selection is unchanged from the active rating', async () => {
    getRatingCooldownMock.mockResolvedValue(cooldown({ activeRating: 2 }));
    const harness = mountControl();

    await act(async () => {
      // let the cooldown effect settle (sets rating to activeRating = 2)
    });

    expect(harness.control.rating).toBe(2);
    expect(harness.control.unchanged).toBe(true);
    expect(harness.control.submitDisabled).toBe(true);
  });

  it('is disabled while on cooldown', async () => {
    getRatingCooldownMock.mockResolvedValue(cooldown({ activeRating: 1, canChangeNow: false, blocksRemaining: 5 }));
    const harness = mountControl();
    await flush();

    await act(async () => {
      harness.control.setRating(3);
    });

    expect(harness.control.onCooldown).toBe(true);
    expect(harness.control.submitDisabled).toBe(true);
  });

  it('is disabled while a rating is pending confirmation', async () => {
    getRatingCooldownMock.mockResolvedValue(cooldown());
    const harness = mountControl({ pendingRating: 2 });
    await flush();

    await act(async () => {
      harness.control.setRating(3);
    });

    expect(harness.control.isPending).toBe(true);
    expect(harness.control.submitDisabled).toBe(true);
  });
});
