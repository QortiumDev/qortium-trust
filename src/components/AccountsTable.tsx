import { memo, useMemo } from 'react';
import { ArrowDown, ArrowDownUp, ArrowUp, SearchX, Users } from 'lucide-react';
import { categoryLabel, formatNumber, ratingTone } from '../format';
import type {
  AccountRatingCategory,
  IdentityProfilesByAddress,
  SelfAccount,
  TrustDerivation,
  TrustStatus,
} from '../types';
import type { AccountSortKey, AccountSortState, PendingRatingEntry, RatingsByAddress } from '../viewTypes';
import {
  compareAccountLabels,
  compareAccountRows,
  getAccountBlocksMinted,
  getAriaSort,
  getDerivationCategory,
} from '../accountSort';
import { EmptyState, IdentityAvatar, IdentityLabel, StatusBadge } from './Identity';
import { t } from '../i18n';

const MemoIdentityAvatar = memo(IdentityAvatar);
const MemoStatusBadge = memo(StatusBadge);

/**
 * Cross-category rating values use the same stable key as pendingRatingKey:
 * `${category}:${targetAddress}`.
 */
export type RatingValuesByAccountCategory = Record<string, number>;

type PendingValueByAccountCategory = Record<string, number | PendingRatingEntry>;

const ROLE_ORDER: AccountRatingCategory[] = ['MANAGER', 'TRAINER', 'PLAYER', 'SUBJECT'];

function ratingKey(category: AccountRatingCategory, targetAddress: string) {
  return `${category}:${targetAddress}`;
}

function getPendingValue(
  pendingByKey: PendingValueByAccountCategory | undefined,
  category: AccountRatingCategory,
  targetAddress: string,
) {
  const entry = pendingByKey?.[ratingKey(category, targetAddress)];

  return typeof entry === 'number' ? entry : entry?.rating;
}

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
  live: boolean;
  loadedCount?: number;
  onResetFilters?: () => void;
  onSelect: (derivation: TrustDerivation) => void;
  onSort: (key: AccountSortKey) => void;
  profiles: IdentityProfilesByAddress;
  query?: string;
  selectedAddress?: string;
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
  onRate?: (address: string | null) => void;
  onRatingSubmitted?: (entry: PendingRatingEntry) => void;
  openRateAddress?: string | null;
  ratingActionAvailable?: boolean;
  self?: SelfAccount | null;
};

export function AccountsTable({
  category,
  derivations,
  live,
  loadedCount,
  onResetFilters,
  onSelect,
  onSort,
  pendingByAddress = {},
  pendingByKey,
  profiles,
  query = '',
  selectedAddress,
  sort,
  statusFilter = 'ALL',
  totalCount = null,
  youRatedByAddress = {},
  youRatedByKey,
}: AccountsTableProps) {
  const effectiveSelectedCategoryRatings = useMemo<RatingsByAddress>(
    () => ({ ...youRatedByAddress, ...pendingByAddress }),
    [pendingByAddress, youRatedByAddress],
  );

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
              category,
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
    [category, derivations, effectiveSelectedCategoryRatings, profiles, sort],
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
          <span className={`data-mode-badge data-mode-badge--${live ? 'live' : 'snapshot'}`}>
            {live ? t('label.live') : t('label.snapshot')}
          </span>
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
              <SortHeader label={t('label.displayedTrust')} onSort={onSort} sort={sort} sortKey="status" />
            </th>
            <th aria-sort={live ? getAriaSort(sort, 'blocksMinted') : 'none'} title={t('tooltip.blocksMinted')}>
              <SortHeader
                disabled={!live}
                disabledReason={live ? undefined : t('sort.unavailableSnapshot')}
                label={t('label.blocksMinted')}
                onSort={onSort}
                sort={sort}
                sortKey="blocksMinted"
              />
            </th>
            {ROLE_ORDER.map((role) => (
              <th key={role} scope="col">
                {categoryLabel(role)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedDerivations.map((derivation) => {
            const profile = profiles[derivation.accountAddress];

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
                    aria-label={`Open ${profile?.name ?? derivation.accountAddress}`}
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
                <td data-label={t('label.displayedTrust')}>
                  <MemoStatusBadge status={derivation.derivedTrustStatus} />
                </td>
                <td data-label={t('label.blocksMinted')}>
                  {live && derivation.blocksMinted !== undefined
                    ? formatNumber(getAccountBlocksMinted(derivation))
                    : '—'}
                </td>
                {ROLE_ORDER.map((role) => {
                  const roleData = getDerivationCategory(derivation, role);
                  const currentValue =
                    youRatedByKey?.[ratingKey(role, derivation.accountAddress)] ??
                    (role === category ? youRatedByAddress[derivation.accountAddress] : undefined);
                  const pendingValue =
                    getPendingValue(pendingByKey, role, derivation.accountAddress) ??
                    (role === category ? pendingByAddress[derivation.accountAddress] : undefined);

                  return (
                    <td className="account-role-cell" data-label={categoryLabel(role)} key={role}>
                      <div className="account-role-summary">
                        <div className="account-role-summary__standing">
                          {roleData ? <MemoStatusBadge status={roleData.mappedTrustStatus} /> : <span className="muted">—</span>}
                          <span className="account-role-summary__level">
                            {t('label.level')} {formatNumber(roleData?.level)}
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
                              <RatingValue pending={pendingValue} value={currentValue} />
                            </dd>
                          </div>
                        </dl>
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
