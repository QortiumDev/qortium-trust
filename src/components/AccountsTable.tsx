import { memo, useMemo } from 'react';
import { ArrowDown, ArrowDownUp, ArrowUp, Clock3, SearchX, Users } from 'lucide-react';
import { categoryLabel, formatDate, formatNumber, ratingSignedLabel, ratingTone, ratingVariantForCategory } from '../format';
import type {
  AccountRatingCategory,
  IdentityProfilesByAddress,
  TrustDerivation,
  TrustStatus,
} from '../types';
import type {
  AccountSortKey,
  AccountSortState,
  PendingValueByAccountCategory,
  RatingsByAddress,
  RatingValuesByAccountCategory,
} from '../viewTypes';
import {
  compareAccountLabels,
  compareAccountRows,
  getAccountBlocksMinted,
  getAriaSort,
  getDerivationCategory,
} from '../accountSort';
import { getDisplayedRating, pendingRatingKey } from '../ratingControl';
import { EmptyState, IdentityAvatar, IdentityLabel, StatusBadge } from './Identity';
import { t } from '../i18n';
import type { RecentActivity } from '../recentActivity';
import { RoleIcon } from './TrustIcons';

const MemoIdentityAvatar = memo(IdentityAvatar);
const MemoStatusBadge = memo(StatusBadge);

const ROLE_ORDER: AccountRatingCategory[] = ['SUBJECT', 'PLAYER', 'TRAINER', 'MANAGER'];

// Decomposed sign+magnitude form everywhere a rating value renders (owner copy rule). `category`
// picks Minter (Yes/No) vs role (Positive/Negative) wording; 0 (only ever seen mid-flight, while a
// removal is pending confirmation) reads the same as an option-list "Clear rating".
function RatingValue({
  category,
  pending,
  value,
}: {
  category: AccountRatingCategory;
  pending?: number;
  value?: number;
}) {
  const variant = ratingVariantForCategory(category);

  if (pending !== undefined) {
    return (
      <span className="you-rated-pending" title={t('rating.pendingConfirmation')}>
        <span aria-hidden="true" className="you-rated-spinner" />
        {pending !== 0 ? (
          <span className={`you-rated ${ratingTone(pending)}`}>{ratingSignedLabel(pending, variant)}</span>
        ) : (
          <span className="you-rated muted">{t('rating.option.remove')}</span>
        )}
      </span>
    );
  }

  if (value === undefined) {
    return <span className="muted">—</span>;
  }

  if (value === 0) {
    return <span className="you-rated muted">{t('rating.option.remove')}</span>;
  }

  return <span className={`you-rated ${ratingTone(value)}`}>{ratingSignedLabel(value, variant)}</span>;
}

export function SortHeader({
  disabled = false,
  disabledReason,
  label,
  onSort,
  sort,
  sortKey,
}: {
  disabled?: boolean;
  disabledReason?: string;
  label: string;
  onSort: (key: AccountSortKey) => void;
  sort: AccountSortState;
  sortKey: AccountSortKey;
}) {
  const rank = disabled ? -1 : sort.findIndex((entry) => entry.key === sortKey);
  const active = rank >= 0;
  const Icon = active ? (sort[rank].direction === 'asc' ? ArrowUp : ArrowDown) : ArrowDownUp;
  const sortStateLabel = disabled
    ? `, ${disabledReason ? t('sort.unavailableReason', { reason: disabledReason }) : t('sort.unavailable')}`
    : active
      ? `, ${t('sort.sorted', {
        direction: sort[rank].direction === 'asc' ? t('sort.ascending') : t('sort.descending'),
      })}` + (sort.length > 1 ? `, ${t('sort.priority', { rank: rank + 1, total: sort.length })}` : '')
      : `, ${t('sort.notSorted')}`;

  return (
    <button
      className={`sort-header ${active ? 'active' : ''}`}
      disabled={disabled}
      onClick={() => onSort(sortKey)}
      title={disabledReason ?? t('sort.title', { label })}
      type="button"
    >
      <span>{label}</span>
      <Icon aria-hidden="true" size={13} />
      {active && sort.length > 1 ? <span className="sort-rank">{rank + 1}</span> : null}
      <span className="sr-only">{sortStateLabel}</span>
    </button>
  );
}

type AccountsTableProps = {
  activity?: RecentActivity | null;
  category: AccountRatingCategory;
  derivations: TrustDerivation[];
  loadedCount?: number;
  onResetFilters?: () => void;
  onSelect: (derivation: TrustDerivation) => void;
  onSort: (key: AccountSortKey) => void;
  onRate?: (derivation: TrustDerivation, role: AccountRatingCategory) => void;
  profiles: IdentityProfilesByAddress;
  query?: string;
  selectedAddress?: string;
  // Minters-first redesign (Stage A): off shows the simplified SUBJECT-only column set (Minter
  // status / Trust level / You rated); on shows the full 4-role directory as before.
  showAllRoles: boolean;
  sort: AccountSortState;
  statusFilter?: TrustStatus | 'ALL';
  totalCount?: number | null;
  /**
   * Complete current-user ratings keyed by `${category}:${targetAddress}`.
   * App should populate this from one rater-scoped, all-category request.
   */
  youRatedByKey?: RatingValuesByAccountCategory;
  pendingByKey?: PendingValueByAccountCategory;

  // Transitional props retained so App can integrate the unified data source in a separate change.
  // They only fill the currently selected category and can be removed after App migrates.
  youRatedByAddress?: RatingsByAddress;
  pendingByAddress?: RatingsByAddress;
};

export function AccountsTable({
  activity = null,
  category,
  derivations,
  loadedCount,
  onResetFilters,
  onSelect,
  onSort,
  onRate,
  pendingByAddress = {},
  pendingByKey,
  profiles,
  query = '',
  selectedAddress,
  showAllRoles,
  sort,
  statusFilter = 'ALL',
  totalCount = null,
  youRatedByAddress = {},
  youRatedByKey,
}: AccountsTableProps) {
  // Off: every column reads the SUBJECT ("Minters") category regardless of the app's `category`
  // state (which App itself pins to SUBJECT while the toggle is off — this is belt-and-suspenders).
  const effectiveCategory = showAllRoles ? category : 'SUBJECT';
  const effectiveSelectedCategoryRatings = useMemo<RatingsByAddress>(
    () => {
      const result = { ...youRatedByAddress, ...pendingByAddress };
      const prefix = `${effectiveCategory}:`;
      for (const [key, value] of Object.entries(youRatedByKey ?? {})) {
        if (key.startsWith(prefix)) result[key.slice(prefix.length)] = value;
      }
      for (const [key, entry] of Object.entries(pendingByKey ?? {})) {
        if (key.startsWith(prefix)) result[key.slice(prefix.length)] = typeof entry === 'number' ? entry : entry.rating;
      }
      return result;
    },
    [effectiveCategory, pendingByAddress, pendingByKey, youRatedByAddress, youRatedByKey],
  );

  // `youRatedByAddress`/`pendingByAddress` are transitional (see above) and only apply to the
  // currently selected category. Fold them into the compound-keyed maps once so every cell can
  // resolve its displayed rating through the same getDisplayedRating lookup.
  const effectiveYouRatedByKey = useMemo(() => {
    const addresses = Object.keys(youRatedByAddress);

    if (addresses.length === 0) {
      return youRatedByKey;
    }

    const merged: RatingValuesByAccountCategory = { ...youRatedByKey };

    for (const address of addresses) {
      const key = pendingRatingKey(effectiveCategory, address);

      if (merged[key] === undefined) {
        merged[key] = youRatedByAddress[address];
      }
    }

    return merged;
  }, [effectiveCategory, youRatedByAddress, youRatedByKey]);

  const effectivePendingByKey = useMemo(() => {
    const addresses = Object.keys(pendingByAddress);

    if (addresses.length === 0) {
      return pendingByKey;
    }

    const merged: PendingValueByAccountCategory = { ...pendingByKey };

    for (const address of addresses) {
      const key = pendingRatingKey(effectiveCategory, address);

      if (merged[key] === undefined) {
        merged[key] = pendingByAddress[address];
      }
    }

    return merged;
  }, [effectiveCategory, pendingByAddress, pendingByKey]);

  const sortedDerivations = useMemo(
    () =>
      derivations
        .map((derivation, index) => ({ derivation, index }))
        .sort((left, right) => {
          for (const { direction, key } of sort) {
            const comparison = compareAccountRows(
              left.derivation,
              right.derivation,
              key,
              effectiveCategory,
              profiles,
              effectiveSelectedCategoryRatings,
              activity,
            );

            if (comparison !== 0) {
              return direction === 'asc' ? comparison : -comparison;
            }
          }

          return compareAccountLabels(left.derivation, right.derivation, profiles) || left.index - right.index;
        })
        .map(({ derivation }) => derivation),
    [activity, derivations, effectiveCategory, effectiveSelectedCategoryRatings, profiles, sort],
  );

  if (sortedDerivations.length === 0) {
    const filtering = query.trim().length > 0 || statusFilter !== 'ALL';

    if (filtering) {
      return (
        <div className="empty-state-stack">
          <EmptyState icon={<SearchX size={18} />} text={t('empty.matches')} />
          {onResetFilters ? (
            <button className="empty-state-reset" onClick={onResetFilters} type="button">
              {t('action.resetFilters')}
            </button>
          ) : null}
        </div>
      );
    }

    return <EmptyState icon={<Users size={18} />} text={t('empty.accounts')} />;
  }

  const filtering = query.trim().length > 0 || statusFilter !== 'ALL';
  const showCountHint =
    !filtering && typeof totalCount === 'number' && typeof loadedCount === 'number' && totalCount > loadedCount;

  return (
    <div aria-label={t('nav.accounts')} className="table-wrap accounts-directory" role="region" tabIndex={0}>
      <table className={`accounts-table accounts-table--unified${showAllRoles ? " accounts-table--all-roles" : ""}`}>
        <caption className={`table-caption${showCountHint ? "" : " sr-only"}`}>
          <span className="data-mode-badge data-mode-badge--live">{t('label.live')}</span>
          {showCountHint ? (
            <span className="table-caption__count">
              {t('accounts.showingCount', { loaded: loadedCount as number, total: totalCount as number })}
            </span>
          ) : null}
        </caption>
        <thead>
          <tr>
            <th aria-sort={getAriaSort(sort, 'account')}>
              <SortHeader label={t('label.account')} onSort={onSort} sort={sort} sortKey="account" />
            </th>
            <th aria-sort={getAriaSort(sort, 'status')}>
              <SortHeader label={t('label.trustStatus')} onSort={onSort} sort={sort} sortKey="status" />
            </th>
            {showAllRoles ? null : (
              <th aria-sort={getAriaSort(sort, 'level')}>
                <SortHeader label={t('label.trustLevel')} onSort={onSort} sort={sort} sortKey="level" />
              </th>
            )}
            <th aria-sort={getAriaSort(sort, 'blocksMinted')} title={t('tooltip.blocksMinted')}>
              <SortHeader label={t('label.blocksMinted')} onSort={onSort} sort={sort} sortKey="blocksMinted" />
            </th>
            {showAllRoles ? (
              ROLE_ORDER.map((role) => (
                <th key={role} scope="col">
                  <RoleIcon category={role} />{categoryLabel(role)}
                </th>
              ))
            ) : (
              <th aria-sort={getAriaSort(sort, 'youRated')}>
                <SortHeader label={t('label.youRated')} onSort={onSort} sort={sort} sortKey="youRated" />
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {sortedDerivations.map((derivation) => {
            const profile = profiles[derivation.accountAddress];
            const subjectData = getDerivationCategory(derivation, effectiveCategory);
            const subjectDisplayed = getDisplayedRating(
              effectivePendingByKey,
              effectiveYouRatedByKey,
              effectiveCategory,
              derivation.accountAddress,
            );

            return (
              <tr
                className={`account-row account-directory-row${
                  selectedAddress === derivation.accountAddress ? ' selected-row' : ''
                }`}
                key={derivation.accountAddress}
                onClick={() => onSelect(derivation)}
              >
                <td className="account-identity-cell" data-label={t('label.account')}>
                  <button
                    aria-label={t('action.openAccount', { name: profile?.name ?? derivation.accountAddress })}
                    className="identity-cell identity-link"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect(derivation);
                    }}
                    type="button"
                  >
                    <MemoIdentityAvatar address={derivation.accountAddress} profile={profile} size="small" />
                    <IdentityLabel address={derivation.accountAddress} profile={profile} />
                  </button>
                  {activity?.[derivation.accountAddress] ? <span className="account-activity" title={t('activity.sort')}><Clock3 aria-hidden="true" size={13} /><span className="sr-only">{t('activity.sort')}: </span><time dateTime={new Date(activity[derivation.accountAddress].timestamp).toISOString()}>{formatDate(activity[derivation.accountAddress].timestamp)}</time></span> : null}
                </td>
                <td className="account-status-cell" data-label={t('label.trustStatus')}>
                  {showAllRoles ? (
                    <MemoStatusBadge status={derivation.derivedTrustStatus} />
                  ) : subjectData ? (
                    <MemoStatusBadge status={subjectData.mappedTrustStatus} />
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                {showAllRoles ? null : (
                  <td data-label={t('label.trustLevel')}>{formatNumber(subjectData?.level)}</td>
                )}
                <td className="account-blocks-cell" data-label={t('label.blocksMinted')}>
                  {derivation.blocksMinted !== undefined ? formatNumber(getAccountBlocksMinted(derivation)) : '—'}
                </td>
                {showAllRoles ? (
                  ROLE_ORDER.map((role) => {
                    const roleData = getDerivationCategory(derivation, role);
                    const displayed = getDisplayedRating(
                      effectivePendingByKey,
                      effectiveYouRatedByKey,
                      role,
                      derivation.accountAddress,
                    );

                    return (
                      <td className="account-role-cell" data-role={role} data-label={categoryLabel(role)} key={role}>
                        {onRate ? (
                          <button
                            aria-label={`${t('label.rate')} ${categoryLabel(role)} — ${profile?.name ?? derivation.accountAddress}`}
                            className="account-role-action"
                            onClick={(event) => { event.stopPropagation(); onRate(derivation, role); }}
                            type="button"
                          />
                        ) : null}
                        <div className="account-role-summary">
                          <strong className="account-role-title"><RoleIcon category={role} />{categoryLabel(role)}</strong>
                          <div className="account-role-summary__standing">
                            {roleData ? <MemoStatusBadge status={roleData.mappedTrustStatus} /> : <span className="muted">—</span>}
                            <span className="account-role-summary__level">
                              {t('label.trustLevel')} {formatNumber(roleData?.level)}
                            </span>
                          </div>
                          <dl className="account-role-summary__metrics">
                            <div>
                              <dt>{t('label.score')}</dt>
                              <dd>{formatNumber(roleData?.score)}</dd>
                            </div>
                            <div>
                              <dt>{t('label.ratings')}</dt>
                              <dd>
                                <span className="positive">
                                  +{formatNumber(roleData?.inboundRatings.positiveRatingCount ?? 0)}
                                </span>{' '}
                                <span className="negative">
                                  -{formatNumber(roleData?.inboundRatings.negativeRatingCount ?? 0)}
                                </span>
                              </dd>
                            </div>
                            <div>
                              <dt>{t('label.youRated')}</dt>
                              <dd>
                                <RatingValue
                                  category={role}
                                  pending={displayed.pending ? displayed.value : undefined}
                                  value={displayed.value}
                                />
                              </dd>
                            </div>
                          </dl>
                        </div>
                      </td>
                    );
                  })
                ) : (
                  <td data-label={t('label.youRated')}>
                    <RatingValue
                      category={effectiveCategory}
                      pending={subjectDisplayed.pending ? subjectDisplayed.value : undefined}
                      value={subjectDisplayed.value}
                    />
                    {onRate ? <button className="account-rate-link" type="button" onClick={event => { event.stopPropagation(); onRate(derivation, effectiveCategory); }}>{t('label.rate')}</button> : null}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
