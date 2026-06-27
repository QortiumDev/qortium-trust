import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CircleDot, Maximize2, Minimize2, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { getAvatarFallbackCharacter, getIdentityLabel } from '../identityProfiles';
import { compactAddress, ratingTone, statusLabel, statusTone } from '../format';
import type { TrustGraphModel, TrustGraphNode } from '../graphModel';
import type { IdentityProfilesByAddress } from '../types';
import { compactIdentityGraphLabel } from './Identity';
import { t } from '../i18n';

// View transform applied to the graph contents: translate(x, y) scale(k). The SVG viewBox already
// frames the whole settled layout at identity, so {x:0, y:0, k:1} shows everything; pan/zoom layer
// on top of that.
type GraphView = { x: number; y: number; k: number };
type AvatarLoadStatus = 'loading' | 'loaded' | 'failed';

const IDENTITY_VIEW: GraphView = { x: 0, y: 0, k: 1 };
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 5;
// Treat a press that moves less than this (in screen px) as a click, not a pan, so node selection
// still fires when the user taps a node without dragging.
const PAN_CLICK_THRESHOLD = 4;

export function TrustGraph({
  graph,
  isLoading,
  isExpanded = false,
  onClearSelection,
  onOpenDetail,
  onSelect,
  onToggleExpanded,
  profiles,
  selectedAddress,
}: {
  graph: TrustGraphModel;
  // Set true while the dataset behind the graph is (re)loading so we can show a graph-shaped
  // placeholder sized to the surface instead of the generic table skeleton. Optional: when the
  // shell does not pass it the graph just renders normally.
  isLoading?: boolean;
  isExpanded?: boolean;
  onClearSelection?: () => void;
  onOpenDetail?: (node: TrustGraphNode) => void;
  onSelect: (node: TrustGraphNode) => void;
  onToggleExpanded?: () => void;
  profiles: IdentityProfilesByAddress;
  selectedAddress?: string;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const avatarLoadStatusRef = useRef<Record<string, AvatarLoadStatus>>({});
  const [avatarLoadStatusBySrc, setAvatarLoadStatusBySrc] = useState<Record<string, AvatarLoadStatus>>({});
  const [view, setView] = useState<GraphView>(IDENTITY_VIEW);
  const expandedControlLabel = isExpanded ? 'Collapse graph' : 'Expand graph';
  // Tracks an in-progress pan: the pointer origin and whether it has moved past the click threshold.
  const panRef = useRef<{ pointerId: number; startX: number; startY: number; moved: boolean } | null>(
    null,
  );
  // All active pointers on the surface (keyed by id) + the last finger distance, so two-finger
  // gestures pinch-to-zoom on touch (RESP-03) while a single pointer keeps panning.
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number } | null>(null);
  const suppressNextSurfaceClickRef = useRef(false);

  const nodeByAddress = useMemo(
    () => new Map(graph.nodes.map((node) => [node.address, node] as const)),
    [graph.nodes],
  );
  const avatarSources = useMemo(() => {
    const sources = new Set<string>();

    for (const node of graph.nodes) {
      const avatarSrc = profiles[node.address]?.avatarSrc;

      if (avatarSrc) {
        sources.add(avatarSrc);
      }
    }

    return [...sources];
  }, [graph.nodes, profiles]);

  const setAvatarLoadStatus = useCallback((src: string, status: AvatarLoadStatus) => {
    avatarLoadStatusRef.current[src] = status;
    setAvatarLoadStatusBySrc((current) =>
      current[src] === status
        ? current
        : {
            ...current,
            [src]: status,
          },
    );
  }, []);

  useEffect(() => {
    if (typeof Image === 'undefined') {
      return;
    }

    for (const src of avatarSources) {
      if (avatarLoadStatusRef.current[src]) {
        continue;
      }

      avatarLoadStatusRef.current[src] = 'loading';
      const image = new Image();
      image.onload = () => setAvatarLoadStatus(src, 'loaded');
      image.onerror = () => setAvatarLoadStatus(src, 'failed');
      image.src = src;
    }
  }, [avatarSources, setAvatarLoadStatus]);

  // Addresses that participate in at least one edge. Only these get tabIndex={0}: an isolated node
  // has no connections to spotlight, so adding it to the tab order would just bloat keyboard
  // navigation. The accounts table stays the primary keyboard path for every account.
  const connectedAddresses = useMemo(() => {
    const connected = new Set<string>();
    for (const link of graph.links) {
      connected.add(link.source);
      connected.add(link.target);
    }
    return connected;
  }, [graph.links]);

  // Neighbours of the selected node, so we can spotlight its edges and dim the rest. Selection is
  // click/tap based rather than hover based so it works on touch screens.
  const activeAddress = selectedAddress;
  const adjacency = useMemo(() => {
    if (!activeAddress) {
      return null;
    }
    const neighbours = new Set<string>([activeAddress]);
    for (const link of graph.links) {
      if (link.source === activeAddress) {
        neighbours.add(link.target);
      } else if (link.target === activeAddress) {
        neighbours.add(link.source);
      }
    }
    return neighbours;
  }, [activeAddress, graph.links]);
  const linkDirectionSet = useMemo(
    () => new Set(graph.links.map((link) => `${link.source}\0${link.target}`)),
    [graph.links],
  );
  const selectedNode = selectedAddress ? nodeByAddress.get(selectedAddress) : undefined;
  const selectedProfile = selectedAddress ? profiles[selectedAddress] : undefined;
  const selectedLinks = useMemo(
    () =>
      selectedAddress
        ? graph.links.filter((link) => link.source === selectedAddress || link.target === selectedAddress)
        : [],
    [graph.links, selectedAddress],
  );
  const selectedSummary = useMemo(() => {
    if (!selectedNode) {
      return null;
    }

    let inbound = 0;
    let outbound = 0;
    let positive = 0;
    let negative = 0;

    for (const link of selectedLinks) {
      if (link.target === selectedNode.address) {
        inbound += 1;
      }

      if (link.source === selectedNode.address) {
        outbound += 1;
      }

      if (link.rating > 0) {
        positive += 1;
      } else if (link.rating < 0) {
        negative += 1;
      }
    }

    return { inbound, negative, outbound, positive };
  }, [selectedLinks, selectedNode]);

  // Reset the view whenever the graph identity changes (category switch, search, data refresh) so a
  // new layout starts fully framed instead of inheriting the previous pan/zoom.
  useEffect(() => {
    setView(IDENTITY_VIEW);
  }, [graph]);

  // Maps a screen pointer to graph user-space (viewBox units, before the view transform). The CSS
  // aspect-ratio matches the viewBox, so x and y scale uniformly with no letterboxing.
  const toUserSpace = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) {
        return { x: 0, y: 0 };
      }
      const rect = svg.getBoundingClientRect();
      return {
        x: ((clientX - rect.left) / rect.width) * graph.width,
        y: ((clientY - rect.top) / rect.height) * graph.height,
      };
    },
    [graph.width, graph.height],
  );

  const zoomBy = useCallback(
    (factor: number, focusClientX?: number, focusClientY?: number) => {
      setView((current) => {
        const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.k * factor));
        if (k === current.k) {
          return current;
        }
        // Default the zoom focus to the canvas centre when no pointer is given (button zoom).
        const svg = svgRef.current;
        const rect = svg?.getBoundingClientRect();
        const focus =
          focusClientX !== undefined && focusClientY !== undefined
            ? toUserSpace(focusClientX, focusClientY)
            : rect
              ? toUserSpace(rect.left + rect.width / 2, rect.top + rect.height / 2)
              : { x: graph.width / 2, y: graph.height / 2 };
        // Keep the focus point pinned under the cursor as scale changes.
        return {
          k,
          x: focus.x - ((focus.x - current.x) * k) / current.k,
          y: focus.y - ((focus.y - current.y) * k) / current.k,
        };
      });
    },
    [graph.width, graph.height, toUserSpace],
  );

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      zoomBy(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX, event.clientY);
    },
    [zoomBy],
  );

  useEffect(() => {
    const svg = svgRef.current;

    if (!svg) {
      return;
    }

    svg.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      svg.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel]);

  const handlePointerDown = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) {
      return;
    }
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic events and some embedded-webview edge cases may not expose an active pointer to
      // capture. Panning still works through the tracked pointer map when capture is unavailable.
    }

    if (pointersRef.current.size === 2) {
      // Second finger down → start a pinch and abandon any single-pointer pan.
      panRef.current = null;
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = { distance: Math.hypot(a.x - b.x, a.y - b.y) };
    } else if (pointersRef.current.size === 1) {
      panRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false };
    }
  }, []);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      const tracked = pointersRef.current.get(event.pointerId);
      if (tracked) {
        tracked.x = event.clientX;
        tracked.y = event.clientY;
      }

      // Two-finger pinch: scale by the change in finger distance, centred on the midpoint (RESP-03).
      if (pointersRef.current.size === 2 && pinchRef.current) {
        const [a, b] = [...pointersRef.current.values()];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchRef.current.distance > 0 && distance > 0) {
          zoomBy(distance / pinchRef.current.distance, (a.x + b.x) / 2, (a.y + b.y) / 2);
        }
        pinchRef.current.distance = distance;
        return;
      }

      const pan = panRef.current;
      if (!pan || pan.pointerId !== event.pointerId) {
        return;
      }
      const svg = svgRef.current;
      if (!svg) {
        return;
      }
      const rect = svg.getBoundingClientRect();
      // Convert the screen delta into user-space units (independent of the current scale, because
      // the transform's translate is in pre-scale viewBox units).
      const dx = ((event.clientX - pan.startX) / rect.width) * graph.width;
      const dy = ((event.clientY - pan.startY) / rect.height) * graph.height;
      if (!pan.moved && Math.hypot(event.clientX - pan.startX, event.clientY - pan.startY) > PAN_CLICK_THRESHOLD) {
        pan.moved = true;
        suppressNextSurfaceClickRef.current = true;
      }
      pan.startX = event.clientX;
      pan.startY = event.clientY;
      setView((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
    },
    [graph.width, graph.height, zoomBy],
  );

  const endPan = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    const moved = panRef.current?.moved ?? false;

    pointersRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (pointersRef.current.size < 2) {
      pinchRef.current = null;
    }

    if (pointersRef.current.size === 1) {
      // One finger left after a pinch: resume panning from its current position so the view doesn't
      // jump, and treat it as already-moved so the lift-off doesn't register as a node tap.
      const [[pointerId, point]] = [...pointersRef.current.entries()];
      panRef.current = { pointerId, startX: point.x, startY: point.y, moved: true };
    } else if (pointersRef.current.size === 0) {
      suppressNextSurfaceClickRef.current ||= moved;
      panRef.current = null;
    }
  }, []);

  // Suppress the synthetic click that follows a pan so dragging across a node doesn't select it.
  const handleNodeActivate = useCallback(
    (event: React.MouseEvent<SVGGElement>, node: TrustGraphNode) => {
      event.stopPropagation();
      if (panRef.current?.moved) {
        return;
      }
      onSelect(node);
    },
    [onSelect],
  );
  const handleSurfaceClick = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (suppressNextSurfaceClickRef.current) {
        suppressNextSurfaceClickRef.current = false;
        return;
      }

      if ((event.target as Element | null)?.closest?.('.graph-node')) {
        return;
      }

      if (selectedAddress) {
        onClearSelection?.();
      }
    },
    [onClearSelection, selectedAddress],
  );

  // Keyboard activation: Enter/Space select the focused node, mirroring a click. preventDefault on
  // Space stops the surface from scrolling. (A keyboard activation is never a pan.)
  const handleNodeKeyDown = useCallback(
    (event: React.KeyboardEvent<SVGGElement>, node: TrustGraphNode) => {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault();
        onSelect(node);
      }
    },
    [onSelect],
  );

  if (isLoading) {
    return (
      <div className="graph-surface graph-surface--loading" role="status" aria-live="polite">
        {onToggleExpanded ? (
          <div className="graph-zoom-controls">
            <button
              aria-label={expandedControlLabel}
              onClick={onToggleExpanded}
              title={expandedControlLabel}
              type="button"
            >
              {isExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          </div>
        ) : null}
        <div className="graph-loading">
          <div className="graph-loading__orbit">
            <span className="graph-loading__node graph-loading__node--center" />
            <span className="graph-loading__node" />
            <span className="graph-loading__node" />
            <span className="graph-loading__node" />
            <span className="graph-loading__node" />
            <span className="graph-loading__node" />
          </div>
          <span className="graph-loading__label">{t('graph.loading')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="graph-surface">
      <p className="graph-hint">
        {t('graph.hint')}
      </p>
      <svg
        aria-label={t('graph.label')}
        className={`trust-graph ${adjacency ? 'has-focus' : ''}`}
        onClick={handleSurfaceClick}
        onPointerCancel={endPan}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPan}
        ref={svgRef}
        role="group"
        style={{ aspectRatio: `${graph.width} / ${graph.height}` }}
        viewBox={`0 0 ${graph.width} ${graph.height}`}
      >
        <defs>
          <marker
            id="trust-arrow-positive"
            markerHeight="8"
            markerUnits="userSpaceOnUse"
            markerWidth="8"
            orient="auto"
            refX="7.2"
            refY="4"
            viewBox="0 0 8 8"
          >
            <path d="M0,0 L8,4 L0,8 Z" fill="var(--positive)" />
          </marker>
          <marker
            id="trust-arrow-negative"
            markerHeight="8"
            markerUnits="userSpaceOnUse"
            markerWidth="8"
            orient="auto"
            refX="7.2"
            refY="4"
            viewBox="0 0 8 8"
          >
            <path d="M0,0 L8,4 L0,8 Z" fill="var(--negative)" />
          </marker>
        </defs>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          <g className="graph-links">
            {graph.links.map((link) => {
              const source = nodeByAddress.get(link.source);
              const target = nodeByAddress.get(link.target);

              if (!source || !target) {
                return null;
              }

              const focused = !adjacency || (adjacency.has(link.source) && adjacency.has(link.target));
              const tone = ratingTone(link.rating);
              const reverse = linkDirectionSet.has(`${link.target}\0${link.source}`);

              return (
                <path
                  className={`graph-link graph-link-${tone} ${focused ? '' : 'dimmed'}`}
                  d={getLinkPath(source, target, reverse, graph.nodes)}
                  key={link.id}
                  markerEnd={`url(#trust-arrow-${tone === 'negative' ? 'negative' : 'positive'})`}
                  strokeWidth={getGraphLinkWidth(link.rating, focused)}
                >
                  <title>
                    {t('graph.edgeTitle', {
                      confidence: link.confidence,
                      rating: link.rating,
                      source: compactAddress(link.source),
                      target: compactAddress(link.target),
                    })}
                  </title>
                </path>
              );
            })}
          </g>
          <g className="graph-nodes">
            {graph.nodes.map((node, index) => {
              const profile = profiles[node.address];
              const label = getIdentityLabel(profile, node.address);
              const radius = node.radius;
              const clipId = `avatar-clip-${index}`;
              const focused = !adjacency || adjacency.has(node.address);
              const avatarSrc =
                profile?.avatarSrc && avatarLoadStatusBySrc[profile.avatarSrc] === 'loaded'
                  ? profile.avatarSrc
                  : null;

              return (
                <g
                  aria-label={t('graph.nodeLabel', {
                    label,
                    level: node.level,
                    status: statusLabel(node.status),
                  })}
                  className={`graph-node graph-node-${statusTone(node.status)} ${
                    node.address === selectedAddress ? 'selected' : ''
                  } ${focused ? '' : 'dimmed'}`}
                  key={node.address}
                  onClick={(event) => handleNodeActivate(event, node)}
                  onKeyDown={(event) => handleNodeKeyDown(event, node)}
                  onPointerDown={(event) => event.stopPropagation()}
                  role="button"
                  tabIndex={connectedAddresses.has(node.address) ? 0 : -1}
                >
                  <defs>
                    <clipPath id={clipId}>
                      <circle cx={node.x} cy={node.y} r={radius - 2} />
                    </clipPath>
                  </defs>
                  <circle cx={node.x} cy={node.y} r={radius} />
                  {avatarSrc ? (
                    <image
                      clipPath={`url(#${clipId})`}
                      height={(radius - 2) * 2}
                      href={avatarSrc}
                      preserveAspectRatio="xMidYMid slice"
                      width={(radius - 2) * 2}
                      x={node.x - radius + 2}
                      y={node.y - radius + 2}
                    />
                  ) : (
                    <text className="graph-node-initial" x={node.x} y={node.y + 4}>
                      {getAvatarFallbackCharacter(profile?.name, node.address)}
                    </text>
                  )}
                  <text className="graph-node-label" x={node.x} y={node.y + radius + 18}>
                    {compactIdentityGraphLabel(profile, node.address)}
                  </text>
                  <title>
                    {t('graph.nodeTitle', {
                      address: node.address,
                      label,
                      level: node.level,
                      status: statusLabel(node.status),
                    })}
                  </title>
                </g>
              );
            })}
          </g>
        </g>
      </svg>
      <div className="graph-zoom-controls">
        <button aria-label={t('graph.zoomIn')} onClick={() => zoomBy(1.3)} title={t('graph.zoomIn')} type="button">
          <ZoomIn size={15} />
        </button>
        <button aria-label={t('graph.zoomOut')} onClick={() => zoomBy(1 / 1.3)} title={t('graph.zoomOut')} type="button">
          <ZoomOut size={15} />
        </button>
        <button
          aria-label={t('action.resetView')}
          onClick={() => setView(IDENTITY_VIEW)}
          title={t('action.resetView')}
          type="button"
        >
          <RotateCcw size={15} />
        </button>
        {onToggleExpanded ? (
          <button
            aria-label={expandedControlLabel}
            onClick={onToggleExpanded}
            title={expandedControlLabel}
            type="button"
          >
            {isExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        ) : null}
      </div>
      <div className="graph-legend" aria-label={t('label.graphLegend')}>
        <div className="graph-legend__group">
          <span className="graph-legend__heading">{t('label.trustStatus')}</span>
          <span className="graph-legend__item">
            <span className="graph-legend__ring graph-legend__ring--gold" />
            {t('status.gold')}
          </span>
          <span className="graph-legend__item">
            <span className="graph-legend__ring graph-legend__ring--silver" />
            {t('status.silver')}
          </span>
          <span className="graph-legend__item">
            <span className="graph-legend__ring graph-legend__ring--bronze" />
            {t('status.bronze')}
          </span>
          <span className="graph-legend__item">
            <span className="graph-legend__ring graph-legend__ring--neutral" />
            {t('status.unverified')}
          </span>
          <span className="graph-legend__item">
            <span className="graph-legend__ring graph-legend__ring--negative" />
            {t('status.suspicious')}
          </span>
        </div>
        <div className="graph-legend__group">
          <span className="graph-legend__heading">{t('label.rating')}</span>
          <span className="graph-legend__item">
            <svg className="graph-legend__edge" viewBox="0 0 24 8" aria-hidden="true">
              <line className="graph-legend__line graph-legend__line--positive" x1="1" y1="4" x2="23" y2="4" />
            </svg>
            {t('status.positive')}
          </span>
          <span className="graph-legend__item">
            <svg className="graph-legend__edge" viewBox="0 0 24 8" aria-hidden="true">
              <line className="graph-legend__line graph-legend__line--negative" x1="1" y1="4" x2="23" y2="4" />
            </svg>
            {t('status.negative')}
          </span>
        </div>
      </div>
      {graph.links.length === 0 ? (
        <div className="empty-overlay">
          <CircleDot size={18} />
          <span>{t('empty.graphEdges')}</span>
        </div>
      ) : null}
      {selectedNode && selectedSummary ? (
        <div className="graph-selection-panel" role="status">
          <div className="graph-selection-panel__identity">
            <span className="graph-selection-panel__eyebrow">Selected account</span>
            <strong>{getIdentityLabel(selectedProfile, selectedNode.address)}</strong>
            <span className="mono">{compactAddress(selectedNode.address)}</span>
          </div>
          <dl>
            <div>
              <dt>{t('label.status')}</dt>
              <dd>{statusLabel(selectedNode.status)}</dd>
            </div>
            <div>
              <dt>{t('label.level')}</dt>
              <dd>{selectedNode.level}</dd>
            </div>
            <div>
              <dt>{t('label.score')}</dt>
              <dd>{selectedNode.score}</dd>
            </div>
            <div>
              <dt>Votes in</dt>
              <dd>{selectedSummary.inbound}</dd>
            </div>
            <div>
              <dt>Votes out</dt>
              <dd>{selectedSummary.outbound}</dd>
            </div>
            <div>
              <dt>{t('status.positive')}</dt>
              <dd>{selectedSummary.positive}</dd>
            </div>
            <div>
              <dt>{t('status.negative')}</dt>
              <dd>{selectedSummary.negative}</dd>
            </div>
          </dl>
          {onOpenDetail ? (
            <button type="button" onClick={() => onOpenDetail(selectedNode)}>
              View details
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function getGraphLinkWidth(rating: number, focused: boolean) {
  return 1.4 + Math.min(4, Math.abs(rating)) * 0.72 + (focused ? 0.8 : 0);
}

function getLinkPath(source: TrustGraphNode, target: TrustGraphNode, reciprocal: boolean, nodes: TrustGraphNode[]) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const startX = source.x + ux * (source.radius + 2);
  const startY = source.y + uy * (source.radius + 2);
  const endX = target.x - ux * (target.radius + 10);
  const endY = target.y - uy * (target.radius + 10);
  const offset = getRouteOffset(source, target, nodes, length, reciprocal);

  if (Math.abs(offset) < 1) {
    return `M ${startX} ${startY} L ${endX} ${endY}`;
  }

  const controlX = (startX + endX) / 2 + (-uy) * offset;
  const controlY = (startY + endY) / 2 + ux * offset;

  return `M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}`;
}

function getRouteOffset(
  source: TrustGraphNode,
  target: TrustGraphNode,
  nodes: TrustGraphNode[],
  length: number,
  reciprocal: boolean,
) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const pairSign = source.address.localeCompare(target.address) < 0 ? 1 : -1;
  let offset = reciprocal ? Math.min(72, Math.max(32, length * 0.18)) * pairSign : 0;

  for (const node of nodes) {
    if (node.address === source.address || node.address === target.address) {
      continue;
    }

    const projection = ((node.x - source.x) * dx + (node.y - source.y) * dy) / (length * length);

    if (projection <= 0.08 || projection >= 0.92) {
      continue;
    }

    const closestX = source.x + dx * projection;
    const closestY = source.y + dy * projection;
    const distance = Math.hypot(node.x - closestX, node.y - closestY);
    const clearance = node.radius + 18;

    if (distance >= clearance) {
      continue;
    }

    const cross = dx * (node.y - source.y) - dy * (node.x - source.x);
    const awayFromNode = cross >= 0 ? -1 : 1;
    offset += awayFromNode * Math.min(46, clearance - distance + 18);
  }

  return Math.max(-110, Math.min(110, offset));
}
