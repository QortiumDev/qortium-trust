import { useMemo } from 'react';
import { createTrustGraphModel, type TrustGraphNode } from '../graphModel';
import { TrustGraph } from './TrustGraph';
import type { AccountRating, AccountRatingCategory, IdentityProfilesByAddress, TrustDerivation } from '../types';

// Lazy entry point for the force-directed graph. Building the model statically imports d3-force, so
// keeping that import behind this lazily-loaded component (and out of the eager graphModel path)
// splits d3-force + the simulation into an async chunk the default Accounts view never downloads.
export default function TrustGraphView({
  category,
  derivations,
  isLoading,
  onSelect,
  profiles,
  ratings,
  selectedAddress,
  signature,
}: {
  category: AccountRatingCategory;
  derivations: TrustDerivation[];
  isLoading?: boolean;
  onSelect: (node: TrustGraphNode) => void;
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

  return (
    <TrustGraph
      graph={graph}
      isLoading={isLoading}
      onSelect={onSelect}
      profiles={profiles}
      selectedAddress={selectedAddress}
    />
  );
}
