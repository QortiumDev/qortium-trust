import type { TrustDerivation } from './types';

// Client-side account search over the loaded derivations: matches the query against the address or
// public key.
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
