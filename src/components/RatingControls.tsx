import { categoryLabel, compactAddress, formatNumber, statusLabel } from '../format';
import type { PendingRatingsByKey } from '../viewTypes';
import {
  mapRatingError,
  pendingRatingKey,
  RATING_VALUES,
  ratingOptionLabel,
  useRatingControl,
  type RatingControl,
  type RatingControlArgs,
} from '../ratingControl';
import { t } from '../i18n';

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

// Full-mode rating surface (detail view). Thin renderer over useRatingControl.
export function RatingForm(
  props: RatingControlArgs & {
    // Timeout notice (Retry/Dismiss) support: the full pending map plus key-based callbacks, kept
    // separate from RatingControlArgs since useRatingControl itself has no use for them.
    onDismissPending?: (key: string) => void;
    onRetryPending?: (key: string) => void;
    pendingRatings?: PendingRatingsByKey;
  },
) {
  const { category, onDismissPending, onRetryPending, pendingRating, pendingRatings, self, targetAddress } = props;
  const control = useRatingControl(props);

  if (!control.canInteract) {
    return (
      <div className="mini-section">
        <h3>{t('rating.action.rateAccount')}</h3>
        <p className="muted">{control.note}</p>
      </div>
    );
  }

  const { accountLocked, activeRating, cooldown, cooldownLoading, isPending, message, onCooldown, rating, submitDisabled, submitting, unchanged } =
    control;
  const pendingKey = pendingRatingKey(category, targetAddress);
  const pendingTimedOut = !!pendingRatings?.[pendingKey]?.timedOut;

  return (
    <div className="mini-section">
      <h3>{t('rating.action.rateAccount')}</h3>
      <p className="muted rating-context">
        {t('rating.context', { account: self?.name ?? compactAddress(self?.address, 8, 6), category: categoryLabel(category) })}
      </p>
      <div className="rating-form">
        <label className="rating-select">
          <span>{t('label.rating')}</span>
          <select
            disabled={submitting || cooldownLoading || isPending}
            onChange={(event) => control.setRating(Number(event.target.value))}
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
          onClick={() => void control.handleSubmit()}
          type="button"
        >
          {submitting ? t('rating.submitting') : isPending ? t('rating.submitPending') : rating === 0 ? t('action.removeRating') : t('action.submitRating')}
        </button>
      </div>
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
                : t('rating.pendingValue', { rating: `${pendingRating! > 0 ? '+' : ''}${pendingRating}` })}
            </strong>
            <p className="muted">
              {cooldown?.candidateChangeHeight
                ? t('rating.waitingConfirmationNear', { block: formatNumber(cooldown.candidateChangeHeight) })
                : t('rating.waitingConfirmation')}
            </p>
          </div>
        </div>
      ) : (
        <p className="muted rating-status">
          {cooldownLoading
            ? t('rating.checkCooldown')
            : onCooldown
              ? t('rating.statusCooldown', { blocks: formatNumber(cooldown?.blocksRemaining) })
              : activeRating === null
                ? t('rating.notRated')
                : t('rating.current', { rating: `${activeRating > 0 ? '+' : ''}${activeRating}` })}
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
                : t('rating.current', { rating: `${activeRating > 0 ? '+' : ''}${activeRating}` })}
      </p>
      <RatingPreviewNote control={control} />
      {message ? <p className={`rating-message ${message.tone}`}>{message.text}</p> : null}
    </div>
  );
}
