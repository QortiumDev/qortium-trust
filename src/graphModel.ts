import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import type { AccountRating, AccountRatingCategory, TrustDerivation, TrustStatus } from './types';

export type TrustGraphNode = SimulationNodeDatum & {
  address: string;
  publicKey?: string;
  status: TrustStatus;
  level: number;
  score: number;
  seedMember: boolean;
  x: number;
  y: number;
};

// d3-force mutates `source`/`target` from address strings into node references while it runs.
// We resolve them back to addresses before returning, so consumers always see plain strings.
export type TrustGraphLink = SimulationLinkDatum<TrustGraphNode> & {
  id: string;
  source: string;
  target: string;
  category: AccountRatingCategory;
  rating: number;
  confidence: number;
};

export type TrustGraphModel = {
  links: TrustGraphLink[];
  nodes: TrustGraphNode[];
  width: number;
  height: number;
};

function getCategory(derivation: TrustDerivation, category: AccountRatingCategory) {
  return derivation.categories.find((candidate) => candidate.category === category);
}

function getNodeFromDerivation(derivation: TrustDerivation, category: AccountRatingCategory): TrustGraphNode {
  const categoryData = getCategory(derivation, category);

  return {
    address: derivation.accountAddress,
    publicKey: derivation.accountPublicKey,
    status: derivation.derivedTrustStatus,
    level: categoryData?.level ?? 0,
    score: categoryData?.score ?? 0,
    seedMember: derivation.mintingSeedMember,
    x: 0,
    y: 0,
  };
}

function addPlaceholderNode(nodesByAddress: Map<string, TrustGraphNode>, address: string, publicKey?: string) {
  if (!nodesByAddress.has(address)) {
    nodesByAddress.set(address, {
      address,
      publicKey,
      status: 'UNVERIFIED',
      level: 0,
      score: 0,
      seedMember: false,
      x: 0,
      y: 0,
    });
  }
}

// Space reserved around a node so its avatar plus name label clears its neighbours. The avatar
// radius is 15 (seed) / 12, and the label sits ~32px below, so a collision radius of ~36 keeps
// labels from stacking while still letting connected clusters draw close together.
const NODE_RADIUS = (node: TrustGraphNode) => (node.seedMember ? 15 : 12);
const COLLIDE_RADIUS = (node: TrustGraphNode) => NODE_RADIUS(node) + 24;
const CANVAS_PADDING = 56;

// Number of simulation steps run synchronously up front. d3-force is deterministic given fixed
// initial positions and no RNG, so a fixed tick count yields the same layout on every reload.
const SIMULATION_TICKS = 320;

// Deterministic per-address seed in [0, 1). A stable starting position (rather than d3's
// index-based phyllotaxis) keeps the layout independent of node insertion order, so the same
// trust data always settles into the same picture.
function hashUnit(value: string, salt: number) {
  let hash = salt | 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (Math.imul(hash, 31) + value.charCodeAt(index)) | 0;
  }
  return ((hash >>> 0) % 100000) / 100000;
}

// Runs a force-directed layout in place: nodes repel, rating edges act as springs pulling rated
// pairs together, and collision keeps avatars/labels from overlapping. Returns the framed canvas
// size (bounding box of the settled nodes plus padding) so the SVG viewBox shows the whole graph.
function positionNodes(nodes: TrustGraphNode[], links: TrustGraphLink[], width: number, baseHeight: number) {
  if (nodes.length === 0) {
    return { width, height: baseHeight };
  }

  // Seed positions inside a box that grows with node count so dense graphs don't start overlapped.
  const spread = Math.max(width, Math.sqrt(nodes.length) * 90);
  for (const node of nodes) {
    node.x = (hashUnit(node.address, 1) - 0.5) * spread;
    node.y = (hashUnit(node.address, 2) - 0.5) * spread;
    node.vx = 0;
    node.vy = 0;
  }

  const simulation = forceSimulation(nodes)
    .force('charge', forceManyBody().strength(-220).distanceMax(spread))
    .force(
      'link',
      forceLink<TrustGraphNode, TrustGraphLink>(links)
        .id((node) => node.address)
        .distance(80)
        .strength((link) => 0.15 + 0.1 * Math.min(1, (link.confidence ?? 1) / 3)),
    )
    .force('collide', forceCollide<TrustGraphNode>().radius(COLLIDE_RADIUS).iterations(2))
    .force('center', forceCenter(0, 0))
    // Gentle pull toward the origin so disconnected nodes/components don't drift off to infinity.
    .force('x', forceX(0).strength(0.04))
    .force('y', forceY(0).strength(0.04))
    .stop();

  for (let tick = 0; tick < SIMULATION_TICKS; tick += 1) {
    simulation.tick();
  }

  // d3-force replaced each link's source/target with node references and tagged each with an
  // `index` while ticking. Resolve endpoints back to plain addresses and drop the index so the
  // rendered model never leaks mutable simulation internals.
  for (const link of links) {
    if (typeof link.source === 'object') {
      link.source = (link.source as TrustGraphNode).address;
    }
    if (typeof link.target === 'object') {
      link.target = (link.target as TrustGraphNode).address;
    }
    delete link.index;
  }

  // Normalize coordinates into a positive, padded box that exactly frames the settled layout.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    const radius = COLLIDE_RADIUS(node);
    minX = Math.min(minX, node.x - radius);
    minY = Math.min(minY, node.y - radius);
    maxX = Math.max(maxX, node.x + radius);
    maxY = Math.max(maxY, node.y + radius);
  }

  for (const node of nodes) {
    node.x = node.x - minX + CANVAS_PADDING;
    node.y = node.y - minY + CANVAS_PADDING;
  }

  return {
    width: Math.max(width, Math.round(maxX - minX + CANVAS_PADDING * 2)),
    height: Math.max(baseHeight, Math.round(maxY - minY + CANVAS_PADDING * 2)),
  };
}

export function createTrustGraphModel(
  derivations: TrustDerivation[],
  ratings: AccountRating[],
  category: AccountRatingCategory,
  width = 960,
  baseHeight = 520,
): TrustGraphModel {
  const nodesByAddress = new Map<string, TrustGraphNode>();
  const links: TrustGraphLink[] = [];

  for (const derivation of derivations) {
    nodesByAddress.set(derivation.accountAddress, getNodeFromDerivation(derivation, category));
  }

  for (const rating of ratings) {
    if (rating.category !== category) {
      continue;
    }

    addPlaceholderNode(nodesByAddress, rating.raterAddress, rating.raterPublicKey);
    addPlaceholderNode(nodesByAddress, rating.targetAddress, rating.targetPublicKey);

    links.push({
      id: `${rating.raterAddress}-${rating.targetAddress}-${rating.category}`,
      source: rating.raterAddress,
      target: rating.targetAddress,
      category: rating.category,
      rating: rating.rating,
      confidence: rating.ratingConfidence,
    });
  }

  const nodes = [...nodesByAddress.values()];
  const layout = positionNodes(nodes, links, width, baseHeight);

  return {
    links,
    nodes,
    width: layout.width,
    height: layout.height,
  };
}

export function filterDerivations(derivations: TrustDerivation[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return derivations;
  }

  return derivations.filter(
    (derivation) =>
      derivation.accountAddress.toLowerCase().includes(normalizedQuery) ||
      derivation.accountPublicKey.toLowerCase().includes(normalizedQuery),
  );
}
