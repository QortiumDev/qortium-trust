import { useEffect, useRef, useState } from 'react';
import {
  ensureAccountUnlocked,
  getRatingCooldown,
  getRatingPreview,
  resolveSelfAccount,
  submitRating,
} from './trustApi';
import type { AccountRatingCategory, AccountRatingCooldown, RatingImpactPreview, SelfAccount } from './types';
import type { PendingRatingEntry, PendingValueByAccountCategory, RatingValuesByAccountCategory } from './viewTypes';
import { t } from './i18n';
import { ratingSignedLabel } from './format';

// Debounce preview requests so scrubbing through the rating selector doesn't fire a request per step.
const PREVIEW_DEBOUNCE_MS = 400;

export const RATING_VALUES = [4, 3, 2, 1, 0, -1, -2, -3, -4];
export const PENDING_CONFIRM_POLL_MS = 8000;
// A pending rating that hasn't confirmed after this long transitions to a "not confirmed" state
// (Retry/Dismiss) instead of polling forever.
export const PENDING_CONFIRM_TIMEOUT_MS = 3 * 60 * 1000;

export function pendingRatingKey(category: AccountRatingCategory, targetAddress: string) {
  return `${category}:${targetAddress}`;
}

export type DisplayedRating = {
  pending: boolean;
  value: number | undefined;
};

// Single source of truth for the "you rated" pending-vs-confirmed display state: while a pending
// (optimistic, unconfirmed) entry exists for this (category, targetAddress) it wins — with
// `pending: true` so callers can render the spinner/muted styling — otherwise the confirmed,
// on-chain rating is shown. `confirmedByKey` may be omitted when a caller only wants the pending
// value itself (e.g. to feed RatingForm's own pending gate).
export function getDisplayedRating(
  pendingByKey: PendingValueByAccountCategory | undefined,
  confirmedByKey: RatingValuesByAccountCategory | undefined,
  category: AccountRatingCategory,
  targetAddress: string,
): DisplayedRating {
  const key = pendingRatingKey(category, targetAddress);
  const pendingEntry = pendingByKey?.[key];
  const pendingValue = typeof pendingEntry === 'number' ? pendingEntry : pendingEntry?.rating;

  return {
    pending: pendingValue !== undefined,
    value: pendingValue ?? confirmedByKey?.[key],
  };
}

// Option-list rendering (e.g. the compact quick-rate popover's <select>): 0 is "Clear rating", any
// other value is the decomposed sign+magnitude form (role wording — no category is known here).
export function ratingOptionLabel(value: number) {
  if (value === 0) {
    return t('rating.option.remove');
  }

  return ratingSignedLabel(value, 'role');
}

export type TwoStepAnswer = 'yes' | 'no' | 'clear' | 'notSure';

// Pure mapping table for the two-step Minter/role rating flow (Stage B): Yes/Positive + confidence
// -> +confidence, No/Negative + confidence -> -confidence, Clear -> 0. Returns null while the
// selection is not yet resolvable (an answer picked but no confidence yet, or "Not sure yet" — which
// deliberately never resolves to a value, since it must never submit anything).
export function resolveTwoStepRating(answer: TwoStepAnswer | null, confidence: 1 | 2 | 3 | 4 | null): number | null {
  if (answer === 'clear') {
    return 0;
  }

  if (answer === 'yes' && confidence) {
    return confidence;
  }

  if (answer === 'no' && confidence) {
    return -confidence;
  }

  return null;
}

// How much the given rater's rating currently counts toward `category`'s score, read from a
// GET /account-ratings/preview response's previewSelectedCategory.impacts (populated in full by
// Core — see the RatingImpactPreview type comment). Returns null when there is nothing to report yet
// (no preview, or the preview has no impacts data — degrade gracefully rather than guess), and 0 when
// the preview loaded but this rater has no entry (their rating does not count at all).
export function raterCategoryImpact(
  preview: RatingImpactPreview | null | undefined,
  raterAddress: string | null | undefined,
): number | null {
  const impacts = preview?.previewSelectedCategory?.impacts;

  if (!impacts || !raterAddress) {
    return null;
  }

  return impacts.find((impact) => impact.raterAddress === raterAddress)?.impact ?? 0;
}

export function mapRatingError(message: string) {
  const checks: [RegExp, string][] = [
    [/TOO_SOON/i, t('error.ratingTooSoon')],
    [/CANNOT_RATE_SELF/i, t('error.cannotRateSelf')],
    [/PUBLIC_KEY_UNKNOWN/i, t('error.accountHistory')],
    [/UNCHANGED/i, t('error.ratingUnchanged')],
    [/INVALID_ACCOUNT_RATING/i, t('error.ratingRange')],
    [/NO_BALANCE/i, t('error.balance')],
    [/NEEDS_SYNC|SYNCHRONIZ/i, t('error.nodeSyncing')],
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
  previewInvalid?: boolean;
  submitting: boolean;
  unchanged: boolean;
}) {
  return (
    args.submitting ||
    args.cooldownLoading ||
    args.onCooldown ||
    args.unchanged ||
    args.isPending ||
    !!args.previewInvalid
  );
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
  const draftEditedRef = useRef(false);
  const [cooldown, setCooldown] = useState<AccountRatingCooldown | null>(null);
  const [cooldownLoading, setCooldownLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'positive' | 'negative' } | null>(null);
  // Live preview of the selected rating's validity + trust impact (#33). Null while loading or when
  // the selection is a no-op, so it only ever reflects the latest settled fetch for the current rating.
  const [preview, setPreview] = useState<RatingImpactPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Tracks whether this hook instance has ever loaded a cooldown successfully, so a later refetch
  // failure (e.g. a transient Core hiccup while polling for confirmation) can be told apart from the
  // initial load failing outright.
  const hasLoadedCooldownRef = useRef(false);

  // Refetch cooldown on mount and whenever this account's pending state flips, so that once the
  // rating confirms (pendingRating clears) "your current rating" reflects the new on-chain value.
  useEffect(() => {
    if (!canInteract || !raterPublicKey) {
      setCooldown(null);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setCooldownLoading(true);

    // Refresh only this open editor, serially. Background cooldown refreshes must not
    // replace an opinion the user is currently composing or reset a failed refetch to zero.
    const refresh = async (initial: boolean) => {
      let shouldRefresh = true;
      try {
        const result = await getRatingCooldown({ category, rater: raterPublicKey, target: targetPublicKey });
        if (cancelled) return;
        if (initial || (!hasLoadedCooldownRef.current && !draftEditedRef.current)) {
          setRating(result.activeRating ?? 0);
        }
        hasLoadedCooldownRef.current = true;
        setCooldown(result);
        shouldRefresh = !result.canChangeNow;
      } catch {
        if (cancelled) return;
        if (!hasLoadedCooldownRef.current) {
          setCooldown(null);
          if (!draftEditedRef.current) setRating(0);
        }
      } finally {
        if (!cancelled) {
          setCooldownLoading(false);
          if (shouldRefresh && pendingRating === undefined) {
            timer = setTimeout(() => void refresh(false), PENDING_CONFIRM_POLL_MS);
          }
        }
      }
    };
    void refresh(true);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [canInteract, category, pendingRating, raterPublicKey, targetPublicKey]);

  let note = t('error.appUnavailable');

  if (ratingActionAvailable && !self) {
    note = t('error.signInToRate');
  } else if (ratingActionAvailable && isSelf) {
    note = t('error.cannotRateSelf');
  } else if (ratingActionAvailable && self && !raterPublicKey) {
    note = t('error.accountHistory');
  }

  const activeRating = cooldown?.activeRating ?? null;
  const unchanged = isRatingUnchanged(rating, activeRating);
  const onCooldown = cooldown ? !cooldown.canChangeNow : false;
  const accountLocked = self?.isUnlocked === false;

  // Preview the selected rating before signing. Only for a real, submittable-shaped change; cleared
  // immediately when the selection changes so `preview` never reflects a stale rating value.
  useEffect(() => {
    if (!canInteract || !raterPublicKey || unchanged || isPending) {
      setPreview(null);
      setPreviewLoading(false);
      return;
    }

    let cancelled = false;
    setPreview(null);
    setPreviewLoading(true);

    const timer = setTimeout(() => {
      getRatingPreview({ category, rater: raterPublicKey, rating, target: targetPublicKey })
        .then((result) => {
          if (!cancelled) {
            setPreview(result);
          }
        })
        .catch(() => {
          // A failed preview must never block submission — fall back to the existing gates + Home's
          // own pre-broadcast validation.
          if (!cancelled) {
            setPreview(null);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setPreviewLoading(false);
          }
        });
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [canInteract, category, isPending, onCooldown, raterPublicKey, rating, targetPublicKey, unchanged]);

  // Only a settled preview for the current rating gates submit; while loading/absent we defer to the
  // other gates and Home's validation, so preview latency never blocks an otherwise-valid rating.
  const previewInvalid = !!preview && !preview.canSubmit;
  const submitDisabled = isSubmitDisabled({
    cooldownLoading,
    isPending,
    onCooldown,
    previewInvalid,
    submitting,
    unchanged,
  });

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
        setMessage({ text: t('error.unlockConfirmFailed'), tone: 'negative' });
        return false;
      }

      if (unlocked.isUnlocked === false) {
        setMessage({ text: t('error.accountLocked'), tone: 'negative' });
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
            text: t('error.accountHistory'),
            tone: 'negative',
          });
          return false;
        }

        // Cannot rate yourself, even after the account switch surfaced a different self.
        if (refreshed.address === targetAddress) {
          setMessage({ text: t('error.cannotRateSelf'), tone: 'negative' });
          return false;
        }

        effectiveRaterPublicKey = refreshed.publicKey;
      }

      // submitRating resolves once Home has broadcast (accepted) the transaction. We hand the
      // pending entry up to the app, which tracks confirmation — neither surface blocks afterward, so
      // the user can immediately rate other accounts.
      await submitRating({ category, rating: submittedRating, targetPublicKey });
      onSubmitted({
        category,
        rating: submittedRating,
        raterPublicKey: effectiveRaterPublicKey,
        submittedAt: Date.now(),
        targetAddress,
        targetPublicKey,
      });
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
    preview,
    previewInvalid,
    previewLoading,
    rating,
    setRating: (value: number) => {
      draftEditedRef.current = true;
      setRating(value);
    },
    submitDisabled,
    submitting,
    unchanged,
  };
}

export type RatingControl = ReturnType<typeof useRatingControl>;
