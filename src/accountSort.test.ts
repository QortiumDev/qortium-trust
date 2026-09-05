import { describe, expect, it } from 'vitest';
import {
  changeAccountSortState,
  RECENT_ACCOUNT_SORT,
  compareAccountRows,
  getTrustDerivationServerSort,
  UNRATED_SORT_VALUE,
} from './accountSort';
import type {
  AccountRatingCategory,
  IdentityProfilesByAddress,
  RatingCounts,
  TrustCategory,
  TrustDerivation,
} from './types';
import type { AccountSortState, RatingsByAddress } from './viewTypes';

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
    blocksMinted: 0,
    mintingLevel: 0,
    effectiveVoteWeight: 0,
    categories: [category()],
    ...overrides,
  };
}

const profiles: IdentityProfilesByAddress = {};

function compare(
  left: TrustDerivation,
  right: TrustDerivation,
  key: Parameters<typeof compareAccountRows>[2],
  youRated: RatingsByAddress = {},
) {
  return compareAccountRows(left, right, key, CATEGORY, profiles, youRated);
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

describe('compareAccountRows — minting columns', () => {
  it('sorts level by the active category level and blocks by the derivation row', () => {
    const high = derivation('Qhigh', {
      blocksMinted: 5000,
      categories: [category({ level: 5 })],
    });
    const low = derivation('Qlow', {
      blocksMinted: 100,
      categories: [category({ level: 2 })],
    });

    expect(compare(high, low, 'level')).toBe(5 - 2);
    expect(compare(high, low, 'blocksMinted')).toBe(5000 - 100);
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

describe('getTrustDerivationServerSort', () => {
  it('maps supported primary sort keys to Core orderBy values', () => {
    expect(getTrustDerivationServerSort([{ key: 'score', direction: 'desc' }])).toEqual({
      orderBy: 'score',
      reverse: undefined,
    });
    expect(getTrustDerivationServerSort([{ key: 'level', direction: 'asc' }])).toEqual({
      orderBy: 'level',
      reverse: true,
    });
  });

  it('does not map client-only or semantically different sort keys', () => {
    expect(
      getTrustDerivationServerSort([
        { key: 'youRated', direction: 'desc' },
        { key: 'blocksMinted', direction: 'desc' },
      ]),
    ).toEqual({});
    expect(getTrustDerivationServerSort([{ key: 'account', direction: 'asc' }])).toEqual({});
    expect(getTrustDerivationServerSort([{ key: 'youRated', direction: 'desc' }])).toEqual({});
  });
});

// Core selects pages after its default descending numeric comparison. Local row sorting cannot
// recover large accounts accidentally excluded from the first page.
it('selects the highest 250 minted counts before the next page', () => {
  const accounts = Array.from({ length: 251 }, (_, blocksMinted) => derivation(`Q${blocksMinted}`, { blocksMinted }));
  const request = getTrustDerivationServerSort([{ key: 'blocksMinted', direction: 'desc' }]);
  const serverOrdered = [...accounts].sort((a, b) => b.blocksMinted! - a.blocksMinted!);
  if (request.reverse) serverOrdered.reverse();
  const firstPage = serverOrdered.slice(0, 250);
  expect(firstPage[0].blocksMinted).toBe(250);
  expect(firstPage.at(-1)?.blocksMinted).toBe(1);
  expect(serverOrdered[250].blocksMinted).toBe(0);
});

it('orders latest outgoing submissions ahead of minting count and leaves no-activity accounts last', () => {
  const newer = derivation('Qnew', { blocksMinted: 0 });
  const older = derivation('Qold', { blocksMinted: 100000 });
  const none = derivation('Qnone', { blocksMinted: 200000 });
  const activity = { Qnew: { timestamp: 200, signature: 'new', publicKey: 'newKey' }, Qold: { timestamp: 100, signature: 'old', publicKey: 'oldKey' } };
  expect([none, older, newer].sort((a, b) => -compareAccountRows(a, b, 'latestRating', CATEGORY, profiles, {}, activity)).map(a => a.accountAddress)).toEqual(['Qnew', 'Qold', 'Qnone']);
});

it('uses Minter status then name to break activity ties, including people who never rated', () => {
  const rows = [
    derivation('QgoldB', { derivedTrustStatusValue: 4 }),
    derivation('Qsilver', { derivedTrustStatusValue: 3 }),
    derivation('QgoldA', { derivedTrustStatusValue: 4 }),
    derivation('Qactive', { derivedTrustStatusValue: 0 }),
    derivation('Qsuspicious', { derivedTrustStatusValue: -1 }),
  ];
  const activity = { Qactive: { timestamp: 200, signature: 'one', publicKey: 'key' } };
  const sorted = [...rows].sort((a, b) => {
    for (const entry of RECENT_ACCOUNT_SORT) {
      const value = compareAccountRows(a, b, entry.key, 'MANAGER', profiles, {}, activity);
      if (value) return entry.direction === 'desc' ? -value : value;
    }
    return 0;
  });
  expect(sorted.map(row => row.accountAddress)).toEqual(['Qactive', 'QgoldA', 'QgoldB', 'Qsilver', 'Qsuspicious']);
  const fromOtherSort = changeAccountSortState([{ key: 'blocksMinted', direction: 'desc' }], 'latestRating');
  expect(fromOtherSort).toEqual(RECENT_ACCOUNT_SORT);
  expect(changeAccountSortState(fromOtherSort, 'latestRating')).toEqual([
    { key: 'latestRating', direction: 'asc' }, ...RECENT_ACCOUNT_SORT.slice(1),
  ]);
});
