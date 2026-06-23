import type { TrustDerivation } from './types';

// Client-side account search over the loaded derivations: matches the query against the address or
// public key. Lives apart from graphModel so the eager (non-graph) views can import it without
// pulling d3-force into the main bundle — the graph model + simulation are loaded lazily.
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
