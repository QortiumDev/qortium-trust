import { hasHomeBridge, qdnRequest } from './qdnRequest';
import { fetchNodeApiData } from './trustApi';
import type { IdentityProfile, NameSummary, QdnAction } from './types';
import { hasBridgeAction } from './avatarClient';
import { t } from './i18n';

const NAME_MAX_BYTES = 2 * 1024 * 1024;
// Module-level map de-dups concurrent name resolutions for the same address.
const inFlightProfiles = new Map<string, Promise<IdentityProfile>>();

export function normalizeRegisteredName(name: string | null | undefined) {
  return typeof name === 'string' && name.length > 0 ? name : null;
}

export function getAvatarFallbackCharacter(name: string | null | undefined, _address: string) {
  const registeredName = normalizeRegisteredName(name);

  if (registeredName) {
    return Array.from(registeredName)[0] ?? '?';
  }

  return '?';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function getStringProperty(value: unknown, key: string) {
  if (!isRecord(value)) {
    return undefined;
  }

  const property = value[key];

  return typeof property === 'string' ? property : undefined;
}

function getFirstRegisteredName(names: NameSummary[]) {
  for (const summary of names) {
    const name = normalizeRegisteredName(summary.name);

    if (name) {
      return name;
    }
  }

  return null;
}

async function getAccountNames(address: string, actions?: QdnAction[]) {
  if (hasBridgeAction(actions, 'GET_ACCOUNT_NAMES')) {
    return qdnRequest<NameSummary[]>({
      action: 'GET_ACCOUNT_NAMES',
      address,
    });
  }

  return fetchNodeApiData<NameSummary[]>(`/names/address/${encodeURIComponent(address)}`, t('fetch.accountNames'), NAME_MAX_BYTES);
}

async function resolveRegisteredName(address: string, actions?: QdnAction[]) {
  return getFirstRegisteredName(await getAccountNames(address, actions));
}

async function resolveIdentityProfile(address: string, actions?: QdnAction[]): Promise<IdentityProfile> {
  let name: string | null = null;

  try {
    name = await resolveRegisteredName(address, actions);
  } catch {
    // A failed name lookup resolves to a nameless record (negative cache via the
    // returned record itself) rather than rejecting and retrying forever (#10).
    name = null;
  }

  if (!name) {
    return {
      address,
      avatarSrc: null,
      name: null,
    };
  }

  return {
    address,
    // Avatar bytes are requested only by mounted table/detail avatar components. Do not attach
    // legacy URL hints here: the graph can represent a large server-provided network safely as text.
    avatarSrc: null,
    name,
  };
}

/**
 * Always resolves to an {@link IdentityProfile} record (never rejects), so a failed
 * lookup is recorded once per data-epoch rather than retried forever. Concurrent
 * resolutions of the same address are de-duped via a module-level in-flight map.
 */
export async function loadIdentityProfile(address: string, actions?: QdnAction[]): Promise<IdentityProfile> {
  const inFlight = inFlightProfiles.get(address);

  if (inFlight) {
    return inFlight;
  }

  const pending = resolveIdentityProfile(address, actions).finally(() => {
    inFlightProfiles.delete(address);
  });

  inFlightProfiles.set(address, pending);

  return pending;
}

// Home's RESOLVE_IDENTITIES bridge action resolves at most this many addresses per call (mirrors
// MAX_RESOLVE_IDENTITIES in qortium-home); larger sets are split into successive calls.
const RESOLVE_IDENTITIES_BATCH_SIZE = 500;

// Concurrency cap for the per-address fallback path (no batch action) so a large category resolves
// in bounded waves instead of firing hundreds of simultaneous name/avatar round-trips (perf-002).
const IDENTITY_FETCH_CONCURRENCY = 6;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, resolve: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const runWorker = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await resolve(items[index]);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runWorker));

  return results;
}

type ResolvedIdentityEntry = { address?: unknown; name?: unknown };

function toIdentityProfile(entry: ResolvedIdentityEntry, address: string): IdentityProfile {
  const name = normalizeRegisteredName(typeof entry.name === 'string' ? entry.name : null);
  // Intentionally ignore the legacy avatarSrc hint. Only mounted table/detail avatars call the
  // pointer-aware FETCH_ACCOUNT_AVATAR bridge action, which avoids graph-wide image fetches.
  return { address, avatarSrc: null, name };
}

async function resolveIdentitiesViaBridge(addresses: string[]): Promise<IdentityProfile[]> {
  const profiles: IdentityProfile[] = [];

  for (const batch of chunk(addresses, RESOLVE_IDENTITIES_BATCH_SIZE)) {
    const resolved = await qdnRequest<ResolvedIdentityEntry[]>({ action: 'RESOLVE_IDENTITIES', addresses: batch });
    const byAddress = new Map<string, ResolvedIdentityEntry>();

    if (Array.isArray(resolved)) {
      for (const entry of resolved) {
        const address = getStringProperty(entry, 'address');

        if (address) {
          byAddress.set(address, entry as ResolvedIdentityEntry);
        }
      }
    }

    // Preserve the requested order and always emit a record per address, so a missing/garbled entry
    // resolves to a nameless profile (retried next data-epoch) rather than dropping the row.
    for (const address of batch) {
      const entry = byAddress.get(address);

      profiles.push(entry ? toIdentityProfile(entry, address) : { address, avatarSrc: null, name: null });
    }
  }

  return profiles;
}

/**
 * Resolve names for many addresses at once. The legacy batch response may include avatarSrc, but it
 * is deliberately ignored; visible components use FETCH_ACCOUNT_AVATAR separately.
 */
export async function loadIdentityProfiles(addresses: string[], actions?: QdnAction[]): Promise<IdentityProfile[]> {
  if (addresses.length === 0) {
    return [];
  }

  if (hasHomeBridge() && hasBridgeAction(actions, 'RESOLVE_IDENTITIES')) {
    try {
      return await resolveIdentitiesViaBridge(addresses);
    } catch {
      // Fall back to per-address resolution if the batch action is unavailable or errors mid-flight.
    }
  }

  return mapWithConcurrency(addresses, IDENTITY_FETCH_CONCURRENCY, (address) => loadIdentityProfile(address, actions));
}

export function getIdentityLabel(profile: IdentityProfile | undefined, address: string) {
  return profile?.name ?? address;
}
