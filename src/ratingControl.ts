import { useEffect, useState } from 'react';
import { ensureAccountUnlocked, getRatingCooldown, resolveSelfAccount, submitRating } from './trustApi';
import type { AccountRatingCategory, AccountRatingCooldown, SelfAccount } from './types';
import type { PendingRatingEntry } from './viewTypes';

export const RATING_VALUES = [4, 3, 2, 1, 0, -1, -2, -3, -4];
export const RATING_MAGNITUDES = ['', 'Low', 'Medium', 'High', 'Very high'];
export const PENDING_CONFIRM_POLL_MS = 8000;

export function pendingRatingKey(category: AccountRatingCategory, targetAddress: string) {
  return `${category}:${targetAddress}`;
}

export function ratingOptionLabel(value: number) {
  if (value === 0) {
    return '0 · Remove rating';
  }

  const tone = value > 0 ? 'Positive' : 'Negative';

  return `${value > 0 ? '+' : ''}${value} · ${tone} (${RATING_MAGNITUDES[Math.abs(value)]})`;
}

export function mapRatingError(message: string) {
  const checks: [RegExp, string][] = [
    [/TOO_SOON/i, 'You rated this account too recently. Wait for the cooldown to clear before changing it.'],
    [/CANNOT_RATE_SELF/i, 'You cannot rate your own account.'],
    [/PUBLIC_KEY_UNKNOWN/i, 'This account has no on-chain history yet, so it cannot be rated.'],
    [/UNCHANGED/i, 'That rating matches your current rating — nothing to change.'],
    [/INVALID_ACCOUNT_RATING/i, 'Rating must be a whole number between -4 and +4.'],
    [/NO_BALANCE/i, 'Your account has insufficient balance to cover the transaction fee.'],
    [/NEEDS_SYNC|SYNCHRONIZ/i, 'Your node is still syncing. Try again once it has caught up.'],
  ];

  for (const [pattern, text] of checks) {
    if (pattern.test(message)) {
      return text;
    }
  }

  return message;
}

// Pure: a selection is "unchanged" when it equals the rater's current active rating for this target.
// With no active rating (null), 0 ("remove") is the no-op selection.
export function isRatingUnchanged(rating: number, activeRating: number | null) {
  return activeRating === null ? rating === 0 : rating === activeRating;
}

// Pure: every gate that disables the submit button. Kept side-effect-free so it is unit-testable in
// isolation and so the hook and any future caller agree on exactly when submission is allowed.
export function isSubmitDisabled(args: {
  cooldownLoading: boolean;
  isPending: boolean;
  onCooldown: boolean;
  submitting: boolean;
  unchanged: boolean;
}) {
  return args.submitting || args.cooldownLoading || args.onCooldown || args.unchanged || args.isPending;
}

export type RatingControlArgs = {
  category: AccountRatingCategory;
  onSubmitted: (entry: PendingRatingEntry) => void;
  pendingRating: number | undefined;
  ratingActionAvailable: boolean;
  self: SelfAccount | null;
  targetAddress: string;
  targetPublicKey: string;
};

// Single source of truth for rating cooldown/unlock/submit/gating logic, shared by the full-mode
// RatingForm (detail view) and the compact RatingPopover (inline quick-rate). All hooks run
// unconditionally — the cooldown effect internally no-ops when !canInteract — so consumers must
// render the unavailable state from `canInteract`/`note` rather than the hook short-circuiting.
export function useRatingControl({
  category,
  onSubmitted,
  pendingRating,
  ratingActionAvailable,
  self,
  targetAddress,
  targetPublicKey,
}: RatingControlArgs) {
  const isSelf = !!self && self.address === targetAddress;
  const raterPublicKey = self?.publicKey ?? null;
  const canInteract = ratingActionAvailable && !!self && !!raterPublicKey && !isSelf;
  const isPending = pendingRating !== undefined;

  const [rating, setRating] = useState(0);
  const [cooldown, setCooldown] = useState<AccountRatingCooldown | null>(null);
  const [cooldownLoading, setCooldownLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'positive' | 'negative' } | null>(null);

  // Refetch cooldown on mount and whenever this account's pending state flips, so that once the
  // rating confirms (pendingRating clears) "your current rating" reflects the new on-chain value.
  useEffect(() => {
    if (!canInteract || !raterPublicKey) {
      setCooldown(null);
      return;
    }

    let cancelled = false;
    setCooldownLoading(true);

    getRatingCooldown({ category, rater: raterPublicKey, target: targetPublicKey })
      .then((result) => {
        if (cancelled) {
          return;
        }

        setCooldown(result);
        setRating(result.activeRating ?? 0);
      })
      .catch(() => {
        if (!cancelled) {
          setCooldown(null);
          // Without cooldown data we cannot trust a carried-over selection; reset to a no-op.
          setRating(0);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCooldownLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [canInteract, category, pendingRating, raterPublicKey, targetPublicKey]);

  let note = 'Open this app in Qortium Home to submit trust ratings.';

  if (ratingActionAvailable && !self) {
    note = 'Sign in to a Qortium Home account to submit trust ratings.';
  } else if (ratingActionAvailable && isSelf) {
    note = 'You cannot rate your own account.';
  } else if (ratingActionAvailable && self && !raterPublicKey) {
    note = 'Your account needs at least one on-chain transaction before it can submit ratings.';
  }

  const activeRating = cooldown?.activeRating ?? null;
  const unchanged = isRatingUnchanged(rating, activeRating);
  const onCooldown = cooldown ? !cooldown.canChangeNow : false;
  const accountLocked = self?.isUnlocked === false;
  const submitDisabled = isSubmitDisabled({ cooldownLoading, isPending, onCooldown, submitting, unchanged });

  // Returns true only on a successful broadcast so callers (the quick-rate popover) get a reliable
  // success signal: reading `message` after the await would see the stale render-time value.
  const handleSubmit = async (): Promise<boolean> => {
    if (!raterPublicKey) {
      return false;
    }

    const submittedRating = rating;
    setSubmitting(true);
    setMessage(null);

    try {
      // Signing needs an unlocked account; ask Home to unlock (prompts the user only when locked).
      // UNLOCK_SELECTED_ACCOUNT resolves (never rejects) on cancel/timeout with isUnlocked false,
      // so we drive entirely off the returned lock state.
      const unlocked = await ensureAccountUnlocked();

      if (!unlocked) {
        setMessage({ text: 'Qortium Home could not confirm your account is unlocked. Try again.', tone: 'negative' });
        return false;
      }

      if (unlocked.isUnlocked === false) {
        setMessage({ text: 'Unlock your account in Qortium Home to submit a rating.', tone: 'negative' });
        return false;
      }

      // Home derives RATE_ACCOUNT's raterPublicKey from whichever account is actually unlocked, which
      // can differ from our cached `self` (the user may have switched accounts in Home since we resolved
      // it). If so, re-resolve self so our optimistic pending entry carries the rater that will actually
      // sign — otherwise the confirmation poll would track the wrong rater and never clear the spinner.
      let effectiveRaterPublicKey = raterPublicKey;

      if (unlocked.address && unlocked.address !== self?.address) {
        const refreshed = await resolveSelfAccount();

        if (!refreshed?.publicKey) {
          setMessage({
            text: 'Your unlocked account has no on-chain history yet, so it cannot submit ratings.',
            tone: 'negative',
          });
          return false;
        }

        // Cannot rate yourself, even after the account switch surfaced a different self.
        if (refreshed.address === targetAddress) {
          setMessage({ text: 'You cannot rate your own account.', tone: 'negative' });
          return false;
        }

        effectiveRaterPublicKey = refreshed.publicKey;
      }

      // submitRating resolves once Home has broadcast (accepted) the transaction. We hand the
      // pending entry up to the app, which tracks confirmation — neither surface blocks afterward, so
      // the user can immediately rate other accounts.
      await submitRating({ category, rating: submittedRating, targetPublicKey });
      onSubmitted({ category, rating: submittedRating, raterPublicKey: effectiveRaterPublicKey, targetAddress, targetPublicKey });
      return true;
    } catch (submitError) {
      setMessage({
        text: mapRatingError(submitError instanceof Error ? submitError.message : String(submitError)),
        tone: 'negative',
      });
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  return {
    accountLocked,
    activeRating,
    canInteract,
    cooldown,
    cooldownLoading,
    handleSubmit,
    isPending,
    message,
    note,
    onCooldown,
    rating,
    setRating,
    submitDisabled,
    submitting,
    unchanged,
  };
}

export type RatingControl = ReturnType<typeof useRatingControl>;
