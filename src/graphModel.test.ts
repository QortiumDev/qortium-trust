import { describe, expect, it } from 'vitest';
import { createTrustGraphModelFromServer, filterTrustGraphEdges, focusTrustGraphModel } from './graphModel';
import { filterDerivations } from './derivationFilter';
import type { TrustDerivation, TrustGraph } from './types';

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
    mintingSeedMember: true,
  },
];

const serverGraph: TrustGraph = {
  category: 'SUBJECT',
  nodes: ['Qroot', 'Qincoming', 'Qoutgoing'].map((address) => ({
    address,
    level: 1,
    score: 10,
    seedMember: false,
    status: 'BRONZE',
  })),
  edges: [
    { confidence: 2, rating: 3, source: 'Qincoming', target: 'Qroot' },
    { confidence: 1, rating: -2, source: 'Qroot', target: 'Qoutgoing' },
    { confidence: 1, rating: 1, source: 'Qincoming', target: 'Qoutgoing' },
  ],
};

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe('trust graph model', () => {
  it('builds a visual model from the typed server graph shape', () => {
    const graph = createTrustGraphModelFromServer(serverGraph);

    expect(graph.nodes.map((node) => node.address).sort()).toEqual([
      'Qincoming',
      'Qoutgoing',
      'Qroot',
    ]);
    expect(graph.links).toHaveLength(3);
    expect(graph.links[0]).toMatchObject({
      category: 'SUBJECT',
      confidence: 2,
      rating: 3,
      source: 'Qincoming',
      target: 'Qroot',
    });
  });

  it('defaults a rooted graph to direct incident edges', () => {
    const graph = createTrustGraphModelFromServer(serverGraph, { rootAddress: 'Qroot' });

    expect(graph.links.map((link) => [link.source, link.target])).toEqual([
      ['Qincoming', 'Qroot'],
      ['Qroot', 'Qoutgoing'],
    ]);
    expect(graph.nodes.map((node) => node.address).sort()).toEqual([
      'Qincoming',
      'Qoutgoing',
      'Qroot',
    ]);
  });

  it('filters rooted edges by direction relative to the root', () => {
    expect(
      filterTrustGraphEdges(serverGraph.edges, {
        direction: 'incoming',
        rootAddress: 'Qroot',
      }).map((edge) => [edge.source, edge.target]),
    ).toEqual([['Qincoming', 'Qroot']]);

    expect(
      filterTrustGraphEdges(serverGraph.edges, {
        direction: 'outgoing',
        rootAddress: 'Qroot',
      }).map((edge) => [edge.source, edge.target]),
    ).toEqual([['Qroot', 'Qoutgoing']]);
  });

  it('filters edges by positive or negative sign', () => {
    expect(
      filterTrustGraphEdges(serverGraph.edges, {
        rootAddress: 'Qroot',
        sign: 'positive',
      }).map((edge) => edge.rating),
    ).toEqual([3]);

    expect(
      filterTrustGraphEdges(serverGraph.edges, {
        rootAddress: 'Qroot',
        sign: 'negative',
      }).map((edge) => edge.rating),
    ).toEqual([-2]);
  });

  it('keeps induced neighbor edges only when explicitly requested', () => {
    const graph = createTrustGraphModelFromServer(serverGraph, {
      incidentOnly: false,
      rootAddress: 'Qroot',
    });

    expect(graph.links).toHaveLength(3);
  });

  it('creates a placeholder node for a rating endpoint absent from the node list', () => {
    const graph = createTrustGraphModelFromServer({
      category: 'SUBJECT',
      edges: [{ confidence: 2, rating: 2, source: 'Qbob', target: 'Qalice' }],
      nodes: [{ address: 'Qalice', level: 1, score: 10, seedMember: true, status: 'BRONZE' }],
    });

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
    const graph = createTrustGraphModelFromServer({
      category: 'SUBJECT',
      edges: [{ confidence: 2, rating: 0, source: 'Qzero', target: 'Qalice' }],
      nodes: [{ address: 'Qalice', level: 1, score: 10, seedMember: true, status: 'BRONZE' }],
    });

    expect(graph.links).toHaveLength(0);
    expect(graph.nodes.map((node) => node.address)).toEqual(['Qalice']);
  });

  it('sizes highly connected nodes larger than isolated nodes', () => {
    const graph = createTrustGraphModelFromServer({
      category: 'SUBJECT',
      edges: [
        { confidence: 2, rating: 4, source: 'Qa', target: 'Qtarget' },
        { confidence: 2, rating: 3, source: 'Qb', target: 'Qtarget' },
        { confidence: 2, rating: -2, source: 'Qc', target: 'Qtarget' },
      ],
      nodes: [
        { address: 'Qtarget', level: 1, score: 10, seedMember: false, status: 'BRONZE' },
        { address: 'Qisolated', level: 1, score: 10, seedMember: false, status: 'BRONZE' },
      ],
    });
    const target = graph.nodes.find((node) => node.address === 'Qtarget');
    const isolated = graph.nodes.find((node) => node.address === 'Qisolated');

    expect(target?.radius).toBeGreaterThan(isolated?.radius ?? 0);
  });

  it('moves a focused node closer to the graph center', () => {
    const base = createTrustGraphModelFromServer(serverGraph);
    const focused = focusTrustGraphModel(base, 'Qroot');
    const baseNode = base.nodes.find((node) => node.address === 'Qroot');
    const focusedNode = focused.nodes.find((node) => node.address === 'Qroot');
    const center = { x: base.width / 2, y: base.height / 2 };

    expect(baseNode).toBeDefined();
    expect(focusedNode).toBeDefined();
    expect(distance(focusedNode!, center)).toBeLessThanOrEqual(distance(baseNode!, center));
    expect(focused.nodes.map((node) => node.address).sort()).toEqual(
      base.nodes.map((node) => node.address).sort(),
    );
  });

  it('frames every node inside the reported canvas bounds', () => {
    const graph = createTrustGraphModelFromServer(serverGraph);

    for (const node of graph.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.x).toBeLessThanOrEqual(graph.width);
      expect(node.y).toBeLessThanOrEqual(graph.height);
    }
  });

  it('is deterministic for the same input', () => {
    const first = createTrustGraphModelFromServer(serverGraph);
    const second = createTrustGraphModelFromServer(serverGraph);

    expect(second.width).toBe(first.width);
    expect(second.height).toBe(first.height);
    expect(second.nodes.map((node) => [node.address, node.x, node.y])).toEqual(
      first.nodes.map((node) => [node.address, node.x, node.y]),
    );
  });

  it('separates unrelated nodes instead of stacking them in one column', () => {
    // Three accounts with no ratings between them: the old lane layout placed them at one shared x;
    // the force layout must spread them apart in two dimensions.
    const isolatedGraph: TrustGraph = {
      category: 'SUBJECT',
      edges: [],
      nodes: ['Qone', 'Qtwo', 'Qthree'].map((address) => ({
        address,
        level: 1,
        score: 10,
        seedMember: true,
        status: 'BRONZE',
      })),
    };

    const graph = createTrustGraphModelFromServer(isolatedGraph);
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
