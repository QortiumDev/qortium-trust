import { Timer } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  categoryLabel,
  compactAddress,
  evaluatorRoleLabel,
  formatNumber,
  ratingSignedLabel,
  ratingVariantForCategory,
  roleNameForCategory,
  statusLabel,
} from '../format';
import type { AccountRatingCategory } from '../types';
import type { PendingRatingsByKey } from '../viewTypes';
import {
  mapRatingError,
  pendingRatingKey,
  raterCategoryImpact,
  RATING_VALUES,
  ratingOptionLabel,
  resolveTwoStepRating,
  useRatingControl,
  type RatingControl,
  type RatingControlArgs,
  type TwoStepAnswer,
} from '../ratingControl';
import { t } from '../i18n';

const CONFIDENCE_LEVELS = [1, 2, 3, 4] as const;

function confidenceLabel(level: 1 | 2 | 3 | 4) {
  switch (level) {
    case 1:
      return t('rating.magnitude.low');
    case 2:
      return t('rating.magnitude.medium');
    case 3:
      return t('rating.magnitude.high');
    case 4:
    default:
      return t('rating.magnitude.veryHigh');
  }
}

// One-line preview of the selected rating's validity + trust impact (#33). Blocks reasons reuse the
// same error mapping as a failed submit; an accepted change shows the resulting trust-status delta.
function RatingPreviewNote({ control }: { control: RatingControl }) {
  const { isPending, preview, previewInvalid, previewLoading } = control;

  if (isPending) {
    return null;
  }

  if (previewLoading) {
    return <p className="muted rating-preview">{t('rating.checkImpact')}</p>;
  }

  if (!preview) {
    return null;
  }

  if (previewInvalid) {
    return <p className="rating-message negative">{mapRatingError(preview.validationResult)}</p>;
  }

  if (preview.trustStatusChanged) {
    return (
      <p className="rating-message positive">
        {t('rating.impactChange', {
          from: statusLabel(preview.currentTrust.derivedTrustStatus),
          to: statusLabel(preview.previewTrust.derivedTrustStatus),
        })}
      </p>
    );
  }

  return <p className="muted rating-preview">{t('rating.noStatusChange')}</p>;
}

// "How much your rating counts" (#Stage B, task 3): reads the current rater's own contribution out
// of the live preview's per-category impacts list. Renders nothing while the preview itself has
// nothing to say (loading, unchanged selection, or an invalid candidate already explained by
// RatingPreviewNote) — degrades gracefully rather than guessing.
function RatingImpactNote({
  category,
  control,
  raterAddress,
}: {
  category: AccountRatingCategory;
  control: RatingControl;
  raterAddress: string | null | undefined;
}) {
  if (control.isPending || control.previewInvalid) {
    return null;
  }

  const impact = raterCategoryImpact(control.preview, raterAddress);

  if (impact === null) {
    return null;
  }

  if (impact !== 0) {
    return (
      <p className="muted rating-impact-note">
        {t('rating.impact.counts', { impact: formatNumber(Math.abs(impact)) })}
      </p>
    );
  }

  // Zero impact: this rater's rating does not count yet. MANAGER (Designer) ratings count through
  // the rater's own Designer influence pool rather than a separate evaluator role, so it gets its
  // own copy instead of "trusted as a {role}".
  if (category === 'MANAGER') {
    return <p className="muted rating-impact-note">{t('rating.impact.notCountedInfluence')}</p>;
  }

  const role = evaluatorRoleLabel(category);

  return role ? <p className="muted rating-impact-note">{t('rating.impact.notCounted', { role })}</p> : null;
}

// The two-step Minter/role rating chooser (#Stage B, tasks 1-2). Presentation-layer only: it decides
// *which* numeric rating is selected and hands it to `control.setRating`; submission itself still
// goes through useRatingControl's existing handleSubmit/preview/cooldown machinery untouched.
function RatingChooser({ category, control, pendingRating }: { category: AccountRatingCategory; control: RatingControl; pendingRating?: number }) {
  const isMinter = category === 'SUBJECT';
  const isDesigner = category === 'MANAGER';
  const disabled = !control.canInteract || control.submitting || control.cooldownLoading || control.isPending;
  const hasActiveRating = control.activeRating !== null && control.activeRating !== 0;

  const [answer, setAnswer] = useState<TwoStepAnswer | null>(null);
  const [confidence, setConfidence] = useState<1 | 2 | 3 | 4 | null>(null);
  // Seeds the chooser from an already-active rating exactly once, after the mount-time cooldown
  // fetch settles — never again, so it doesn't fight the user's own in-progress selection.
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current || (pendingRating === undefined && (!control.cooldown || control.cooldownLoading))) {
      return;
    }

    initializedRef.current = true;
    const active = pendingRating ?? control.activeRating;

    if (active) {
      setAnswer(active > 0 ? 'yes' : 'no');
      setConfidence(Math.min(Math.abs(active), 4) as 1 | 2 | 3 | 4);
    } else if (pendingRating === 0) {
      setAnswer('clear');
    }
  }, [control.activeRating, control.cooldown, control.cooldownLoading, pendingRating]);

  // Single place that keeps `control.rating` in sync with the two-step selection: whenever the
  // selection doesn't yet resolve to a concrete value (an answer picked but no confidence yet, or
  // "Not sure yet"), it falls back to the account's current active rating (or 0) — the no-op
  // selection — so a half-made choice can never be submitted as-is.
  const applySelection = (nextAnswer: TwoStepAnswer | null, nextConfidence: 1 | 2 | 3 | 4 | null) => {
    initializedRef.current = true;
    setAnswer(nextAnswer);
    setConfidence(nextConfidence);
    const resolved = resolveTwoStepRating(nextAnswer, nextConfidence);
    control.setRating(resolved ?? control.activeRating ?? 0);
  };

  const chooseAnswer = (next: 'yes' | 'no' | 'notSure') => {
    applySelection(next, next === 'notSure' ? null : confidence);
  };

  const chooseConfidence = (level: 1 | 2 | 3 | 4) => {
    applySelection(answer === 'yes' || answer === 'no' ? answer : null, level);
  };

  const chooseClear = () => applySelection('clear', null);

  const q1Label = isMinter
    ? t('rating.question.minter')
    : t('rating.question.role', { role: roleNameForCategory(category) ?? categoryLabel(category) });
  const showConfidenceStep = answer === 'yes' || answer === 'no';
  const q2Label =
    showConfidenceStep && answer === 'no' && isMinter
      ? t('rating.question.confidenceNegativeMinter')
      : t('rating.question.confidence');

  return (
    <div className="rating-flow">
      <fieldset className="rating-flow__step" disabled={disabled}>
        <legend>{q1Label}</legend>
        {isMinter ? <p className="muted rating-flow__helper">{t('rating.helper.minter')}</p> : null}
        <div className="rating-flow__options">
          <button
            aria-pressed={answer === 'yes'}
            className="rating-flow__option"
            onClick={() => chooseAnswer('yes')}
            type="button"
          >
            {isMinter ? t('value.yes') : t('status.positive')}
          </button>
          <button
            aria-pressed={answer === 'no'}
            className="rating-flow__option"
            onClick={() => chooseAnswer('no')}
            type="button"
          >
            {isMinter ? t('value.no') : t('status.negative')}
          </button>
          <button
            aria-pressed={answer === 'notSure'}
            className="rating-flow__option"
            onClick={() => chooseAnswer('notSure')}
            type="button"
          >
            {t('rating.answer.notSure')}
          </button>
          {hasActiveRating ? (
            <button
              aria-pressed={answer === 'clear'}
              className="rating-flow__option rating-flow__option--clear"
              onClick={chooseClear}
              type="button"
            >
              {t('action.clearMyRating')}
            </button>
          ) : null}
        </div>
      </fieldset>

      {isDesigner ? (
        <div className="rating-flow__influence-note">
          <p>{t('rating.designer.influenceNote')}</p>
          <p className="muted">{t('rating.designer.influenceSecondary')}</p>
        </div>
      ) : null}

      {showConfidenceStep ? (
        <fieldset className="rating-flow__step" disabled={disabled}>
          <legend>{q2Label}</legend>
          {answer === 'no' && isMinter ? (
            <p className="rating-message negative rating-flow__warning">{t('rating.warning.negativeCounts')}</p>
          ) : null}
          <div className="rating-flow__options">
            {CONFIDENCE_LEVELS.map((level) => (
              <button
                aria-pressed={confidence === level}
                className="rating-flow__option"
                key={level}
                onClick={() => chooseConfidence(level)}
                type="button"
              >
                {confidenceLabel(level)} <bdi>({answer === 'no' ? -level : level})</bdi>
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}

// Shared rating surface for account detail and the feed dialog.
export function RatingForm(
  props: RatingControlArgs & {
    // Timeout notice (Retry/Dismiss) support: the full pending map plus key-based callbacks, kept
    // separate from RatingControlArgs since useRatingControl itself has no use for them.
    onSubmittingChange?: (submitting: boolean) => void;
    onDismissPending?: (key: string) => void;
    onRetryPending?: (key: string) => void;
    pendingRatings?: PendingRatingsByKey;
  },
) {
  const { category, onDismissPending, onRetryPending, pendingRating, pendingRatings, self, targetAddress } = props;
  const control = useRatingControl(props);
  useEffect(() => { props.onSubmittingChange?.(control.submitting); }, [control.submitting, props.onSubmittingChange]);

  if (!control.canInteract) {
    return (
      <div className="mini-section">
        <h3>{t('rating.action.rateAccount')}</h3>
        <p className="muted">{control.note}</p>
        <RatingChooser category={category} control={control} pendingRating={pendingRating} />
        <button className="rating-submit" disabled type="button">{t('action.submitRating')}</button>
      </div>
    );
  }

  const { accountLocked, activeRating, cooldown, cooldownLoading, isPending, message, onCooldown, submitDisabled, submitting, unchanged } =
    control;
  const variant = ratingVariantForCategory(category);
  const pendingKey = pendingRatingKey(category, targetAddress);
  const pendingTimedOut = !!pendingRatings?.[pendingKey]?.timedOut;

  return (
    <div className="mini-section">
      <h3>{t('rating.action.rateAccount')}</h3>
      <p className="muted rating-context">
        {t('rating.context', { account: self?.name ?? compactAddress(self?.address, 8, 6), category: categoryLabel(category) })}
      </p>

      <RatingChooser category={category} control={control} pendingRating={pendingRating} />
      <RatingImpactNote category={category} control={control} raterAddress={self?.address} />

      {!isPending && onCooldown ? <p className="rating-cooldown" role="status"><Timer aria-hidden="true" size={17} />{t('rating.statusCooldown', { blocks: formatNumber(cooldown?.blocksRemaining) })}</p> : null}
      <button
        className="rating-submit"
        disabled={submitDisabled}
        onClick={() => void control.handleSubmit()}
        type="button"
      >
        {submitting ? t('rating.submitting') : isPending ? t('rating.submitPending') : control.rating === 0 ? t('action.removeRating') : t('action.submitRating')}
      </button>

      {isPending && pendingTimedOut ? (
        <div className="rating-pending rating-pending--timed-out">
          <div>
            <strong>{t('rating.pendingTimeout')}</strong>
            <div className="rating-pending__actions">
              <button
                className="rating-pending__retry"
                onClick={() => onRetryPending?.(pendingKey)}
                type="button"
              >
                {t('action.retry')}
              </button>
              <button
                className="rating-pending__dismiss"
                onClick={() => onDismissPending?.(pendingKey)}
                type="button"
              >
                {t('action.dismiss')}
              </button>
            </div>
          </div>
        </div>
      ) : isPending ? (
        <div className="rating-pending">
          <span className="rating-pending__spinner" aria-hidden="true" />
          <div>
            <strong>
              {pendingRating === 0
                ? t('rating.pendingRemove')
                : t('rating.pendingValue', { rating: ratingSignedLabel(pendingRating!, variant) })}
            </strong>
            <p className="muted">
              {cooldown?.candidateChangeHeight
                ? t('rating.waitingConfirmationNear', { block: formatNumber(cooldown.candidateChangeHeight) })
                : t('rating.waitingConfirmation')}
            </p>
          </div>
        </div>
      ) : onCooldown ? null : (
        <p className="muted rating-status">
          {cooldownLoading
            ? t('rating.checkCooldown')
            : onCooldown
              ? t('rating.statusCooldown', { blocks: formatNumber(cooldown?.blocksRemaining) })
              : activeRating === null
                ? t('rating.notRated')
                : t('rating.current', { rating: ratingSignedLabel(activeRating, variant) })}
        </p>
      )}
      {!isPending && accountLocked ? (
        <p className="muted">{t('rating.statusUnlockPrompt')}</p>
      ) : null}
      {!isPending && unchanged && !cooldownLoading && !onCooldown ? (
        <p className="muted">
          {activeRating === null
            ? t('rating.promptNonZero')
            : t('rating.promptDifferent')}
        </p>
      ) : null}
      <RatingPreviewNote control={control} />
      {message ? <p className={`rating-message ${message.tone}`}>{message.text}</p> : null}
    </div>
  );
}

// Compact rating surface (inline quick-rate popover): select + Submit + one-line status. Presents an
// already-built control, so the underlying cooldown/unlock/submit logic is shared with RatingForm.
// Currently unused by any live surface (kept building against `control` alone, with no category of
// its own, so its current/pending rating lines default to the generic role wording).
export function RatingPopover({
  control,
  onClose,
  selectRef,
}: {
  control: RatingControl;
  onClose: () => void;
  selectRef?: React.RefObject<HTMLSelectElement | null>;
}) {
  const {
    activeRating,
    cooldown,
    cooldownLoading,
    isPending,
    message,
    onCooldown,
    rating,
    submitDisabled,
    submitting,
  } = control;

  const handleSubmit = async () => {
    // Close only on success — an error leaves `message` set so the user can read it and retry.
    // We use the boolean return rather than reading `control.message`, which is captured at render
    // time and so would still hold the pre-submit (stale) value here.
    if (await control.handleSubmit()) {
      onClose();
    }
  };

  return (
    <div className="rating-popover-body">
      <label className="rating-select">
        <span>{t('label.rating')}</span>
        <select
          disabled={submitting || cooldownLoading || isPending}
          onChange={(event) => control.setRating(Number(event.target.value))}
          ref={selectRef}
          value={rating}
        >
          {RATING_VALUES.map((value) => (
            <option key={value} value={value}>
              {ratingOptionLabel(value)}
            </option>
          ))}
        </select>
      </label>
      <button
        className="rating-submit"
        disabled={submitDisabled}
        onClick={() => void handleSubmit()}
        type="button"
      >
        {submitting ? t('rating.submitting') : isPending ? t('rating.submitPending') : rating === 0 ? t('action.removeRating') : t('action.submitRating')}
      </button>
      <p className="muted rating-popover-status">
        {isPending
          ? t('rating.pending')
          : cooldownLoading
            ? t('rating.checkCooldown')
            : onCooldown
              ? t('rating.statusCooldown', { blocks: formatNumber(cooldown?.blocksRemaining) })
              : activeRating === null
                ? t('rating.notRated')
                : t('rating.current', { rating: ratingSignedLabel(activeRating, 'role') })}
      </p>
      <RatingPreviewNote control={control} />
      {message ? <p className={`rating-message ${message.tone}`}>{message.text}</p> : null}
    </div>
  );
}
