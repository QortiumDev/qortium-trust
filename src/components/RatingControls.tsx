import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { categoryLabel, compactAddress, formatNumber, statusLabel } from '../format';
import type { AccountRatingCategory, SelfAccount, TrustDerivation } from '../types';
import type { PendingRatingEntry } from '../viewTypes';
import {
  mapRatingError,
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
export function RatingForm(props: RatingControlArgs) {
  const { category, pendingRating, self } = props;
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
      {isPending ? (
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

// A single Accounts-table rate cell: the Rate trigger button (whose ref anchors the popover) plus the
// popover itself when open. Extracted so each row owns a stable button ref for portal positioning.
export function RateCell({
  category,
  derivation,
  onRate,
  onRatingSubmitted,
  open,
  pendingRating,
  ratingActionAvailable,
  self,
}: {
  category: AccountRatingCategory;
  derivation: TrustDerivation;
  onRate: (address: string | null) => void;
  onRatingSubmitted: (entry: PendingRatingEntry) => void;
  open: boolean;
  pendingRating: number | undefined;
  ratingActionAvailable: boolean;
  self: SelfAccount | null;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const rowIsSelf = !!self && self.address === derivation.accountAddress;
  const rowDisabled = !ratingActionAvailable || !self || !self.publicKey || rowIsSelf;
  const rowNote = !ratingActionAvailable
    ? t('error.appUnavailable')
    : !self
      ? t('error.signInToRate')
      : rowIsSelf
        ? t('error.cannotRateSelf')
        : !self.publicKey
          ? t('error.accountHistory')
          : t('rating.action.rateAccount');

  return (
    <td className="rate-cell" onClick={(event) => event.stopPropagation()}>
      <button
        aria-expanded={open}
        className="rate-button"
        disabled={rowDisabled}
        onClick={(event) => {
          event.stopPropagation();
          onRate(open ? null : derivation.accountAddress);
        }}
        ref={buttonRef}
        title={rowNote}
        type="button"
      >
        {t('label.rate')}
      </button>
      {open ? (
        <RowRatePopover
          anchorRef={buttonRef}
          category={category}
          onClose={() => onRate(null)}
          onRatingSubmitted={onRatingSubmitted}
          pendingRating={pendingRating}
          ratingActionAvailable={ratingActionAvailable}
          self={self}
          targetAddress={derivation.accountAddress}
          targetPublicKey={derivation.accountPublicKey}
        />
      ) : null}
    </td>
  );
}

// Owns the rating control for a single open row so the hook lives exactly as long as the popover is
// open, and closes the popover on outside pointer-down / Escape. Rendered into a portal with fixed
// positioning anchored to the trigger button so the scrollable `.table-wrap` (overflow:auto) never
// clips it, regardless of scroll position or how far down the row is.
export function RowRatePopover({
  anchorRef,
  category,
  onClose,
  onRatingSubmitted,
  pendingRating,
  ratingActionAvailable,
  self,
  targetAddress,
  targetPublicKey,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  category: AccountRatingCategory;
  onClose: () => void;
  onRatingSubmitted: (entry: PendingRatingEntry) => void;
  pendingRating: number | undefined;
  ratingActionAvailable: boolean;
  self: SelfAccount | null;
  targetAddress: string;
  targetPublicKey: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const control = useRatingControl({
    category,
    onSubmitted: onRatingSubmitted,
    pendingRating,
    ratingActionAvailable,
    self,
    targetAddress,
    targetPublicKey,
  });

  // Anchor the fixed-position popover to the trigger button's viewport rect, flipping it upward when
  // there is not enough room below (e.g. bottom rows). Recompute on scroll/resize so it tracks the
  // row while the table scrolls underneath.
  const POPOVER_WIDTH = 280;

  useEffect(() => {
    const updatePosition = () => {
      const anchor = anchorRef.current;

      if (!anchor) {
        return;
      }

      const rect = anchor.getBoundingClientRect();
      const popoverHeight = ref.current?.offsetHeight ?? 0;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpward = popoverHeight > 0 && spaceBelow < popoverHeight + 12 && rect.top > popoverHeight + 12;
      const top = openUpward ? rect.top - popoverHeight - 6 : rect.bottom + 6;
      // Right-align to the trigger, then clamp to the viewport so it never runs off either edge.
      const left = Math.max(8, Math.min(rect.right - POPOVER_WIDTH, window.innerWidth - POPOVER_WIDTH - 8));

      setPosition({ left, top });
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [anchorRef]);

  // Move focus into the popover so Escape works from the keyboard (focus would otherwise stay on the
  // trigger button, outside this subtree) and screen-reader users land on the controls.
  useEffect(() => {
    selectRef.current?.focus();
  }, []);

  // Depend on the stable onClose (setOpenRateAddress) rather than the whole props bag to avoid
  // re-subscribing every render. pointerdown fires before the row's click handler; the trigger button
  // is excluded so its toggle handler (not this listener) governs a click on the button itself.
  // The keydown listener is on the document so Escape closes even while focus is on the trigger.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      if (ref.current?.contains(target) || anchorRef.current?.contains(target)) {
        return;
      }

      onClose();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        anchorRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [anchorRef, onClose]);

  return createPortal(
    <div
      aria-label={t('rating.action.rateAccount')}
      aria-modal="true"
      className="rate-popover"
      onClick={(event) => event.stopPropagation()}
      ref={ref}
      role="dialog"
      style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? 'visible' : 'hidden' }}
    >
      <RatingPopover control={control} onClose={onClose} selectRef={selectRef} />
    </div>,
    document.body,
  );
}
