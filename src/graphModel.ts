import type { AccountRating, AccountRatingCategory, TrustDerivation, TrustStatus } from './types';

export type TrustGraphNode = {
  address: string;
  publicKey?: string;
  status: TrustStatus;
  level: number;
  score: number;
  seedMember: boolean;
  x: number;
  y: number;
};

export type TrustGraphLink = {
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

const STATUS_ORDER: TrustStatus[] = ['SUSPICIOUS', 'UNVERIFIED', 'BRONZE', 'SILVER', 'GOLD'];

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

// Vertical room reserved per node so an avatar plus its name label never collides with the
// node beneath it (avatar diameter ~30 + label offset 32 + descenders). Lanes grow the canvas
// height to fit their densest column rather than cramming nodes into a fixed 520px.
const NODE_SLOT = 68;
const LANE_TOP_PADDING = 52;
const LANE_BOTTOM_PADDING = 24;

function positionNodes(nodes: TrustGraphNode[], width: number, baseHeight: number) {
  const laneWidth = width / STATUS_ORDER.length;
  const grouped = new Map<TrustStatus, TrustGraphNode[]>();

  for (const status of STATUS_ORDER) {
    grouped.set(status, []);
  }

  for (const node of nodes) {
    grouped.get(node.status)?.push(node);
  }

  let maxLaneCount = 0;
  for (const status of STATUS_ORDER) {
    maxLaneCount = Math.max(maxLaneCount, grouped.get(status)?.length ?? 0);
  }

  const contentHeight = LANE_TOP_PADDING + maxLaneCount * NODE_SLOT + LANE_BOTTOM_PADDING;
  const height = Math.max(baseHeight, contentHeight);

  for (const [laneIndex, status] of STATUS_ORDER.entries()) {
    const laneNodes = grouped.get(status) ?? [];
    const x = laneIndex * laneWidth + laneWidth / 2;
    const available = height - LANE_TOP_PADDING - LANE_BOTTOM_PADDING;
    const blockHeight = laneNodes.length * NODE_SLOT;
    const startY = LANE_TOP_PADDING + Math.max(0, (available - blockHeight) / 2);

    laneNodes
      .sort((left, right) => right.level - left.level || right.score - left.score || left.address.localeCompare(right.address))
      .forEach((node, index) => {
        node.x = x;
        node.y = startY + NODE_SLOT * index + NODE_SLOT / 2;
      });
  }

  return height;
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
  const height = positionNodes(nodes, width, baseHeight);

  return {
    links,
    nodes,
    width,
    height,
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
