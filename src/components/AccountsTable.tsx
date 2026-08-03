import { memo, useMemo } from 'react';
import { ArrowDown, ArrowDownUp, ArrowUp, SearchX, Users } from 'lucide-react';
import { categoryLabel, formatNumber, ratingTone } from '../format';
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

const MemoIdentityAvatar = memo(IdentityAvatar);
const MemoStatusBadge = memo(StatusBadge);

const ROLE_ORDER: AccountRatingCategory[] = ['MANAGER', 'TRAINER', 'PLAYER', 'SUBJECT'];

function RatingValue({ pending, value }: { pending?: number; value?: number }) {
  if (pending !== undefined) {
    return (
      <span className="you-rated-pending" title={t('rating.pendingConfirmation')}>
        <span aria-hidden="true" className="you-rated-spinner" />
        {pending !== 0 ? (
          <span className={`you-rated ${ratingTone(pending)}`}>{pending > 0 ? `+${pending}` : pending}</span>
        ) : (
          <span className="muted">—</span>
        )}
      </span>
    );
  }

  if (value === undefined) {
    return <span className="muted">—</span>;
  }

  return <span className={`you-rated ${ratingTone(value)}`}>{value > 0 ? `+${value}` : value}</span>;
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
  category: AccountRatingCategory;
  derivations: TrustDerivation[];
  loadedCount?: number;
  onResetFilters?: () => void;
  onSelect: (derivation: TrustDerivation) => void;
  onSort: (key: AccountSortKey) => void;
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
  category,
  derivations,
  loadedCount,
  onResetFilters,
  onSelect,
  onSort,
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
    () => ({ ...youRatedByAddress, ...pendingByAddress }),
    [pendingByAddress, youRatedByAddress],
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
            );

            if (comparison !== 0) {
              return direction === 'asc' ? comparison : -comparison;
            }
          }

          return compareAccountLabels(left.derivation, right.derivation, profiles) || left.index - right.index;
        })
        .map(({ derivation }) => derivation),
    [derivations, effectiveCategory, effectiveSelectedCategoryRatings, profiles, sort],
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
      <table className="accounts-table accounts-table--unified">
        <caption className="table-caption">
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
              <SortHeader
                label={showAllRoles ? t('label.displayedTrust') : t('label.minterStatus')}
                onSort={onSort}
                sort={sort}
                sortKey="status"
              />
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
                  {categoryLabel(role)}
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
                <td data-label={t('label.account')}>
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
                </td>
                <td data-label={showAllRoles ? t('label.displayedTrust') : t('label.minterStatus')}>
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
                <td data-label={t('label.blocksMinted')}>
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
                      <td className="account-role-cell" data-label={categoryLabel(role)} key={role}>
                        <div className="account-role-summary">
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
                                <RatingValue pending={displayed.pending ? displayed.value : undefined} value={displayed.value} />
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
                      pending={subjectDisplayed.pending ? subjectDisplayed.value : undefined}
                      value={subjectDisplayed.value}
                    />
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
