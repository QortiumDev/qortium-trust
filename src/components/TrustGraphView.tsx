import { useMemo } from 'react';
import { createTrustGraphModel, focusTrustGraphModel, type TrustGraphNode } from '../graphModel';
import { useAnimatedTrustGraph } from '../useAnimatedTrustGraph';
import { TrustGraph } from './TrustGraph';
import type { AccountRating, AccountRatingCategory, IdentityProfilesByAddress, TrustDerivation } from '../types';

// Lazy entry point for the force-directed graph. Building the model statically imports d3-force, so
// keeping that import behind this lazily-loaded component (and out of the eager graphModel path)
// splits d3-force + the simulation into an async chunk the default Accounts view never downloads.
export default function TrustGraphView({
  category,
  derivations,
  isLoading,
  isExpanded,
  onOpenDetail,
  onSelect,
  onToggleExpanded,
  profiles,
  ratings,
  selectedAddress,
  signature,
}: {
  category: AccountRatingCategory;
  derivations: TrustDerivation[];
  isLoading?: boolean;
  isExpanded?: boolean;
  onOpenDetail?: (node: TrustGraphNode) => void;
  onSelect: (node: TrustGraphNode) => void;
  onToggleExpanded?: () => void;
  profiles: IdentityProfilesByAddress;
  ratings: AccountRating[];
  selectedAddress?: string;
  // Stable signature of the model's visual inputs; the expensive (320-tick) sim only re-runs when it
  // changes, not on every identity-profile batch or silent poll that leaves the graph unchanged.
  signature: string;
}) {
  const graph = useMemo(
    () => createTrustGraphModel(derivations, ratings, category),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gated on the precomputed input signature.
    [signature],
  );
  const focusedGraph = useMemo(
    () => focusTrustGraphModel(graph, selectedAddress),
    [graph, selectedAddress],
  );
  const animatedGraph = useAnimatedTrustGraph(focusedGraph, signature);

  return (
    <TrustGraph
      graph={animatedGraph}
      isLoading={isLoading}
      isExpanded={isExpanded}
      onOpenDetail={onOpenDetail}
      onSelect={onSelect}
      onToggleExpanded={onToggleExpanded}
      profiles={profiles}
      selectedAddress={selectedAddress}
    />
  );
}
