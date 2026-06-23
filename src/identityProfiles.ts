import { hasHomeBridge, qdnRequest } from './qdnRequest';
import { fetchNodeApiData } from './trustApi';
import type { IdentityProfile, NameSummary, QdnAction } from './types';
import { t } from './i18n';

const AVATAR_MAX_BYTES = 500 * 1024;
const NAME_MAX_BYTES = 2 * 1024 * 1024;

// How long a failed avatar/name resolution is remembered before it is retried.
// Mirrors Home's `useAccountAvatar` cooldown so a not-yet-published avatar is not
// permanently null for the lifetime of the session.
const NEGATIVE_CACHE_COOLDOWN_MS = 5 * 60 * 1000;

// Raster image types we are willing to assemble into a data URI in the dev fallback.
// SVG/XML are intentionally excluded (#30 hardening).
const RASTER_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

type NegativeCacheEntry = { at: number };

// Module-level caches keyed by address. The negative cache records failed avatar
// resolutions (so they are not retried on every churn within the cooldown window),
// and the in-flight map de-dups concurrent resolutions of the same address.
const avatarNegativeCache = new Map<string, NegativeCacheEntry>();
const inFlightProfiles = new Map<string, Promise<IdentityProfile>>();

export function normalizeRegisteredName(name: string | null | undefined) {
  return typeof name === 'string' && name.length > 0 ? name : null;
}

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function getAvatarFallbackCharacter(name: string | null | undefined, address: string) {
  const registeredName = normalizeRegisteredName(name);

  if (registeredName) {
    return Array.from(registeredName)[0] ?? '?';
  }

  // Unnamed accounts get a distinguishable initial from the first base58 character
  // of their address so different accounts do not all collapse to the same glyph.
  for (const character of address ?? '') {
    if (BASE58_ALPHABET.includes(character)) {
      return character;
    }
  }

  return '?';
}

function hasBridgeAction(actions: QdnAction[] | undefined, action: string) {
  return actions?.some((candidate) => candidate.toUpperCase() === action.toUpperCase()) ?? false;
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

function sniffRasterMimeType(base64: string) {
  if (base64.startsWith('iVBORw0KGgo')) {
    return 'image/png';
  }

  if (base64.startsWith('/9j/')) {
    return 'image/jpeg';
  }

  if (base64.startsWith('R0lGOD')) {
    return 'image/gif';
  }

  if (base64.startsWith('UklGR')) {
    return 'image/webp';
  }

  return 'image/png';
}

function getRasterMimeType(properties: unknown, base64: string) {
  const mimeType = getStringProperty(properties, 'mimeType')?.toLowerCase();

  if (mimeType && RASTER_IMAGE_MIME_TYPES.has(mimeType)) {
    return mimeType;
  }

  // Ignore non-raster (e.g. svg/xml) or missing mimeTypes and sniff the payload instead.
  return sniffRasterMimeType(base64);
}

function getBase64Payload(value: unknown) {
  if (typeof value !== 'string') {
    throw new Error(t('error.avatarUnsupported'));
  }

  const base64 = value.trim();

  if (!base64) {
    throw new Error(t('error.avatarEmpty'));
  }

  return base64;
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

/**
 * Resolve an avatar render URL via Home's `GET_QDN_RESOURCE_URL` bridge action.
 * Home performs a status check first and returns a ready-to-use `renderUrl` string
 * (or throws when the resource is not published), so the URL is set straight onto
 * the `<img src>` without any base64/data-URI assembly on the app side.
 */
async function fetchAvatarRenderUrl(name: string) {
  const renderUrl = await qdnRequest<unknown>({
    action: 'GET_QDN_RESOURCE_URL',
    service: 'THUMBNAIL',
    name,
    identifier: 'avatar',
  });

  if (typeof renderUrl !== 'string' || !renderUrl) {
    throw new Error(t('error.avatarRenderUrl'));
  }

  return renderUrl;
}

/**
 * Dev/browser fallback (no Home bridge): fetch the avatar from the local Core node
 * as base64 and assemble a data URI. Status-first via the resource status endpoint
 * (no forced rebuild — #7) so an unbuilt/not-yet-published THUMBNAIL is skipped
 * cheaply instead of triggering an expensive rebuild on every cold list load.
 */
async function fetchAvatarDataUri(name: string) {
  const status = await fetchNodeApiData<unknown>(
    `/arbitrary/resource/status/THUMBNAIL/${encodeURIComponent(name)}/avatar`,
    t('fetch.avatarStatus'),
    64 * 1024,
  );

  const statusValue = getStringProperty(status, 'status');

  if (!statusValue || statusValue === 'NOT_PUBLISHED') {
    throw new Error(t('error.avatarMissing'));
  }

  const base64 = getBase64Payload(
    await fetchNodeApiData<string>(
      `/arbitrary/THUMBNAIL/${encodeURIComponent(name)}/avatar?encoding=base64`,
      t('fetch.avatarImage'),
      AVATAR_MAX_BYTES,
    ),
  );
  const mimeType = getRasterMimeType(status, base64);

  return `data:${mimeType};base64,${base64}`;
}

export async function fetchAvatarImage(name: string, actions?: QdnAction[]): Promise<string> {
  if (hasHomeBridge() && hasBridgeAction(actions, 'GET_QDN_RESOURCE_URL')) {
    return fetchAvatarRenderUrl(name);
  }

  return fetchAvatarDataUri(name);
}

async function resolveAvatarSrc(name: string, address: string, actions?: QdnAction[]) {
  const cooled = avatarNegativeCache.get(address);

  if (cooled && Date.now() - cooled.at < NEGATIVE_CACHE_COOLDOWN_MS) {
    return null;
  }

  try {
    const avatarSrc = await fetchAvatarImage(name, actions);

    avatarNegativeCache.delete(address);

    return avatarSrc;
  } catch {
    // Record the failure so an unpublished/unbuilt avatar is not retried on every
    // profile churn, but is retried once the cooldown elapses (#11).
    avatarNegativeCache.set(address, { at: Date.now() });

    return null;
  }
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
    avatarSrc: await resolveAvatarSrc(name, address, actions),
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

type ResolvedIdentityEntry = { address?: unknown; name?: unknown; avatarSrc?: unknown };

function toIdentityProfile(entry: ResolvedIdentityEntry, address: string): IdentityProfile {
  const name = normalizeRegisteredName(typeof entry.name === 'string' ? entry.name : null);
  // Home only emits an avatarSrc for named accounts and does not status-check it, so an unpublished
  // avatar still yields a URL here; IdentityAvatar falls back to the glyph on image error.
  const avatarSrc = name && typeof entry.avatarSrc === 'string' && entry.avatarSrc ? entry.avatarSrc : null;

  return { address, avatarSrc, name };
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
 * Resolve identities for many addresses at once. When Home advertises `RESOLVE_IDENTITIES` the whole
 * set is resolved in one chunked bridge call instead of a name+avatar round-trip per address
 * (perf-002); otherwise it falls back to the per-address path with bounded concurrency.
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
