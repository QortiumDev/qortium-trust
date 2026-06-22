import { describe, expect, it } from 'vitest';
import { changeAccountSortState, compareAccountRows, UNRATED_SORT_VALUE } from './accountSort';
import type {
  AccountRatingCategory,
  IdentityProfilesByAddress,
  RatingCounts,
  TrustCategory,
  TrustDerivation,
} from './types';
import type { AccountDataByAddress, AccountSortState, RatingsByAddress } from './viewTypes';

const CATEGORY: AccountRatingCategory = 'SUBJECT';

function counts(overrides: Partial<RatingCounts> = {}): RatingCounts {
  return {
    positiveLowCount: 0,
    positiveMediumCount: 0,
    positiveHighCount: 0,
    positiveVeryHighCount: 0,
    negativeLowCount: 0,
    negativeMediumCount: 0,
    negativeHighCount: 0,
    negativeVeryHighCount: 0,
    positiveRatingCount: 0,
    negativeRatingCount: 0,
    totalRatingCount: 0,
    ...overrides,
  };
}

function category(overrides: Partial<TrustCategory> = {}): TrustCategory {
  return {
    category: CATEGORY,
    score: 0,
    levelScore: 0,
    levelScoreCap: 100,
    level: 1,
    mappedTrustStatus: 'BRONZE',
    mappedTrustStatusValue: 1,
    inboundRatings: counts(),
    ...overrides,
  };
}

function derivation(address: string, overrides: Partial<TrustDerivation> = {}): TrustDerivation {
  return {
    accountPublicKey: `${address}-public`,
    accountAddress: address,
    derivedTrustStatus: 'BRONZE',
    derivedTrustStatusValue: 1,
    derivedTrustWeightPercent: 40,
    mintingSeedMember: false,
    snapshotHeight: 1,
    snapshotTimestamp: 1000,
    live: false,
    categories: [category()],
    ...overrides,
  };
}

const profiles: IdentityProfilesByAddress = {};
const accountData: AccountDataByAddress = {};

function compare(
  left: TrustDerivation,
  right: TrustDerivation,
  key: Parameters<typeof compareAccountRows>[2],
  youRated: RatingsByAddress = {},
) {
  return compareAccountRows(left, right, key, CATEGORY, profiles, accountData, youRated);
}

describe('compareAccountRows — youRated', () => {
  const rated = derivation('Qrated');
  const unrated = derivation('Qunrated');

  it('treats an unrated account as the -5 sentinel below the rating range', () => {
    // A +4 rating beats an unrated row; the unrated row uses UNRATED_SORT_VALUE (-5).
    const youRated: RatingsByAddress = { Qrated: 4 };
    expect(compare(rated, unrated, 'youRated', youRated)).toBe(4 - UNRATED_SORT_VALUE);
    expect(compare(rated, unrated, 'youRated', youRated)).toBeGreaterThan(0);
  });

  it('orders a negative rating above an unrated account (since -4 > -5)', () => {
    const youRated: RatingsByAddress = { Qrated: -4 };
    expect(compare(rated, unrated, 'youRated', youRated)).toBe(-4 - UNRATED_SORT_VALUE);
    expect(compare(rated, unrated, 'youRated', youRated)).toBeGreaterThan(0);
  });

  it('ties two unrated accounts at the sentinel', () => {
    expect(compare(unrated, derivation('Qother'), 'youRated', {})).toBe(0);
  });
});

describe('compareAccountRows — ratings tiebreak', () => {
  it('falls back to positiveRatingCount when total inbound counts tie', () => {
    // Both have 4 total inbound ratings, so the primary count comparison is 0; the tiebreak then
    // compares positiveRatingCount (3 vs 1).
    const morePositive = derivation('Qpos', {
      categories: [category({ inboundRatings: counts({ positiveRatingCount: 3, negativeRatingCount: 1 }) })],
    });
    const lessPositive = derivation('Qneg', {
      categories: [category({ inboundRatings: counts({ positiveRatingCount: 1, negativeRatingCount: 3 }) })],
    });

    expect(compare(morePositive, lessPositive, 'ratings')).toBe(3 - 1);
    expect(compare(morePositive, lessPositive, 'ratings')).toBeGreaterThan(0);
  });

  it('uses the total inbound count as the primary comparison', () => {
    const more = derivation('Qmore', {
      categories: [category({ inboundRatings: counts({ positiveRatingCount: 5, negativeRatingCount: 0 }) })],
    });
    const fewer = derivation('Qfewer', {
      categories: [category({ inboundRatings: counts({ positiveRatingCount: 1, negativeRatingCount: 0 }) })],
    });

    expect(compare(more, fewer, 'ratings')).toBe(5 - 1);
  });
});

describe('changeAccountSortState transitions', () => {
  it('flips the direction when the clicked column is already primary', () => {
    const current: AccountSortState = [
      { key: 'score', direction: 'desc' },
      { key: 'account', direction: 'asc' },
    ];

    expect(changeAccountSortState(current, 'score')).toEqual([
      { key: 'score', direction: 'asc' },
      { key: 'account', direction: 'asc' },
    ]);
  });

  it('promotes an existing tiebreaker to primary, preserving its direction', () => {
    const current: AccountSortState = [
      { key: 'score', direction: 'desc' },
      { key: 'account', direction: 'asc' },
    ];

    expect(changeAccountSortState(current, 'account')).toEqual([
      { key: 'account', direction: 'asc' },
      { key: 'score', direction: 'desc' },
    ]);
  });

  it('prepends a new column as primary with its default direction, keeping prior columns as tiebreakers', () => {
    const current: AccountSortState = [{ key: 'score', direction: 'desc' }];

    // 'account' defaults to ascending; every other key defaults to descending.
    expect(changeAccountSortState(current, 'account')).toEqual([
      { key: 'account', direction: 'asc' },
      { key: 'score', direction: 'desc' },
    ]);
    expect(changeAccountSortState(current, 'voteWeight')).toEqual([
      { key: 'voteWeight', direction: 'desc' },
      { key: 'score', direction: 'desc' },
    ]);
  });
});
