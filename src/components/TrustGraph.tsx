import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CircleDot, RotateCcw } from 'lucide-react';
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

const IDENTITY_VIEW: GraphView = { x: 0, y: 0, k: 1 };
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 5;
// Treat a press that moves less than this (in screen px) as a click, not a pan, so node selection
// still fires when the user taps a node without dragging.
const PAN_CLICK_THRESHOLD = 4;

export function TrustGraph({
  graph,
  isLoading,
  onSelect,
  profiles,
  selectedAddress,
}: {
  graph: TrustGraphModel;
  // Set true while the dataset behind the graph is (re)loading so we can show a graph-shaped
  // placeholder sized to the surface instead of the generic table skeleton. Optional: when the
  // shell does not pass it the graph just renders normally.
  isLoading?: boolean;
  onSelect: (node: TrustGraphNode) => void;
  profiles: IdentityProfilesByAddress;
  selectedAddress?: string;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [view, setView] = useState<GraphView>(IDENTITY_VIEW);
  const [hoveredAddress, setHoveredAddress] = useState<string | undefined>(undefined);
  // Tracks an in-progress pan: the pointer origin and whether it has moved past the click threshold.
  const panRef = useRef<{ pointerId: number; startX: number; startY: number; moved: boolean } | null>(
    null,
  );

  const nodeByAddress = useMemo(
    () => new Map(graph.nodes.map((node) => [node.address, node] as const)),
    [graph.nodes],
  );

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

  // Neighbours of the active (hovered, else selected) node, so we can spotlight its edges and dim
  // the rest — the same focus affordance the BrightID explorer uses on node click.
  const activeAddress = hoveredAddress ?? selectedAddress;
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
    (event: React.WheelEvent<SVGSVGElement>) => {
      event.preventDefault();
      zoomBy(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX, event.clientY);
    },
    [zoomBy],
  );

  const handlePointerDown = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) {
      return;
    }
    panRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
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
      }
      pan.startX = event.clientX;
      pan.startY = event.clientY;
      setView((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
    },
    [graph.width, graph.height],
  );

  const endPan = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    const pan = panRef.current;
    if (pan && pan.pointerId === event.pointerId) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      panRef.current = null;
    }
  }, []);

  // Suppress the synthetic click that follows a pan so dragging across a node doesn't select it.
  const handleNodeActivate = useCallback(
    (node: TrustGraphNode) => {
      if (panRef.current?.moved) {
        return;
      }
      onSelect(node);
    },
    [onSelect],
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
        onPointerCancel={endPan}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPan}
        onWheel={handleWheel}
        ref={svgRef}
        role="group"
        style={{ aspectRatio: `${graph.width} / ${graph.height}` }}
        viewBox={`0 0 ${graph.width} ${graph.height}`}
      >
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          <g className="graph-links">
            {graph.links.map((link) => {
              const source = nodeByAddress.get(link.source);
              const target = nodeByAddress.get(link.target);

              if (!source || !target) {
                return null;
              }

              const focused = !adjacency || (adjacency.has(link.source) && adjacency.has(link.target));

              return (
                <line
                  className={`graph-link graph-link-${ratingTone(link.rating)} ${focused ? '' : 'dimmed'}`}
                  key={link.id}
                  strokeWidth={Math.max(1, link.confidence)}
                  x1={source.x}
                  x2={target.x}
                  y1={source.y}
                  y2={target.y}
                >
                  <title>
                    {compactAddress(link.source)}
                    {' -> '}
                    {compactAddress(link.target)} ({link.rating})
                  </title>
                </line>
              );
            })}
          </g>
          <g className="graph-nodes">
            {graph.nodes.map((node, index) => {
              const profile = profiles[node.address];
              const label = getIdentityLabel(profile, node.address);
              const radius = node.seedMember ? 15 : 12;
              const clipId = `avatar-clip-${index}`;
              const focused = !adjacency || adjacency.has(node.address);

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
                  onBlur={() =>
                    setHoveredAddress((current) => (current === node.address ? undefined : current))
                  }
                  onClick={() => handleNodeActivate(node)}
                  onFocus={() => setHoveredAddress(node.address)}
                  onKeyDown={(event) => handleNodeKeyDown(event, node)}
                  onPointerEnter={() => setHoveredAddress(node.address)}
                  onPointerLeave={() => setHoveredAddress((current) => (current === node.address ? undefined : current))}
                  role="button"
                  tabIndex={connectedAddresses.has(node.address) ? 0 : -1}
                >
                  <defs>
                    <clipPath id={clipId}>
                      <circle cx={node.x} cy={node.y} r={radius - 2} />
                    </clipPath>
                  </defs>
                  <circle cx={node.x} cy={node.y} r={radius} />
                  {profile?.avatarSrc ? (
                    <image
                      clipPath={`url(#${clipId})`}
                      height={(radius - 2) * 2}
                      href={profile.avatarSrc}
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
                  <text className="graph-node-label" x={node.x} y={node.y + 32}>
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
          +
        </button>
        <button aria-label={t('graph.zoomOut')} onClick={() => zoomBy(1 / 1.3)} title={t('graph.zoomOut')} type="button">
          −
        </button>
        <button
          aria-label={t('action.resetView')}
          onClick={() => setView(IDENTITY_VIEW)}
          title={t('action.resetView')}
          type="button"
        >
          <RotateCcw size={15} />
        </button>
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
          <span className="graph-legend__item">
            <svg className="graph-legend__edge" viewBox="0 0 24 8" aria-hidden="true">
              <line className="graph-legend__line graph-legend__line--neutral" x1="1" y1="4" x2="23" y2="4" />
            </svg>
            {t('status.neutral')}
          </span>
        </div>
      </div>
      {graph.links.length === 0 ? (
        <div className="empty-overlay">
          <CircleDot size={18} />
          <span>{t('empty.graphEdges')}</span>
        </div>
      ) : null}
    </div>
  );
}
