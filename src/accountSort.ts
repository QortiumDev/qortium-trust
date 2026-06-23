import { getIdentityLabel } from './identityProfiles';
import type {
  AccountRatingCategory,
  IdentityProfilesByAddress,
  TrustDerivation,
  TrustDerivationOrderBy,
} from './types';
import type { AccountSortKey, AccountSortState, RatingsByAddress, SortDirection } from './viewTypes';

// Sentinel below the -4..+4 rating range so accounts you have not rated sort to the bottom.
export const UNRATED_SORT_VALUE = -5;

const SERVER_SORT_BY_KEY: Partial<Record<AccountSortKey, TrustDerivationOrderBy>> = {
  blocksMinted: 'blocksMinted',
  level: 'level',
  score: 'score',
  voteWeight: 'voteWeight',
};
const NO_SERVER_SORT: { orderBy?: TrustDerivationOrderBy; reverse?: boolean } = {};

export function getDefaultAccountSortDirection(key: AccountSortKey): SortDirection {
  return key === 'account' ? 'asc' : 'desc';
}

export function getDerivationCategory(derivation: TrustDerivation, category: AccountRatingCategory) {
  return derivation.categories.find((candidate) => candidate.category === category);
}

export function getInboundRatingCount(derivation: TrustDerivation, category: AccountRatingCategory) {
  const inbound = getDerivationCategory(derivation, category)?.inboundRatings;

  return (inbound?.positiveRatingCount ?? 0) + (inbound?.negativeRatingCount ?? 0);
}

function getAccountSortLabel(derivation: TrustDerivation, profiles: IdentityProfilesByAddress) {
  return getIdentityLabel(profiles[derivation.accountAddress], derivation.accountAddress);
}

// Minting level/blocks now come off the derivation row itself (#9). They are only meaningful on a
// live derivation; snapshot rows carry 0, so the table renders "—" rather than these values there.
export function getAccountMintingLevel(derivation: TrustDerivation, category: AccountRatingCategory) {
  return getDerivationCategory(derivation, category)?.level ?? derivation.mintingLevel ?? 0;
}

export function getAccountBlocksMinted(derivation: TrustDerivation) {
  return derivation.blocksMinted ?? 0;
}

export function compareAccountLabels(
  left: TrustDerivation,
  right: TrustDerivation,
  profiles: IdentityProfilesByAddress,
) {
  const labelSort = getAccountSortLabel(left, profiles).localeCompare(getAccountSortLabel(right, profiles), undefined, {
    numeric: true,
    sensitivity: 'base',
  });

  return labelSort || left.accountAddress.localeCompare(right.accountAddress);
}

export function compareAccountRows(
  left: TrustDerivation,
  right: TrustDerivation,
  sortKey: AccountSortKey,
  category: AccountRatingCategory,
  profiles: IdentityProfilesByAddress,
  youRatedByAddress: RatingsByAddress,
) {
  const leftCategory = getDerivationCategory(left, category);
  const rightCategory = getDerivationCategory(right, category);

  switch (sortKey) {
    case 'account':
      return compareAccountLabels(left, right, profiles);
    case 'status':
      return left.derivedTrustStatusValue - right.derivedTrustStatusValue;
    case 'level':
      return getAccountMintingLevel(left, category) - getAccountMintingLevel(right, category);
    case 'blocksMinted':
      return getAccountBlocksMinted(left) - getAccountBlocksMinted(right);
    case 'score':
      return (leftCategory?.score ?? 0) - (rightCategory?.score ?? 0);
    case 'ratings': {
      const ratingSort = getInboundRatingCount(left, category) - getInboundRatingCount(right, category);

      if (ratingSort !== 0) {
        return ratingSort;
      }

      return (leftCategory?.inboundRatings.positiveRatingCount ?? 0) -
        (rightCategory?.inboundRatings.positiveRatingCount ?? 0);
    }
    case 'youRated':
      return (youRatedByAddress[left.accountAddress] ?? UNRATED_SORT_VALUE) -
        (youRatedByAddress[right.accountAddress] ?? UNRATED_SORT_VALUE);
    case 'voteWeight':
      return left.derivedTrustWeightPercent - right.derivedTrustWeightPercent;
    case 'seed':
      return Number(left.mintingSeedMember) - Number(right.mintingSeedMember);
    default:
      return 0;
  }
}

export function getAriaSort(sort: AccountSortState, key: AccountSortKey) {
  const entry = sort.find((candidate) => candidate.key === key);

  if (!entry) {
    return 'none';
  }

  return entry.direction === 'asc' ? 'ascending' : 'descending';
}

// Pure transform applied by the App-level changeAccountSort reducer: clicking a column promotes it
// to primary (preserving its direction if it was already a tiebreaker, flipping it if it was already
// primary) and keeps the previous columns as tiebreakers.
export function changeAccountSortState(current: AccountSortState, key: AccountSortKey): AccountSortState {
  const existingIndex = current.findIndex((entry) => entry.key === key);

  // Already the primary column: just flip its direction.
  if (existingIndex === 0) {
    const [primary, ...rest] = current;
    return [{ direction: primary.direction === 'asc' ? 'desc' : 'asc', key }, ...rest];
  }

  // Already a tiebreaker: promote it to primary, preserving its direction.
  if (existingIndex > 0) {
    return [current[existingIndex], ...current.filter((entry) => entry.key !== key)];
  }

  // New column: make it primary and keep the previous columns as tiebreakers.
  return [{ direction: getDefaultAccountSortDirection(key), key }, ...current];
}

export function getTrustDerivationServerSort(sort: AccountSortState): {
  orderBy?: TrustDerivationOrderBy;
  reverse?: boolean;
} {
  const primary = sort[0];
  const orderBy = primary ? SERVER_SORT_BY_KEY[primary.key] : undefined;

  if (!primary || !orderBy) {
    return NO_SERVER_SORT;
  }

  return {
    orderBy,
    reverse: primary.direction === 'desc' ? true : undefined,
  };
}
