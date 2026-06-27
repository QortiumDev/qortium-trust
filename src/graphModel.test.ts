import { describe, expect, it } from 'vitest';
import { createTrustGraphModel, focusTrustGraphModel } from './graphModel';
import { filterDerivations } from './derivationFilter';
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
    blocksMinted: 0,
    mintingLevel: 0,
    effectiveVoteWeight: 0,
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

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe('trust graph model', () => {
  it('creates nodes from derivations and rating endpoints', () => {
    const graph = createTrustGraphModel(derivations, ratings, 'SUBJECT');

    expect(graph.nodes.map((node) => node.address).sort()).toEqual(['Qalice', 'Qbob']);
    // Links keep their identity/metadata and resolve back to plain address strings after the
    // force simulation (which temporarily swaps source/target for node references).
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

  it('omits zero ratings from links and placeholder nodes', () => {
    const graph = createTrustGraphModel(
      derivations,
      [
        {
          ...ratings[0],
          raterAddress: 'Qzero',
          raterPublicKey: 'zero-public',
          rating: 0,
        },
      ],
      'SUBJECT',
    );

    expect(graph.links).toHaveLength(0);
    expect(graph.nodes.map((node) => node.address)).toEqual(['Qalice']);
  });

  it('sizes highly connected nodes larger than isolated nodes', () => {
    const graph = createTrustGraphModel(
      [
        ...derivations,
        {
          ...derivations[0],
          accountAddress: 'Qtarget',
          accountPublicKey: 'target-public',
          mintingSeedMember: false,
        },
        {
          ...derivations[0],
          accountAddress: 'Qisolated',
          accountPublicKey: 'isolated-public',
          mintingSeedMember: false,
        },
      ],
      [
        { ...ratings[0], raterAddress: 'Qa', targetAddress: 'Qtarget', rating: 4, ratingConfidence: 2 },
        { ...ratings[0], raterAddress: 'Qb', targetAddress: 'Qtarget', rating: 3, ratingConfidence: 2 },
        { ...ratings[0], raterAddress: 'Qc', targetAddress: 'Qtarget', rating: -2, ratingConfidence: 2 },
      ],
      'SUBJECT',
    );
    const target = graph.nodes.find((node) => node.address === 'Qtarget');
    const isolated = graph.nodes.find((node) => node.address === 'Qisolated');

    expect(target?.radius).toBeGreaterThan(isolated?.radius ?? 0);
  });

  it('moves a focused node closer to the graph center', () => {
    const base = createTrustGraphModel(derivations, ratings, 'SUBJECT');
    const focused = focusTrustGraphModel(base, 'Qalice');
    const baseNode = base.nodes.find((node) => node.address === 'Qalice');
    const focusedNode = focused.nodes.find((node) => node.address === 'Qalice');
    const center = { x: base.width / 2, y: base.height / 2 };

    expect(baseNode).toBeDefined();
    expect(focusedNode).toBeDefined();
    expect(distance(focusedNode!, center)).toBeLessThanOrEqual(distance(baseNode!, center));
    expect(focused.nodes.map((node) => node.address).sort()).toEqual(
      base.nodes.map((node) => node.address).sort(),
    );
  });

  it('frames every node inside the reported canvas bounds', () => {
    const graph = createTrustGraphModel(derivations, ratings, 'SUBJECT');

    for (const node of graph.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.x).toBeLessThanOrEqual(graph.width);
      expect(node.y).toBeLessThanOrEqual(graph.height);
    }
  });

  it('is deterministic for the same input', () => {
    const first = createTrustGraphModel(derivations, ratings, 'SUBJECT');
    const second = createTrustGraphModel(derivations, ratings, 'SUBJECT');

    expect(second.width).toBe(first.width);
    expect(second.height).toBe(first.height);
    expect(second.nodes.map((node) => [node.address, node.x, node.y])).toEqual(
      first.nodes.map((node) => [node.address, node.x, node.y]),
    );
  });

  it('separates unrelated nodes instead of stacking them in one column', () => {
    // Three accounts with no ratings between them: the old lane layout placed them at one shared x;
    // the force layout must spread them apart in two dimensions.
    const isolated: TrustDerivation[] = ['Qone', 'Qtwo', 'Qthree'].map((address) => ({
      ...derivations[0],
      accountAddress: address,
      accountPublicKey: `${address}-public`,
    }));

    const graph = createTrustGraphModel(isolated, [], 'SUBJECT');
    const xs = new Set(graph.nodes.map((node) => Math.round(node.x)));
    const pairwise = [
      distance(graph.nodes[0], graph.nodes[1]),
      distance(graph.nodes[0], graph.nodes[2]),
      distance(graph.nodes[1], graph.nodes[2]),
    ];

    expect(xs.size).toBeGreaterThan(1);
    for (const gap of pairwise) {
      expect(gap).toBeGreaterThan(0);
    }
  });

  it('filters derivations by address or public key', () => {
    expect(filterDerivations(derivations, 'alice-public')).toHaveLength(1);
    expect(filterDerivations(derivations, 'missing')).toHaveLength(0);
  });
});
