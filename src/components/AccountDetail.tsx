import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Copy } from 'lucide-react';
import { getIdentityLabel } from '../identityProfiles';
import { categoryLabel, formatNumber, formatPercent, ratingTone } from '../format';
import type {
  AccountRating,
  AccountRatingCategory,
  AccountTrustExplanation,
  IdentityProfile,
  IdentityProfilesByAddress,
  SelfAccount,
  TrustDerivation,
} from '../types';
import type { AccountDetailState, PendingRatingEntry } from '../viewTypes';
import { IdentityAvatar, IdentityLabel, StatusBadge } from './Identity';
import { RatingForm } from './RatingControls';
import { t, type TranslationKey } from '../i18n';

const ROLE_ORDER: AccountRatingCategory[] = ['MANAGER', 'TRAINER', 'PLAYER', 'SUBJECT'];

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

type RatingByCategory = Partial<Record<AccountRatingCategory, number>>;

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

    try {
      await navigator.clipboard.writeText(value);
      setStatus('copied');

      timerRef.current = window.setTimeout(() => setStatus('idle'), 1800);
    } catch {
      setStatus('failed');
      timerRef.current = window.setTimeout(() => setStatus('idle'), 2400);
    }
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

function ratingValue(value: number | undefined) {
  if (value === undefined) {
    return <span className="muted">—</span>;
  }

  return <span className={`you-rated ${ratingTone(value)}`}>{value > 0 ? `+${value}` : value}</span>;
}

function publicTrustText(value: string) {
  return value
    .replace(/\bMANAGER\b/g, 'DESIGNER')
    .replace(/\bManager(?=\s+(?:Gold|Silver|Bronze|level|threshold))/g, 'Designer')
    .replace(/\bTRAINER\b/g, 'GUIDE')
    .replace(/\bTrainer(?=\s+(?:Gold|Silver|Bronze|level|threshold))/g, 'Guide')
    .replace(/\bPLAYER\b/g, 'VOTER')
    .replace(/\bPlayer(?=\s+(?:Gold|Silver|Bronze|level|threshold))/g, 'Voter')
    .replace(/\bSUBJECT\b/g, 'MINTER')
    .replace(/\bSubject(?=\s+(?:Gold|Silver|Bronze|level|threshold))/g, 'Minter');
}

function relevantRequirements(
  category: ExplanationCategoryWithRequirements | undefined,
): TrustRequirement[] {
  if (!category?.requirements?.length) {
    return [];
  }

  const nextLevelPrefix = `level.${category.level + 1}.`;
  const nextLevel = category.requirements.filter((requirement) => requirement.name.startsWith(nextLevelPrefix));
  const positiveGate = category.requirements.filter(
    (requirement) => requirement.name === 'positive.raw-score' && !requirement.passed,
  );

  if (nextLevel.length + positiveGate.length > 0) {
    return [...positiveGate, ...nextLevel].sort((left, right) => Number(left.passed) - Number(right.passed));
  }

  // At the highest level, retain unmet positive requirements when present. Suspicious checks are
  // intentionally excluded here: not meeting a suspicious threshold is usually the desired result.
  return category.requirements
    .filter((requirement) => !requirement.passed && !requirement.name.startsWith('suspicious.'))
    .sort((left, right) => Number(left.passed) - Number(right.passed));
}

function RoleStandingCard({
  active,
  category,
  derivation,
  explanation,
  onSelect,
  pendingRating,
  profile,
  youRated,
}: {
  active: boolean;
  category: AccountRatingCategory;
  derivation: TrustDerivation;
  explanation?: ExplanationCategoryWithRequirements;
  onSelect: () => void;
  pendingRating?: number;
  profile?: AccountDetailState['profile'] extends infer Profile
    ? Profile extends { categories: Array<infer Category> }
      ? Category
      : never
    : never;
  youRated?: number;
}) {
  const fallback = derivation.categories.find((candidate) => candidate.category === category);
  const categoryData = profile ?? fallback;
  const status = categoryData?.mappedTrustStatus;
  const inbound = profile?.inboundRatings ?? fallback?.inboundRatings;
  const displayRating = pendingRating ?? youRated;

  return (
    <button
      aria-pressed={active}
      className={`role-standing-card${active ? ' role-standing-card--active' : ''}`}
      onClick={onSelect}
      type="button"
    >
      <span className="role-standing-card__title">
        <strong>{categoryLabel(category)}</strong>
        {status ? <StatusBadge status={status} /> : null}
      </span>
      <span className="role-standing-card__purpose">{rolePurpose(category)}</span>
      <span className="role-standing-card__metrics">
        <span>
          {t('label.level')} <strong>{formatNumber(categoryData?.level)}</strong>
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
          <strong className={pendingRating !== undefined ? 'you-rated-pending' : undefined}>
            {pendingRating !== undefined ? <span aria-hidden="true" className="you-rated-spinner" /> : null}
            {ratingValue(displayRating)}
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
  detail,
  live,
  onActiveCategoryChange,
  onBack,
  onOpenAccount,
  onRatingSubmitted,
  pendingByCategory,
  pendingRating,
  profile,
  profiles,
  ratingActionAvailable,
  receivedRatings,
  self,
  selectedDerivation,
  youRatedByCategory,
}: {
  category: AccountRatingCategory;
  detail: AccountDetailState;
  live: boolean;
  onActiveCategoryChange?: (category: AccountRatingCategory) => void;
  onBack: () => void;
  onOpenAccount?: (address: string) => void;
  onRatingSubmitted: (entry: PendingRatingEntry) => void;
  pendingByCategory?: RatingByCategory;
  pendingRating?: number;
  profile?: IdentityProfile;
  profiles: IdentityProfilesByAddress;
  ratingActionAvailable: boolean;
  receivedRatings?: AccountRating[];
  self: SelfAccount | null;
  selectedDerivation: TrustDerivation;
  youRatedByCategory?: RatingByCategory;
}) {
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const [activeCategory, setActiveCategory] = useState(category);
  const label = getIdentityLabel(profile, selectedDerivation.accountAddress);

  useEffect(() => {
    backButtonRef.current?.focus();
  }, []);

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
  const activeRequirements = relevantRequirements(activeExplanation);
  const activePending = pendingByCategory?.[activeCategory] ?? (activeCategory === category ? pendingRating : undefined);
  const selectCategory = (nextCategory: AccountRatingCategory) => {
    setActiveCategory(nextCategory);
    onActiveCategoryChange?.(nextCategory);
  };

  return (
    <>
      <div className="detail-back">
        <button
          aria-label={t('action.backToList')}
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

      <section aria-labelledby="trust-path-title" className="trust-path">
        <div>
          <h3 id="trust-path-title">{t('role.howTrustMoves')}</h3>
          <p>{t('role.trustMovesIntro')}</p>
        </div>
        <ol className="trust-path__steps">
          {ROLE_ORDER.map((role, index) => (
            <li key={role}>
              <strong>{categoryLabel(role)}</strong>
              <span>{rolePurpose(role)}</span>
              {index < ROLE_ORDER.length - 1 ? <span aria-hidden="true" className="trust-path__arrow">↓</span> : null}
            </li>
          ))}
        </ol>
      </section>

      {detail.loading ? (
        <div aria-busy="true" aria-live="polite" className="detail-columns-loading" role="status">
          <div className="skeleton-block" />
          <div className="skeleton-block short" />
          <span className="sr-only">{t('app.loading')}</span>
        </div>
      ) : (
        <>
          <section aria-label={t('role.trustRoles')} className="role-standing-grid">
            {ROLE_ORDER.map((role) => (
              <RoleStandingCard
                active={activeCategory === role}
                category={role}
                derivation={selectedDerivation}
                explanation={explanationByCategory.get(role)}
                key={role}
                onSelect={() => selectCategory(role)}
                pendingRating={pendingByCategory?.[role] ?? (role === category ? pendingRating : undefined)}
                profile={profileByCategory.get(role)}
                youRated={youRatedByCategory?.[role]}
              />
            ))}
          </section>

          <section className="detail-role-workspace">
            <header className="detail-role-workspace__header">
              <div>
                <p className="eyebrow">{t('role.selected')}</p>
                <h3>{categoryLabel(activeCategory)}</h3>
                <p>{rolePurpose(activeCategory)}</p>
              </div>
              <div className="detail-role-workspace__summary">
                <span title={t('tooltip.blocksMinted')}>
                  {t('label.blocksMinted')}{' '}
                  <strong>
                    {live && detail.profile?.blocksMinted !== undefined
                      ? formatNumber(detail.profile.blocksMinted)
                      : '—'}
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

            <div className="detail-role-workspace__columns">
              <div className="detail-rate">
                <RatingForm
                  category={activeCategory}
                  key={`${selectedDerivation.accountPublicKey}:${activeCategory}`}
                  onSubmitted={onRatingSubmitted}
                  pendingRating={activePending}
                  ratingActionAvailable={ratingActionAvailable}
                  self={self}
                  targetAddress={selectedDerivation.accountAddress}
                  targetPublicKey={selectedDerivation.accountPublicKey}
                />
              </div>

              <div className="mini-section role-requirements">
                <h3>{t('role.whyStanding')}</h3>
                {activeRequirements.length === 0 ? (
                  <p className="muted">
                    {activeExplanation
                      ? t('role.noUnmetRequirements')
                      : t('role.detailUnavailable')}
                  </p>
                ) : (
                  <>
                    <p className="muted">
                      {t('role.nextRequirements')}
                    </p>
                    <ul className="requirement-list">
                      {activeRequirements.map((requirement) => (
                        <li
                          className={requirement.passed ? 'requirement requirement--passed' : 'requirement requirement--failed'}
                          key={requirement.name}
                        >
                          <span aria-hidden="true">{requirement.passed ? '✓' : '!'}</span>
                          <div>
                            <strong>{requirement.passed ? t('role.met') : t('role.notMet')}</strong>
                            <p>{publicTrustText(requirement.description)}</p>
                            <span className="muted">
                              {t('role.currentNeeded', {
                                actual: requirement.actual,
                                required: requirement.required,
                              })}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          </section>

          <section className="detail-rating-evidence">
            <div className="mini-section">
              <h3>{t('role.ratingsReceived')}</h3>
              {receivedRatings === undefined ? (
                <p className="muted">{t('role.openRatingsNotLoaded')}</p>
              ) : (
                <div className="received-rating-groups">
                  {ROLE_ORDER.map((role) => {
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
                                    {rating.rating > 0 ? `+${rating.rating}` : rating.rating}
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
