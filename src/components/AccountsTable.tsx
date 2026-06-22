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

// #14: IdentityAvatar / StatusBadge / RateCell live in other modules (Identity.tsx, RatingControls.tsx)
// that this lane does not own, so they can't be wrapped in React.memo at their definition. Wrapping
// them at the table-render boundary here gives the same benefit: an unchanged row's cells skip
// re-render when unrelated state (openRateAddress / selectedAddress churn) changes, because memo
// shallow-compares props and these wrappers receive primitive/stable props.
const MemoIdentityAvatar = memo(IdentityAvatar);
const MemoStatusBadge = memo(StatusBadge);
const MemoRateCell = memo(RateCell);

export function SortHeader({
  label,
  onSort,
  sort,
  sortKey,
}: {
  label: string;
  onSort: (key: AccountSortKey) => void;
  sort: AccountSortState;
  sortKey: AccountSortKey;
}) {
  const rank = sort.findIndex((entry) => entry.key === sortKey);
  const active = rank >= 0;
  const Icon = active ? (sort[rank].direction === 'asc' ? ArrowUp : ArrowDown) : ArrowDownUp;

  // #21: multi-column sort rank is otherwise conveyed only by a 9px number, invisible to screen
  // readers. Announce the active direction and this column's tiebreak priority out of the total.
  const sortStateLabel = active
    ? `, sorted ${sort[rank].direction === 'asc' ? 'ascending' : 'descending'}` +
      (sort.length > 1 ? `, sort priority ${rank + 1} of ${sort.length}` : '')
    : ', not sorted';

  return (
    <button
      className={`sort-header ${active ? 'active' : ''}`}
      onClick={() => onSort(sortKey)}
      title={`Sort by ${label}`}
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
  youRatedByAddress,
}: {
  category: AccountRatingCategory;
  derivations: TrustDerivation[];
  // Minting columns (Level/Blocks) are only populated on live derivations; in snapshot mode they
  // render as "—" because Core returns 0 placeholders there (#9).
  live: boolean;
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
          <EmptyState icon={<SearchX size={18} />} text="No accounts match your search or filter." />
          {onResetFilters ? (
            <button className="empty-state-reset" onClick={onResetFilters} type="button">
              Reset search and filter
            </button>
          ) : null}
        </div>
      );
    }

    return <EmptyState icon={<Users size={18} />} text="No accounts in this category yet." />;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th aria-sort={getAriaSort(sort, 'account')}>
              <SortHeader label="Account" onSort={onSort} sort={sort} sortKey="account" />
            </th>
            <th aria-sort={getAriaSort(sort, 'status')}>
              <SortHeader label="Status" onSort={onSort} sort={sort} sortKey="status" />
            </th>
            <th aria-sort={getAriaSort(sort, 'level')}>
              <SortHeader label="Level" onSort={onSort} sort={sort} sortKey="level" />
            </th>
            <th aria-sort={getAriaSort(sort, 'blocksMinted')}>
              <SortHeader label="Blocks minted" onSort={onSort} sort={sort} sortKey="blocksMinted" />
            </th>
            <th aria-sort={getAriaSort(sort, 'score')}>
              <SortHeader label="Score" onSort={onSort} sort={sort} sortKey="score" />
            </th>
            <th aria-sort={getAriaSort(sort, 'ratings')}>
              <SortHeader label="Ratings" onSort={onSort} sort={sort} sortKey="ratings" />
            </th>
            <th aria-sort={getAriaSort(sort, 'youRated')}>
              <SortHeader label="You rated" onSort={onSort} sort={sort} sortKey="youRated" />
            </th>
            <th aria-sort={getAriaSort(sort, 'voteWeight')}>
              <SortHeader label="Vote weight" onSort={onSort} sort={sort} sortKey="voteWeight" />
            </th>
            <th aria-sort={getAriaSort(sort, 'seed')}>
              <SortHeader label="Seed" onSort={onSort} sort={sort} sortKey="seed" />
            </th>
            <th>Rate</th>
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
                className={selectedAddress === derivation.accountAddress ? 'selected-row' : ''}
                key={derivation.accountAddress}
                onClick={() => onSelect(derivation)}
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
                <td>{live ? formatNumber(getAccountMintingLevel(derivation)) : '—'}</td>
                <td>{live ? formatNumber(getAccountBlocksMinted(derivation)) : '—'}</td>
                <td>{formatNumber(categoryData?.score ?? 0)}</td>
                <td>
                  {formatNumber(inbound?.positiveRatingCount ?? 0)} / {formatNumber(inbound?.negativeRatingCount ?? 0)}
                </td>
                <td>
                  {pendingRating !== undefined ? (
                    <span className="you-rated-pending" title="Submitted — waiting for confirmation">
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
                <td>{derivation.mintingSeedMember ? 'Yes' : 'No'}</td>
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
