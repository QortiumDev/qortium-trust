import { useEffect, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import { getIdentityLabel } from '../identityProfiles';
import { categoryLabel, compactAddress, formatNumber, formatPercent, ratingTone } from '../format';
import type {
  AccountRatingCategory,
  IdentityProfile,
  IdentityProfilesByAddress,
  SelfAccount,
  TrustDerivation,
} from '../types';
import type { AccountDetailState, PendingRatingEntry } from '../viewTypes';
import { IdentityAvatar, IdentityLabel, StatusBadge } from './Identity';
import { RatingForm } from './RatingControls';
import { t } from '../i18n';

// Full-width detail takeover: identity header, prominent rate section (primary action, above the
// fold), then a two-column stats + impacts grid. Only mounted when an account is selected, so
// selectedDerivation is guaranteed non-null.
export function AccountDetail({
  category,
  detail,
  onBack,
  onRatingSubmitted,
  pendingRating,
  profile,
  profiles,
  ratingActionAvailable,
  live,
  self,
  selectedDerivation,
}: {
  category: AccountRatingCategory;
  detail: AccountDetailState;
  live: boolean;
  onBack: () => void;
  onRatingSubmitted: (entry: PendingRatingEntry) => void;
  pendingRating: number | undefined;
  profile?: IdentityProfile;
  profiles: IdentityProfilesByAddress;
  ratingActionAvailable: boolean;
  self: SelfAccount | null;
  selectedDerivation: TrustDerivation;
}) {
  const backButtonRef = useRef<HTMLButtonElement>(null);

  // Move focus to Back when the takeover mounts so keyboard/screen-reader users land on a control
  // (the clicked row that triggered the takeover has been unmounted, dropping focus to <body>).
  useEffect(() => {
    backButtonRef.current?.focus();
  }, []);

  const backBar = (
    <div className="detail-back">
      <button aria-label={t('action.backToList')} className="back-button" onClick={onBack} ref={backButtonRef} type="button">
        <ArrowLeft size={16} /> {t('action.back')}
      </button>
    </div>
  );

  // Render the identity header and the rate section immediately — they only need props and the
  // already-loaded derivation, not the detail fetch. This keeps the rating form (and any pending
  // state) visible while the profile/explanation load, so reopening a just-rated account still shows
  // its pending rating instead of a blank skeleton.
  const profileCategory = detail.profile?.categories.find((candidate) => candidate.category === category);
  const explanationCategory = detail.explanation?.categories.find((candidate) => candidate.category === category);
  const fallbackCategory = selectedDerivation.categories.find((candidate) => candidate.category === category);
  const liveBlocksMinted = detail.profile?.blocksMinted;
  const liveEffectiveVoteWeight = detail.profile?.effectiveVoteWeight;
  const label = getIdentityLabel(profile, selectedDerivation.accountAddress);

  return (
    <>
      {backBar}
      <div className="detail-header">
        <IdentityAvatar address={selectedDerivation.accountAddress} profile={profile} size="large" />
        <div>
          <StatusBadge status={detail.profile?.trustStatus ?? selectedDerivation.derivedTrustStatus} />
          <h2>{label}</h2>
        </div>
        {label !== selectedDerivation.accountAddress ? (
          <span className="mono">{compactAddress(selectedDerivation.accountAddress, 12, 8)}</span>
        ) : null}
        <span className="mono">{compactAddress(selectedDerivation.accountPublicKey, 9, 8)}</span>
      </div>
      <div className="detail-rate">
        <RatingForm
          category={category}
          key={`${selectedDerivation.accountPublicKey}:${category}`}
          onSubmitted={onRatingSubmitted}
          pendingRating={pendingRating}
          ratingActionAvailable={ratingActionAvailable}
          self={self}
          targetAddress={selectedDerivation.accountAddress}
          targetPublicKey={selectedDerivation.accountPublicKey}
        />
      </div>
      {detail.loading ? (
        <div aria-busy="true" aria-live="polite" className="detail-columns-loading" role="status">
          <div className="skeleton-block" />
          <div className="skeleton-block short" />
          <span className="sr-only">{t('app.loading')}</span>
        </div>
      ) : (
      <div className="detail-columns">
        <div className="detail-stats">
          <div className="detail-grid">
            <div>
              <span>{t('label.category')}</span>
              <strong>{categoryLabel(category)}</strong>
            </div>
            <div title={t('tooltip.level')}>
              <span>{t('label.level')}</span>
              <strong>{formatNumber(profileCategory?.level ?? fallbackCategory?.level ?? 0)}</strong>
            </div>
            <div title={t('tooltip.score')}>
              <span>{t('label.score')}</span>
              <strong>{formatNumber(profileCategory?.score ?? fallbackCategory?.score ?? 0)}</strong>
            </div>
            <div title={t('tooltip.voteWeight')}>
              <span>{t('label.voteWeight')}</span>
              <strong>
                {formatPercent(detail.profile?.trustWeightPercent ?? selectedDerivation.derivedTrustWeightPercent)}
              </strong>
            </div>
            <div title={t('tooltip.blocksMinted')}>
              <span>{t('label.blocksMinted')}</span>
              <strong>{live && liveBlocksMinted !== undefined ? formatNumber(liveBlocksMinted) : '—'}</strong>
            </div>
            <div title={t('tooltip.effectiveVote')}>
              <span>{t('label.effectiveVote')}</span>
              <strong>
                {live && liveEffectiveVoteWeight !== undefined ? formatNumber(liveEffectiveVoteWeight) : '—'}
              </strong>
            </div>
          </div>
          <div className="mini-section">
            <h3>{t('label.ratings')}</h3>
            <div className="rating-counts">
              <span className="positive">
                +{formatNumber(profileCategory?.inboundRatings.positiveRatingCount ?? 0)}
              </span>
              <span className="negative">
                -{formatNumber(profileCategory?.inboundRatings.negativeRatingCount ?? 0)}
              </span>
              <span>{t('rating.outboundCount', { count: formatNumber(profileCategory?.outboundRatings.totalRatingCount ?? 0) })}</span>
            </div>
          </div>
        </div>
        <div className="detail-impacts">
          <div className="mini-section">
            <h3>{t('label.topImpacts')}</h3>
            {(explanationCategory?.topPositiveImpacts.length ?? 0) +
              (explanationCategory?.topNegativeImpacts.length ?? 0) ===
            0 ? (
              <p className="muted">{t('empty.impacts')}</p>
            ) : (
              <ul className="impact-list">
                {[
                  ...(explanationCategory?.topPositiveImpacts ?? []),
                  ...(explanationCategory?.topNegativeImpacts ?? []),
                ].map((impact) => {
                  const impactProfile = profiles[impact.raterAddress];

                  return (
                    <li key={`${impact.raterAddress}-${impact.category}-${impact.rating}`}>
                      <span className={`impact-dot ${ratingTone(impact.rating)}`} />
                      <div className="identity-cell compact">
                        <IdentityAvatar address={impact.raterAddress} profile={impactProfile} size="small" />
                        <IdentityLabel address={impact.raterAddress} profile={impactProfile} />
                      </div>
                      <strong>{formatNumber(impact.impact)}</strong>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
      )}
    </>
  );
}
