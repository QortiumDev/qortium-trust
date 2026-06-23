import { memo, useEffect, useMemo } from 'react';
import { ArrowDown, ArrowDownUp, ArrowUp, SearchX, Users } from 'lucide-react';
import { formatNumber, formatPercent, ratingTone } from '../format';
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
  getAccountMintingLevel,
  getAriaSort,
  getDerivationCategory,
} from '../accountSort';
import { EmptyState, IdentityAvatar, IdentityLabel, StatusBadge } from './Identity';
import { RateCell } from './RatingControls';
import { t } from '../i18n';

// #14: IdentityAvatar / StatusBadge / RateCell live in other modules (Identity.tsx, RatingControls.tsx)
// that this lane does not own, so they can't be wrapped in React.memo at their definition. Wrapping
// them at the table-render boundary here gives the same benefit: an unchanged row's cells skip
// re-render when unrelated state (openRateAddress / selectedAddress churn) changes, because memo
// shallow-compares props and these wrappers receive primitive/stable props.
const MemoIdentityAvatar = memo(IdentityAvatar);
const MemoStatusBadge = memo(StatusBadge);
const MemoRateCell = memo(RateCell);

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

  // #21: multi-column sort rank is otherwise conveyed only by a 9px number, invisible to screen
  // readers. Announce the active direction and this column's tiebreak priority out of the total.
  const sortStateLabel = disabled
    ? `, ${disabledReason ? t('sort.unavailableReason', { reason: disabledReason }) : t('sort.unavailable')}`
    : active
    ? `, ${t('sort.sorted', {
      direction: sort[rank].direction === 'asc' ? t('sort.ascending') : t('sort.descending'),
    })}` +
      (sort.length > 1 ? `, ${t('sort.priority', { rank: rank + 1, total: sort.length })}` : '')
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

export function AccountsTable({
  category,
  derivations,
  live,
  loadedCount,
  onRate,
  onRatingSubmitted,
  onResetFilters,
  onSelect,
  onSort,
  openRateAddress,
  pendingByAddress,
  profiles,
  query = '',
  ratingActionAvailable,
  self,
  selectedAddress,
  sort,
  statusFilter = 'ALL',
  totalCount = null,
  youRatedByAddress,
}: {
  category: AccountRatingCategory;
  derivations: TrustDerivation[];
  // Minting columns (Level/Blocks) are only populated on live derivations; in snapshot mode they
  // render as "—" because Core returns 0 placeholders there (#9).
  live: boolean;
  // Accounts fetched for this category (pre client-side filter) and the full category size from the
  // listing's X-Total-Count header; together they drive the "showing first N of M" caption.
  loadedCount?: number;
  onRate: (address: string | null) => void;
  onRatingSubmitted: (entry: PendingRatingEntry) => void;
  onResetFilters?: () => void;
  onSelect: (derivation: TrustDerivation) => void;
  onSort: (key: AccountSortKey) => void;
  openRateAddress: string | null;
  pendingByAddress: RatingsByAddress;
  profiles: IdentityProfilesByAddress;
  query?: string;
  ratingActionAvailable: boolean;
  self: SelfAccount | null;
  selectedAddress?: string;
  sort: AccountSortState;
  statusFilter?: TrustStatus | 'ALL';
  totalCount?: number | null;
  youRatedByAddress: RatingsByAddress;
}) {
  // Close any open quick-rate popover when the sort or category changes, since the row it was
  // anchored to may move or its cooldown context may change. onRate is setOpenRateAddress (stable).
  useEffect(() => {
    onRate(null);
  }, [category, sort, onRate]);

  // A pending (unconfirmed) rating optimistically overrides the confirmed value for sorting, so a
  // freshly-rated account jumps to its new position immediately.
  const effectiveYouRated = useMemo<RatingsByAddress>(
    () => ({ ...youRatedByAddress, ...pendingByAddress }),
    [pendingByAddress, youRatedByAddress],
  );

  const sortedDerivations = useMemo(
    () =>
      derivations
        .map((derivation, index) => ({ derivation, index }))
        .sort((left, right) => {
          // Apply each sort column in priority order; the first to break the tie wins.
          for (const { direction, key } of sort) {
            const comparison = compareAccountRows(
              left.derivation,
              right.derivation,
              key,
              category,
              profiles,
              effectiveYouRated,
            );

            if (comparison !== 0) {
              return direction === 'asc' ? comparison : -comparison;
            }
          }

          return compareAccountLabels(left.derivation, right.derivation, profiles) || left.index - right.index;
        })
        .map(({ derivation }) => derivation),
    [category, derivations, effectiveYouRated, profiles, sort],
  );

  // #19: distinguish "your search/filter matched nothing" (recoverable — offer a reset) from
  // "this category genuinely has no accounts" (nothing to reset).
  if (sortedDerivations.length === 0) {
    const filtering = query.trim().length > 0 || statusFilter !== 'ALL';

    if (filtering) {
      // Reuse the shared EmptyState markup, but add an inline reset affordance. EmptyState only
      // accepts { icon, text } (it is owned by another lane), so the reset button is rendered
      // alongside it rather than threaded through as a prop.
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

  const mintingSortDisabledReason = live ? undefined : t('sort.unavailableSnapshot');
  // Only surface the cap hint on the unfiltered list (it describes the server fetch window, which
  // would be misleading beside a client-filtered subset) and only when the server actually has more
  // accounts than were fetched. `loadedCount` is the pre-filter fetched count.
  const filtering = query.trim().length > 0 || statusFilter !== 'ALL';
  const showCountHint =
    !filtering && typeof totalCount === 'number' && typeof loadedCount === 'number' && totalCount > loadedCount;

  return (
    <div aria-label={t('nav.accounts')} className="table-wrap" role="region" tabIndex={0}>
      <table className="accounts-table">
        <caption className="table-caption">
          {/* Data-freshness badge (UX-007): in snapshot mode the Level/Blocks columns read "—", so
              surfacing the mode explains why. */}
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
              <SortHeader label={t('label.status')} onSort={onSort} sort={sort} sortKey="status" />
            </th>
            <th aria-sort={live ? getAriaSort(sort, 'level') : 'none'} title={t('tooltip.level')}>
              <SortHeader
                disabled={!live}
                disabledReason={mintingSortDisabledReason}
                label={t('label.level')}
                onSort={onSort}
                sort={sort}
                sortKey="level"
              />
            </th>
            <th aria-sort={live ? getAriaSort(sort, 'blocksMinted') : 'none'} title={t('tooltip.blocksMinted')}>
              <SortHeader
                disabled={!live}
                disabledReason={mintingSortDisabledReason}
                label={t('label.blocksMinted')}
                onSort={onSort}
                sort={sort}
                sortKey="blocksMinted"
              />
            </th>
            <th aria-sort={getAriaSort(sort, 'score')} title={t('tooltip.score')}>
              <SortHeader label={t('label.score')} onSort={onSort} sort={sort} sortKey="score" />
            </th>
            <th aria-sort={getAriaSort(sort, 'ratings')}>
              <SortHeader label={t('label.ratings')} onSort={onSort} sort={sort} sortKey="ratings" />
            </th>
            <th aria-sort={getAriaSort(sort, 'youRated')}>
              <SortHeader label={t('label.youRated')} onSort={onSort} sort={sort} sortKey="youRated" />
            </th>
            <th aria-sort={getAriaSort(sort, 'voteWeight')} title={t('tooltip.voteWeight')}>
              <SortHeader label={t('label.voteWeight')} onSort={onSort} sort={sort} sortKey="voteWeight" />
            </th>
            <th aria-sort={getAriaSort(sort, 'seed')} title={t('tooltip.seed')}>
              <SortHeader label={t('label.seed')} onSort={onSort} sort={sort} sortKey="seed" />
            </th>
            <th>{t('label.rate')}</th>
          </tr>
        </thead>
        <tbody>
          {sortedDerivations.map((derivation) => {
            const categoryData = getDerivationCategory(derivation, category);
            const inbound = categoryData?.inboundRatings;
            const profile = profiles[derivation.accountAddress];
            const youRated = youRatedByAddress[derivation.accountAddress];
            const pendingRating = pendingByAddress[derivation.accountAddress];

            return (
              <tr
                className={`account-row${selectedAddress === derivation.accountAddress ? ' selected-row' : ''}`}
                key={derivation.accountAddress}
                onClick={() => onSelect(derivation)}
                onKeyDown={(event) => {
                  // Enter/Space activate the row like a click; the rate-cell button keeps its own
                  // focus + Enter handling and stops propagation so it never double-fires (UX-004).
                  if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    onSelect(derivation);
                  }
                }}
                tabIndex={0}
              >
                <td>
                  <div className="identity-cell">
                    <MemoIdentityAvatar address={derivation.accountAddress} profile={profile} size="small" />
                    <IdentityLabel address={derivation.accountAddress} profile={profile} />
                  </div>
                </td>
                <td>
                  <MemoStatusBadge status={derivation.derivedTrustStatus} />
                </td>
                <td>{live ? formatNumber(getAccountMintingLevel(derivation, category)) : '—'}</td>
                <td>{live && derivation.blocksMinted !== undefined ? formatNumber(getAccountBlocksMinted(derivation)) : '—'}</td>
                <td>{formatNumber(categoryData?.score ?? 0)}</td>
                <td>
                  {formatNumber(inbound?.positiveRatingCount ?? 0)} / {formatNumber(inbound?.negativeRatingCount ?? 0)}
                </td>
                <td>
                  {pendingRating !== undefined ? (
                    <span className="you-rated-pending" title={t('rating.pendingConfirmation')}>
                      <span className="you-rated-spinner" aria-hidden="true" />
                      {pendingRating !== 0 ? (
                        <span className={`you-rated ${ratingTone(pendingRating)}`}>
                          {pendingRating > 0 ? `+${pendingRating}` : pendingRating}
                        </span>
                      ) : null}
                    </span>
                  ) : youRated === undefined ? (
                    <span className="muted">—</span>
                  ) : (
                    <span className={`you-rated ${ratingTone(youRated)}`}>
                      {youRated > 0 ? `+${youRated}` : youRated}
                    </span>
                  )}
                </td>
                <td>{formatPercent(derivation.derivedTrustWeightPercent)}</td>
                <td>{derivation.mintingSeedMember ? t('value.yes') : t('value.no')}</td>
                <MemoRateCell
                  category={category}
                  derivation={derivation}
                  onRate={onRate}
                  onRatingSubmitted={onRatingSubmitted}
                  open={openRateAddress === derivation.accountAddress}
                  pendingRating={pendingByAddress[derivation.accountAddress]}
                  ratingActionAvailable={ratingActionAvailable}
                  self={self}
                />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
