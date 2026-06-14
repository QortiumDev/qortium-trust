import { describe, expect, it } from 'vitest';
import { createTrustGraphModel, filterDerivations } from './graphModel';
import type { AccountRating, TrustDerivation } from './types';

const derivations: TrustDerivation[] = [
  {
    accountAddress: 'Qalice',
    accountPublicKey: 'alice-public',
    categories: [
      {
        category: 'SUBJECT',
        inboundRatings: {
          negativeHighCount: 0,
          negativeLowCount: 0,
          negativeMediumCount: 0,
          negativeRatingCount: 0,
          negativeVeryHighCount: 0,
          positiveHighCount: 0,
          positiveLowCount: 1,
          positiveMediumCount: 0,
          positiveRatingCount: 1,
          positiveVeryHighCount: 0,
          totalRatingCount: 1,
        },
        impacts: [],
        level: 1,
        levelScore: 10,
        levelScoreCap: 100,
        mappedTrustStatus: 'BRONZE',
        mappedTrustStatusValue: 1,
        score: 10,
      },
    ],
    derivedTrustStatus: 'BRONZE',
    derivedTrustStatusValue: 1,
    derivedTrustWeightPercent: 40,
    live: false,
    mintingSeedMember: true,
    snapshotHeight: 10,
    snapshotTimestamp: 1000,
  },
];

const ratings: AccountRating[] = [
  {
    category: 'SUBJECT',
    raterAddress: 'Qbob',
    raterPublicKey: 'bob-public',
    rating: 2,
    ratingConfidence: 2,
    ratingDirection: 'POSITIVE',
    targetAddress: 'Qalice',
    targetPublicKey: 'alice-public',
  },
];

describe('trust graph model', () => {
  it('creates nodes from derivations and rating endpoints', () => {
    const graph = createTrustGraphModel(derivations, ratings, 'SUBJECT');

    expect(graph.nodes.map((node) => node.address).sort()).toEqual(['Qalice', 'Qbob']);
    expect(graph.links).toEqual([
      {
        category: 'SUBJECT',
        confidence: 2,
        id: 'Qbob-Qalice-SUBJECT',
        rating: 2,
        source: 'Qbob',
        target: 'Qalice',
      },
    ]);
  });

  it('filters derivations by address or public key', () => {
    expect(filterDerivations(derivations, 'alice-public')).toHaveLength(1);
    expect(filterDerivations(derivations, 'missing')).toHaveLength(0);
  });
});
