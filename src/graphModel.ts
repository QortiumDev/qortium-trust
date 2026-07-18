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
import type {
  AccountRating,
  AccountRatingCategory,
  TrustDerivation,
  TrustGraph as ServerTrustGraph,
  TrustGraphEdge as ServerTrustGraphEdge,
  TrustGraphNode as ServerTrustGraphNode,
  TrustStatus,
} from './types';

export type TrustGraphDirection = 'both' | 'incoming' | 'outgoing';
export type TrustGraphSign = 'both' | 'positive' | 'negative';

export type TrustGraphFilterOptions = {
  /**
   * Direction is relative to `rootAddress`. It is ignored when there is no root.
   */
  direction?: TrustGraphDirection;
  /**
   * A rooted graph shows only ratings directly involving the root by default. Set this to false
   * only for an explicitly requested induced/full neighborhood.
   */
  incidentOnly?: boolean;
  rootAddress?: string;
  sign?: TrustGraphSign;
};

export type TrustGraphNode = SimulationNodeDatum & {
  address: string;
  publicKey?: string;
  status: TrustStatus;
  level: number;
  score: number;
  seedMember: boolean;
  radius: number;
  inboundWeight: number;
  outboundWeight: number;
  linkCount: number;
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
    radius: 12,
    inboundWeight: 0,
    outboundWeight: 0,
    linkCount: 0,
    x: 0,
    y: 0,
  };
}

function getNodeFromServer(node: ServerTrustGraphNode): TrustGraphNode {
  return {
    address: node.address,
    publicKey: node.publicKey ?? undefined,
    status: node.status,
    level: node.level,
    score: node.score,
    seedMember: node.seedMember,
    radius: 12,
    inboundWeight: 0,
    outboundWeight: 0,
    linkCount: 0,
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
      radius: 12,
      inboundWeight: 0,
      outboundWeight: 0,
      linkCount: 0,
      x: 0,
      y: 0,
    });
  }
}

// Space reserved around a node so its avatar plus name label clears its neighbours. The avatar
// radius is 15 (seed) / 12, and the label sits ~32px below, so a collision radius of ~36 keeps
// labels from stacking while still letting connected clusters draw close together.
const NODE_RADIUS = (node: TrustGraphNode) => node.radius;
const COLLIDE_RADIUS = (node: TrustGraphNode) => NODE_RADIUS(node) + 24;
const CANVAS_PADDING = 56;

// Number of simulation steps run synchronously up front. d3-force is deterministic given fixed
// initial positions and no RNG, so a fixed tick count yields the same layout on every reload.
const SIMULATION_TICKS = 320;
const MIN_NODE_RADIUS = 12;
const MAX_NODE_RADIUS = 26;

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

function getRatingWeight(link: Pick<TrustGraphLink, 'confidence' | 'rating'>) {
  return Math.max(1, Math.abs(link.rating)) * Math.max(1, link.confidence ?? 1);
}

function applyNodeWeights(nodes: TrustGraphNode[], links: TrustGraphLink[]) {
  const nodesByAddress = new Map(nodes.map((node) => [node.address, node]));

  for (const node of nodes) {
    node.inboundWeight = 0;
    node.outboundWeight = 0;
    node.linkCount = 0;
    node.radius = MIN_NODE_RADIUS + (node.seedMember ? 3 : 0);
  }

  for (const link of links) {
    const source = nodesByAddress.get(link.source);
    const target = nodesByAddress.get(link.target);
    const weight = getRatingWeight(link);

    if (source) {
      source.outboundWeight += weight;
      source.linkCount += 1;
    }

    if (target) {
      target.inboundWeight += weight;
      target.linkCount += 1;
    }
  }

  const maxWeight = Math.max(...nodes.map((node) => node.inboundWeight + node.outboundWeight), 1);

  for (const node of nodes) {
    const total = node.inboundWeight + node.outboundWeight;
    const scaled = total <= 0 ? 0 : Math.sqrt(total / maxWeight);

    node.radius = Math.min(MAX_NODE_RADIUS, MIN_NODE_RADIUS + (node.seedMember ? 3 : 0) + scaled * 11);
  }
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
        .distance((link) => 132 - Math.min(52, getRatingWeight(link) * 5))
        .strength((link) => 0.1 + 0.045 * Math.min(8, getRatingWeight(link))),
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
  options: TrustGraphFilterOptions = {},
): TrustGraphModel {
  return createTrustGraphModelFromServer(
    {
      category,
      nodes: derivations.map((derivation) => {
        const node = getNodeFromDerivation(derivation, category);

        return {
          address: node.address,
          publicKey: node.publicKey,
          status: node.status,
          level: node.level,
          score: node.score,
          seedMember: node.seedMember,
        };
      }),
      edges: ratings
        .filter((rating) => rating.category === category)
        .map((rating) => ({
          source: rating.raterAddress,
          target: rating.targetAddress,
          rating: rating.rating,
          confidence: rating.ratingConfidence,
        })),
    },
    options,
    width,
    baseHeight,
  );
}

export function filterTrustGraphEdges(
  edges: ServerTrustGraphEdge[],
  {
    direction = 'both',
    incidentOnly,
    rootAddress,
    sign = 'both',
  }: TrustGraphFilterOptions = {},
) {
  const limitToIncidentEdges = Boolean(rootAddress) && (incidentOnly ?? true);

  return edges.filter((edge) => {
    if (edge.rating === 0) {
      return false;
    }

    if (sign === 'positive' && edge.rating < 0) {
      return false;
    }

    if (sign === 'negative' && edge.rating > 0) {
      return false;
    }

    if (!rootAddress) {
      return true;
    }

    if (direction === 'incoming') {
      return edge.target === rootAddress;
    }

    if (direction === 'outgoing') {
      return edge.source === rootAddress;
    }

    if (limitToIncidentEdges) {
      return edge.source === rootAddress || edge.target === rootAddress;
    }

    return true;
  });
}

export function createTrustGraphModelFromServer(
  graph: ServerTrustGraph,
  options: TrustGraphFilterOptions = {},
  width = 960,
  baseHeight = 520,
): TrustGraphModel {
  const nodesByAddress = new Map<string, TrustGraphNode>();
  const links: TrustGraphLink[] = [];
  const filteredEdges = filterTrustGraphEdges(graph.edges, options);
  const includedAddresses = new Set<string>();

  for (const edge of filteredEdges) {
    includedAddresses.add(edge.source);
    includedAddresses.add(edge.target);
  }

  if (options.rootAddress) {
    includedAddresses.add(options.rootAddress);
  }

  const limitNodes = Boolean(options.rootAddress);

  for (const node of graph.nodes) {
    if (!limitNodes || includedAddresses.has(node.address)) {
      nodesByAddress.set(node.address, getNodeFromServer(node));
    }
  }

  const linkIdCounts = new Map<string, number>();

  filteredEdges.forEach((edge) => {
    addPlaceholderNode(nodesByAddress, edge.source);
    addPlaceholderNode(nodesByAddress, edge.target);
    const baseId = `${edge.source}-${edge.target}-${graph.category}`;
    const duplicateIndex = linkIdCounts.get(baseId) ?? 0;
    linkIdCounts.set(baseId, duplicateIndex + 1);

    links.push({
      id: duplicateIndex === 0 ? baseId : `${baseId}-${duplicateIndex}`,
      source: edge.source,
      target: edge.target,
      category: graph.category,
      rating: edge.rating,
      confidence: edge.confidence,
    });
  });

  const nodes = [...nodesByAddress.values()];
  applyNodeWeights(nodes, links);
  const layout = positionNodes(nodes, links, width, baseHeight);

  return {
    links,
    nodes,
    width: layout.width,
    height: layout.height,
  };
}

function getConnectedTrustNodeIds(links: TrustGraphLink[], address: string) {
  const connected = new Set<string>();

  for (const link of links) {
    if (link.source === address) {
      connected.add(link.target);
    } else if (link.target === address) {
      connected.add(link.source);
    }
  }

  return connected;
}

function clampNodeToCanvas(node: TrustGraphNode, width: number, height: number) {
  const margin = CANVAS_PADDING + node.radius;

  return {
    ...node,
    x: Math.min(Math.max(node.x, margin), width - margin),
    y: Math.min(Math.max(node.y, margin), height - margin),
  };
}

export function focusTrustGraphModel(graph: TrustGraphModel, selectedAddress?: string): TrustGraphModel {
  if (!selectedAddress || !graph.nodes.some((node) => node.address === selectedAddress)) {
    return graph;
  }

  const nodesByAddress = new Map(graph.nodes.map((node) => [node.address, { ...node }]));
  const selected = nodesByAddress.get(selectedAddress)!;
  const center = { x: graph.width / 2, y: graph.height / 2 };
  const target = {
    x: selected.x + (center.x - selected.x) * 0.68,
    y: selected.y + (center.y - selected.y) * 0.68,
  };
  const neighbors = [...getConnectedTrustNodeIds(graph.links, selectedAddress)]
    .filter((address) => nodesByAddress.has(address))
    .sort((left, right) => {
      const leftNode = nodesByAddress.get(left)!;
      const rightNode = nodesByAddress.get(right)!;
      const leftAngle = Math.atan2(leftNode.y - selected.y, leftNode.x - selected.x);
      const rightAngle = Math.atan2(rightNode.y - selected.y, rightNode.x - selected.x);

      return leftAngle - rightAngle || left.localeCompare(right);
    });

  nodesByAddress.set(selectedAddress, {
    ...selected,
    x: target.x,
    y: target.y,
  });

  if (neighbors.length > 0) {
    const ringRadius = Math.min(320, Math.max(155, 105 + neighbors.length * 18));

    neighbors.forEach((address, index) => {
      const node = nodesByAddress.get(address)!;
      const angle = -Math.PI / 2 + (index / Math.max(1, neighbors.length)) * Math.PI * 2;
      const ringTarget = {
        x: target.x + Math.cos(angle) * ringRadius,
        y: target.y + Math.sin(angle) * ringRadius,
      };

      nodesByAddress.set(address, {
        ...node,
        x: node.x + (ringTarget.x - node.x) * 0.78,
        y: node.y + (ringTarget.y - node.y) * 0.78,
      });
    });
  }

  const focused = new Set([selectedAddress, ...neighbors]);

  for (const [address, node] of nodesByAddress) {
    if (focused.has(address)) {
      continue;
    }

    const dx = node.x - target.x;
    const dy = node.y - target.y;
    const distance = Math.hypot(dx, dy) || 1;

    if (distance < 235) {
      const push = (235 - distance) * 0.42;

      nodesByAddress.set(address, {
        ...node,
        x: node.x + (dx / distance) * push,
        y: node.y + (dy / distance) * push,
      });
    }
  }

  const focusNodes = [...focused].filter((address) => nodesByAddress.has(address));

  for (let iteration = 0; iteration < 20; iteration += 1) {
    for (let leftIndex = 0; leftIndex < focusNodes.length; leftIndex += 1) {
      const leftAddress = focusNodes[leftIndex];
      const left = nodesByAddress.get(leftAddress);

      if (!left) {
        continue;
      }

      for (const rightAddress of focusNodes.slice(leftIndex + 1)) {
        const right = nodesByAddress.get(rightAddress);

        if (!right) {
          continue;
        }

        const dx = right.x - left.x;
        const dy = right.y - left.y;
        const distance = Math.hypot(dx, dy) || 1;
        const minimum = left.radius + right.radius + 44;

        if (distance >= minimum) {
          continue;
        }

        const push = (minimum - distance) / 2;
        const ux = dx / distance;
        const uy = dy / distance;

        nodesByAddress.set(leftAddress, {
          ...left,
          x: left.x - ux * push,
          y: left.y - uy * push,
        });
        nodesByAddress.set(rightAddress, {
          ...right,
          x: right.x + ux * push,
          y: right.y + uy * push,
        });
      }
    }
  }

  return {
    ...graph,
    nodes: graph.nodes.map((node) => clampNodeToCanvas(nodesByAddress.get(node.address) ?? node, graph.width, graph.height)),
  };
}
