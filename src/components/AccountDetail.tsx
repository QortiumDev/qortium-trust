import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Copy } from 'lucide-react';
import { copyToClipboard } from '../clipboard';
import { getIdentityLabel } from '../identityProfiles';
import {
  categoryLabel,
  formatNumber,
  formatPercent,
  publicizeTrustText,
  ratingSignedLabel,
  ratingVariantForCategory,
  ratingTone,
} from '../format';
import type {
  AccountRating,
  AccountRatingCategory,
  AccountTrustExplanation,
  IdentityProfile,
  IdentityProfilesByAddress,
  SelfAccount,
  TrustDerivation,
  TrustPolicy,
} from '../types';
import type {
  AccountDetailState,
  PendingRatingEntry,
  PendingRatingsByKey,
  RatingValuesByAccountCategory,
} from '../viewTypes';
import { getDisplayedRating, type DisplayedRating } from '../ratingControl';
import { IdentityAvatar, IdentityLabel, StatusBadge } from './Identity';
import { RoleIcon } from './TrustIcons';
import { TrustStatusHelp } from './TrustStatusHelp';
import { RatingForm } from './RatingControls';
import { t, type TranslationKey } from '../i18n';

const ROLE_ORDER: AccountRatingCategory[] = ['SUBJECT', 'PLAYER', 'TRAINER', 'MANAGER'];

const ROLE_PURPOSE_KEYS: Record<AccountRatingCategory, TranslationKey> = {
  MANAGER: 'category.designers.purpose',
  TRAINER: 'category.guides.purpose',
  PLAYER: 'category.voters.purpose',
  SUBJECT: 'category.minters.purpose',
};

function rolePurpose(category: AccountRatingCategory) {
  return t(ROLE_PURPOSE_KEYS[category]);
}

type TrustRequirement = {
  actual: string;
  description: string;
  name: string;
  passed: boolean;
  required: string;
};

type ExplanationCategoryWithRequirements = AccountTrustExplanation['categories'][number] & {
  requirements?: TrustRequirement[];
};

function CopyValueButton({ label, value }: { label: string; value: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    },
    [],
  );

  const copy = async () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }

    const succeeded = await copyToClipboard(value);
    setStatus(succeeded ? 'copied' : 'failed');
    timerRef.current = window.setTimeout(() => setStatus('idle'), succeeded ? 1800 : 2400);
  };

  const actionLabel =
    status === 'copied' ? t('action.copied') : status === 'failed' ? t('action.copyFailed') : t('action.copy');

  return (
    <button
      aria-label={`${actionLabel} ${label}`}
      className="copy-value-button"
      onClick={() => void copy()}
      title={`${actionLabel} ${label}`}
      type="button"
    >
      {status === 'copied' ? <Check aria-hidden="true" size={14} /> : <Copy aria-hidden="true" size={14} />}
      <span>{actionLabel}</span>
      <span aria-live="polite" className="sr-only">
        {status === 'copied' ? `${label} ${t('action.copied')}` : status === 'failed' ? `${t('action.copyFailed')}: ${label}` : ''}
      </span>
    </button>
  );
}

// Decomposed sign+magnitude form (owner copy rule — never a combined "+3" style render). `category`
// picks Minter (Yes/No) vs role (Positive/Negative) wording; 0 (only ever seen mid-flight, while a
// removal is pending confirmation) reads the same as an option-list "Clear rating".
function ratingValue(value: number | undefined, category: AccountRatingCategory) {
  if (value === undefined) {
    return <span className="muted">—</span>;
  }

  if (value === 0) {
    return <span className="you-rated muted">{t('rating.option.remove')}</span>;
  }

  return (
    <span className={`you-rated ${ratingTone(value)}`}>{ratingSignedLabel(value, ratingVariantForCategory(category))}</span>
  );
}

function requirementsForLevel(
  category: ExplanationCategoryWithRequirements | undefined,
  level: number | undefined,
): TrustRequirement[] {
  return (category?.requirements ?? [])
    .filter((requirement) => requirement.name === 'positive.raw-score' ||
      (level !== undefined && requirement.name.startsWith(`level.${level}.`)))
    .sort((left, right) => Number(left.passed) - Number(right.passed));
}

function RequirementList({ requirements, suspicious = false }: {
  requirements: TrustRequirement[];
  suspicious?: boolean;
}) {
  return (
    <ul className="requirement-list">
      {requirements.map((requirement) => (
        <li
          className={`requirement requirement--${suspicious ? 'neutral' : requirement.passed ? 'passed' : 'failed'}`}
          key={requirement.name}
        >
          <span aria-hidden="true">{suspicious ? '•' : requirement.passed ? '✓' : '!'}</span>
          <div>
            <strong>{requirement.passed ? t('role.met') : t('role.notMet')}</strong>
            <p>{publicizeTrustText(requirement.description)}</p>
            <span className="muted">
              {t('role.currentNeeded', { actual: requirement.actual, required: requirement.required })}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function RoleStandingCard({
  active,
  category,
  derivation,
  displayed,
  explanation,
  onSelect,
  profile,
}: {
  active: boolean;
  category: AccountRatingCategory;
  derivation: TrustDerivation;
  displayed: DisplayedRating;
  explanation?: ExplanationCategoryWithRequirements;
  onSelect: () => void;
  profile?: AccountDetailState['profile'] extends infer Profile
    ? Profile extends { categories: Array<infer Category> }
      ? Category
      : never
    : never;
}) {
  const fallback = derivation.categories.find((candidate) => candidate.category === category);
  const categoryData = profile ?? fallback;
  const status = categoryData?.mappedTrustStatus;
  const inbound = profile?.inboundRatings ?? fallback?.inboundRatings;

  return (
    <button
      aria-pressed={active}
      data-role={category}
      title={rolePurpose(category)}
      className={`role-standing-card${active ? ' role-standing-card--active' : ''}`}
      onClick={onSelect}
      type="button"
    >
      <span className="role-standing-card__title">
        <strong><RoleIcon category={category} />{categoryLabel(category)}</strong>
        {status ? <StatusBadge status={status} /> : <span className="muted">—</span>}
      </span>
      <span className="role-standing-card__purpose">{rolePurpose(category)}</span>
      <span className="role-standing-card__metrics">
        <span>
          {t('label.trustLevel')} <strong>{formatNumber(categoryData?.level)}</strong>
        </span>
        <span>
          {t('label.score')} <strong>{formatNumber(categoryData?.score)}</strong>
        </span>
        <span>
          {t('label.ratings')}{' '}
          <strong>
            <span className="positive">+{formatNumber(inbound?.positiveRatingCount ?? 0)}</span>{' '}
            <span className="negative">-{formatNumber(inbound?.negativeRatingCount ?? 0)}</span>
          </strong>
        </span>
        <span>
          {t('label.youRated')}{' '}
          <strong className={displayed.pending ? 'you-rated-pending' : undefined} title={displayed.submitting ? t('rating.submitting') : displayed.pending ? t('rating.pendingConfirmation') : undefined}>
            {displayed.pending ? <span aria-hidden="true" className="you-rated-spinner" /> : null}
            {ratingValue(displayed.value, category)}
          </strong>
        </span>
      </span>
      {explanation ? (
        <span className="role-standing-card__score-detail">
          {t('role.levelScore', { score: formatNumber(explanation.levelScore) })} ·{' '}
          {t('role.configuredCap', { cap: formatNumber(explanation.levelScoreCap) })}
        </span>
      ) : null}
    </button>
  );
}

export function AccountDetail({
  category,
  focusRating = false,
  detail,
  onActiveCategoryChange,
  onBack,
  onDismissPending,
  onOpenAccount,
  onRatingSubmitted,
  onSubmissionStarted,
  onSubmissionFailed,
  onRetryPending,
  pendingRatings,
  policy,
  profile,
  profiles,
  ratingActionAvailable,
  receivedRatings,
  self,
  selectedDerivation,
  showAllRoles,
  youRatedByKey,
}: {
  category: AccountRatingCategory;
  focusRating?: boolean;
  detail: AccountDetailState;
  onActiveCategoryChange?: (category: AccountRatingCategory) => void;
  onBack: () => void;
  onDismissPending?: (key: string) => void;
  onOpenAccount?: (address: string) => void;
  onRatingSubmitted: (entry: PendingRatingEntry) => void;
  onSubmissionStarted?: (entry: PendingRatingEntry) => boolean;
  onSubmissionFailed?: (entry: PendingRatingEntry, message: string) => void;
  onRetryPending?: (key: string) => void;
  // Full pending-rating map (keyed by pendingRatingKey). RatingForm reads the timed-out flag for its
  // own category/target to offer Retry/Dismiss; the role cards below use it (together with
  // youRatedByKey) to derive each role's displayed you-rated value via getDisplayedRating.
  pendingRatings?: PendingRatingsByKey;
  // Already-fetched app-wide trust policy (App loads it once via getTrustPolicy), used for the
  // vote-weight explainer's Bronze/Silver/Gold percentages.
  policy?: TrustPolicy | null;
  profile?: IdentityProfile;
  profiles: IdentityProfilesByAddress;
  ratingActionAvailable: boolean;
  receivedRatings?: AccountRating[];
  self: SelfAccount | null;
  selectedDerivation: TrustDerivation;
  // Minters-first redesign (Stage A): off shows only the SUBJECT (Minters) role card + workspace;
  // on shows the 4-card role grid as before.
  showAllRoles: boolean;
  // Complete current-user ratings keyed by pendingRatingKey's `${category}:${targetAddress}`.
  youRatedByKey?: RatingValuesByAccountCategory;
}) {
  const ratingRef = useRef<HTMLDivElement>(null);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const [activeCategory, setActiveCategory] = useState(category);
  const label = getIdentityLabel(profile, selectedDerivation.accountAddress);
  // Off: only the SUBJECT ("Minters") role is ever shown — App itself pins `category` to SUBJECT
  // while the toggle is off, but this keeps the evidence section below correct even if it doesn't.
  const visibleRoles: AccountRatingCategory[] = showAllRoles ? ROLE_ORDER : ['SUBJECT'];

  useEffect(() => {
    if (!focusRating) backButtonRef.current?.focus();
  }, [focusRating]);

  useEffect(() => {
    if (focusRating && !detail.loading) {
      ratingRef.current?.scrollIntoView?.({ block: 'nearest' });
      ratingRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    }
  }, [focusRating, detail.loading]);

  useEffect(() => {
    setActiveCategory(category);
  }, [category]);

  const profileByCategory = useMemo(
    () => new Map(detail.profile?.categories.map((candidate) => [candidate.category, candidate]) ?? []),
    [detail.profile?.categories],
  );
  const explanationByCategory = useMemo(
    () =>
      new Map(
        (detail.explanation?.categories ?? []).map((candidate) => [
          candidate.category,
          candidate as ExplanationCategoryWithRequirements,
        ]),
      ),
    [detail.explanation?.categories],
  );
  const activeExplanation = explanationByCategory.get(activeCategory);
  const configuredLevels = (activeExplanation?.configuredLevels ?? [])
    .map(({ level }) => level).filter((level) => level > 0).sort((a, b) => a - b);
  const suspicious = activeExplanation?.mappedTrustStatus === 'SUSPICIOUS';
  const currentLevel = activeExplanation?.level ?? 0;
  const displayedLevel = currentLevel > 0 ? currentLevel : configuredLevels[0];
  const activeRequirements = suspicious
    ? (activeExplanation?.requirements ?? []).filter(({ name }) => name.startsWith('suspicious.'))
    : requirementsForLevel(activeExplanation, displayedLevel);
  const higherLevel = currentLevel > 0 ? configuredLevels.find((level) => level > currentLevel) : undefined;
  const higherRequirements = higherLevel === undefined ? [] : requirementsForLevel(activeExplanation, higherLevel);
  const activePending = getDisplayedRating(
    pendingRatings,
    undefined,
    activeCategory,
    selectedDerivation.accountAddress,
  ).value;
  const selectCategory = (nextCategory: AccountRatingCategory) => {
    setActiveCategory(nextCategory);
    onActiveCategoryChange?.(nextCategory);
  };

  return (
    <>
      <div className="detail-back">
        <button
          aria-label={t('action.back')}
          className="back-button"
          onClick={onBack}
          ref={backButtonRef}
          type="button"
        >
          <ArrowLeft size={16} /> {t('action.back')}
        </button>
      </div>

      <header className="detail-header detail-header--account">
        <IdentityAvatar address={selectedDerivation.accountAddress} profile={profile} size="large" />
        <div className="detail-header__identity">
          <div className="detail-header__name-line">
            <h2>{label}</h2>
            {label !== selectedDerivation.accountAddress ? (
              <CopyValueButton label={t('label.name')} value={label} />
            ) : null}
            <StatusBadge status={detail.profile?.trustStatus ?? selectedDerivation.derivedTrustStatus} />
          </div>
        </div>
        <div className="detail-header__identifiers">
          <div className="detail-identifier-row">
            <span>{t('label.account')}</span>
            <code>{selectedDerivation.accountAddress}</code>
            <CopyValueButton label={t('label.address')} value={selectedDerivation.accountAddress} />
          </div>
          <div className="detail-identifier-row">
            <span>{t('label.publicKey')}</span>
            <code>{selectedDerivation.accountPublicKey}</code>
            <CopyValueButton label={t('label.publicKey')} value={selectedDerivation.accountPublicKey} />
          </div>
        </div>
      </header>

      {detail.loading ? (
        <div aria-busy="true" aria-live="polite" className="detail-columns-loading" role="status">
          <div className="skeleton-block" />
          <div className="skeleton-block short" />
          <span className="sr-only">{t('app.loading')}</span>
        </div>
      ) : (
        <>
          {showAllRoles ? (
          <>
            <section aria-label={t('role.trustRoles')} className="role-standing-grid">
              {ROLE_ORDER.map((role) => (
                <RoleStandingCard
                  active={activeCategory === role}
                  category={role}
                  derivation={selectedDerivation}
                  displayed={getDisplayedRating(pendingRatings, youRatedByKey, role, selectedDerivation.accountAddress)}
                  explanation={explanationByCategory.get(role)}
                  key={role}
                  onSelect={() => selectCategory(role)}
                  profile={profileByCategory.get(role)}
                />
              ))}
            </section>
          </>
          ) : null}

          <section className="detail-role-workspace" data-role={activeCategory}>
            <header className="detail-role-workspace__header">
              <div>
                <h3><RoleIcon category={activeCategory} />{categoryLabel(activeCategory)}</h3>
                <p>{rolePurpose(activeCategory)}</p>
              </div>
              <div className="detail-role-workspace__summary">
                <span title={t('tooltip.blocksMinted')}>
                  {t('label.blocksMinted')}{' '}
                  <strong>
                    {detail.profile?.blocksMinted !== undefined ? formatNumber(detail.profile.blocksMinted) : '—'}
                  </strong>
                </span>
                <span title={t('tooltip.voteWeight')}>
                  {t('label.voteWeight')}{' '}
                  <strong>
                    {formatPercent(detail.profile?.trustWeightPercent ?? selectedDerivation.derivedTrustWeightPercent)}
                  </strong>
                </span>
              </div>
            </header>
            <TrustStatusHelp policy={policy ?? null} />

            <div className="detail-role-workspace__columns">
              <div className="detail-rate" ref={ratingRef}>
                <RatingForm
                  category={activeCategory}
                  key={`${selectedDerivation.accountPublicKey}:${activeCategory}`}
                  onDismissPending={onDismissPending}
                  onRetryPending={onRetryPending}
                  onSubmissionStarted={onSubmissionStarted}
                  onSubmissionFailed={onSubmissionFailed}
                  onSubmitted={onRatingSubmitted}
                  pendingRating={activePending}
                  pendingRatings={pendingRatings}
                  ratingActionAvailable={ratingActionAvailable}
                  self={self}
                  targetAddress={selectedDerivation.accountAddress}
                  targetPublicKey={selectedDerivation.accountPublicKey}
                />
              </div>

              <details className="mini-section role-requirements" key={`${selectedDerivation.accountAddress}:${activeCategory}`}>
                <summary>{t('role.whyStanding')}</summary>
                {activeCategory === 'SUBJECT' && activeExplanation?.mappedTrustStatus === 'GOLD' ? (
                  <p className="muted">{t('role.goldHighest')}</p>
                ) : null}
                {activeExplanation && !suspicious && displayedLevel !== undefined ? (
                  <p className="muted">
                    {currentLevel > 0
                      ? `${t('label.trustLevel')} ${formatNumber(currentLevel)}`
                      : t('role.nextRequirements', { level: formatNumber(displayedLevel) })}
                  </p>
                ) : null}
                {activeRequirements.length === 0 ? (
                  <p className="muted">
                    {activeExplanation ? t('role.noUnmetRequirements') : t('role.detailUnavailable')}
                  </p>
                ) : <RequirementList requirements={activeRequirements} suspicious={suspicious} />}
                {higherLevel !== undefined && higherRequirements.length > 0 ? (
                  <details className="role-higher-requirements">
                    <summary>{t('role.higherLevel', { level: formatNumber(higherLevel) })}</summary>
                    <RequirementList requirements={higherRequirements} />
                  </details>
                ) : null}
              </details>
            </div>
          </section>

          <section className="detail-rating-evidence">
            <div className="mini-section">
              <h3>{t('role.ratingsReceived')}</h3>
              {receivedRatings === undefined ? (
                <p className="muted">{t('role.openRatingsNotLoaded')}</p>
              ) : (
                <div className="received-rating-groups">
                  {visibleRoles.map((role) => {
                    const roleRatings = receivedRatings
                      .filter(
                        (rating) =>
                          rating.targetAddress === selectedDerivation.accountAddress &&
                          rating.category === role &&
                          rating.rating !== 0,
                      )
                      .sort((left, right) => Math.abs(right.rating) - Math.abs(left.rating));

                    return (
                      <details key={role} open={role === activeCategory}>
                        <summary>
                          <strong>{categoryLabel(role)}</strong>
                          <span>{formatNumber(roleRatings.length)}</span>
                        </summary>
                        {roleRatings.length === 0 ? (
                          <p className="muted">{t('role.noActiveRatings')}</p>
                        ) : (
                          <ul className="received-rating-list">
                            {roleRatings.map((rating) => {
                              const raterProfile = profiles[rating.raterAddress];

                              return (
                                <li key={`${rating.raterAddress}:${rating.category}`}>
                                  <button
                                    className="identity-cell compact identity-link"
                                    disabled={!onOpenAccount}
                                    onClick={() => onOpenAccount?.(rating.raterAddress)}
                                    type="button"
                                  >
                                    <IdentityAvatar address={rating.raterAddress} profile={raterProfile} size="small" />
                                    <IdentityLabel address={rating.raterAddress} profile={raterProfile} />
                                  </button>
                                  <strong className={ratingTone(rating.rating)}>
                                    {ratingSignedLabel(rating.rating, ratingVariantForCategory(role))}
                                  </strong>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </details>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mini-section">
              <h3>{t('label.topImpacts')}</h3>
              {(activeExplanation?.topPositiveImpacts.length ?? 0) +
                (activeExplanation?.topNegativeImpacts.length ?? 0) ===
              0 ? (
                <p className="muted">{t('empty.impacts')}</p>
              ) : (
                <ul className="impact-list">
                  {[
                    ...(activeExplanation?.topPositiveImpacts ?? []),
                    ...(activeExplanation?.topNegativeImpacts ?? []),
                  ].map((impact) => {
                    const impactProfile = profiles[impact.raterAddress];

                    return (
                      <li key={`${impact.raterAddress}-${activeCategory}-${impact.rating}`}>
                        <span className={`impact-dot ${ratingTone(impact.rating)}`} />
                        <button
                          className="identity-cell compact identity-link"
                          disabled={!onOpenAccount}
                          onClick={() => onOpenAccount?.(impact.raterAddress)}
                          type="button"
                        >
                          <IdentityAvatar address={impact.raterAddress} profile={impactProfile} size="small" />
                          <IdentityLabel address={impact.raterAddress} profile={impactProfile} />
                        </button>
                        <strong>{formatNumber(impact.impact)}</strong>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        </>
      )}
    </>
  );
}
