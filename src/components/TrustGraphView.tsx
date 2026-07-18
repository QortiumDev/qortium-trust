import { useMemo } from 'react';
import {
  createTrustGraphModel,
  createTrustGraphModelFromServer,
  focusTrustGraphModel,
  type TrustGraphDirection,
  type TrustGraphNode,
  type TrustGraphSign,
} from '../graphModel';
import { useAnimatedTrustGraph } from '../useAnimatedTrustGraph';
import { TrustGraph } from './TrustGraph';
import type {
  AccountRating,
  AccountRatingCategory,
  IdentityProfilesByAddress,
  TrustDerivation,
  TrustGraph as ServerTrustGraph,
} from '../types';

  // Lazy entry point for the force-directed graph. Building the model statically imports d3-force, so
// keeping that import behind this lazily-loaded component (and out of the eager graphModel path)
// splits d3-force + the simulation into an async chunk the default Accounts view never downloads.
export default function TrustGraphView({
  category,
  derivations,
  direction = 'both',
  incidentOnly,
  isLoading,
  isExpanded,
  onClearSelection,
  onOpenDetail,
  onSelect,
  onToggleExpanded,
  profiles,
  ratings,
  selectedAddress,
  serverGraph,
  sign = 'both',
  signature,
}: {
  category: AccountRatingCategory;
  derivations: TrustDerivation[];
  direction?: TrustGraphDirection;
  incidentOnly?: boolean;
  isLoading?: boolean;
  isExpanded?: boolean;
  onClearSelection?: () => void;
  onOpenDetail?: (node: TrustGraphNode) => void;
  onSelect: (node: TrustGraphNode) => void;
  onToggleExpanded?: () => void;
  profiles: IdentityProfilesByAddress;
  ratings: AccountRating[];
  selectedAddress?: string;
  /**
   * Prefer Core's server-shaped graph when supplied. The derivation/rating props remain supported
   * so the app can migrate without making the graph release depend on one atomic App change.
   */
  serverGraph?: ServerTrustGraph;
  sign?: TrustGraphSign;
  // Stable signature of the model's visual inputs; the expensive (320-tick) sim only re-runs when it
  // changes, not on every identity-profile batch or silent poll that leaves the graph unchanged.
  signature: string;
}) {
  const compactViewport = typeof window !== 'undefined' && window.innerWidth <= 640;
  const modelWidth = compactViewport ? 560 : 960;
  const visualSignature = `${signature}|${selectedAddress ?? ''}|${direction}|${sign}|${
    incidentOnly === false ? 'induced' : 'incident'
  }|${serverGraph ? 'server' : 'legacy'}|${modelWidth}`;
  const graph = useMemo(
    () => {
      const options = {
        direction,
        incidentOnly,
        rootAddress: selectedAddress,
        sign,
      };

      return serverGraph
        ? createTrustGraphModelFromServer(serverGraph, options, modelWidth, 520)
        : createTrustGraphModel(derivations, ratings, category, modelWidth, 520, options);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- large data inputs are gated by the stable signature.
    [visualSignature],
  );
  const focusedGraph = useMemo(
    () => focusTrustGraphModel(graph, selectedAddress),
    [graph, selectedAddress],
  );
  const animatedGraph = useAnimatedTrustGraph(focusedGraph, visualSignature);

  return (
    <TrustGraph
      graph={animatedGraph}
      isLoading={isLoading}
      isExpanded={isExpanded}
      onClearSelection={onClearSelection}
      onOpenDetail={onOpenDetail}
      onSelect={onSelect}
      onToggleExpanded={onToggleExpanded}
      profiles={profiles}
      selectedAddress={selectedAddress}
    />
  );
}
