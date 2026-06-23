import { hasHomeBridge, qdnRequest } from './qdnRequest';
import { t } from './i18n';
import type {
  AccountData,
  AccountRating,
  AccountRatingCategory,
  AccountRatingCooldown,
  AccountTrustExplanation,
  AccountTrustProfile,
  NodeApiFetchResult,
  NodeStatus,
  RateAccountRequest,
  RateAccountResult,
  RatingImpactPreview,
  ResourceRatingSummary,
  SelfAccount,
  TrustDerivation,
  TrustDerivationOrderBy,
  TrustPolicy,
  TrustStatus,
  TrustStatusChange,
  TrustSummary,
} from './types';

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_DERIVATION_LIMIT = 250;
const DEFAULT_RATING_LIMIT = 1000;

function appendQueryValue(query: URLSearchParams, key: string, value: string | number | boolean | undefined | null) {
  if (value === undefined || value === null || value === '') {
    return;
  }

  query.set(key, String(value));
}

// Case-insensitive lookup for a numeric response header. Home's FETCH_NODE_API forwards the node's
// response headers verbatim (case preserved), and the browser-dev fallback omits headers entirely,
// so callers degrade to `null` rather than guessing a count.
function readNumericHeader(headers: Record<string, string> | undefined, name: string): number | null {
  if (!headers) {
    return null;
  }

  const target = name.toLowerCase();

  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) {
      const parsed = Number(value);

      return Number.isFinite(parsed) ? parsed : null;
    }
  }

  return null;
}

export async function fetchNodeApiResult<T>(
  path: string,
  label: string,
  maxBytes = DEFAULT_MAX_BYTES,
): Promise<NodeApiFetchResult<T>> {
  const result = await qdnRequest<NodeApiFetchResult<T>>({
    action: 'FETCH_NODE_API',
    maxBytes,
    path,
  });

  if (!result.ok) {
    throw new Error(result.body || t('fetch.failedHttp', { label, status: result.status }));
  }

  return result;
}

export async function fetchNodeApiData<T>(path: string, label: string, maxBytes = DEFAULT_MAX_BYTES) {
  return (await fetchNodeApiResult<T>(path, label, maxBytes)).data;
}

export function buildTrustDerivationPath(options: {
  category?: AccountRatingCategory;
  limit?: number;
  live?: boolean;
  minLevel?: number;
  offset?: number;
  orderBy?: TrustDerivationOrderBy;
  reverse?: boolean;
  seedMember?: boolean;
  status?: TrustStatus;
} = {}) {
  const query = new URLSearchParams();

  appendQueryValue(query, 'category', options.category);
  appendQueryValue(query, 'limit', options.limit ?? DEFAULT_DERIVATION_LIMIT);
  appendQueryValue(query, 'live', options.live);
  appendQueryValue(query, 'minLevel', options.minLevel);
  appendQueryValue(query, 'offset', options.offset);
  appendQueryValue(query, 'orderBy', options.orderBy);
  appendQueryValue(query, 'reverse', options.reverse);
  appendQueryValue(query, 'seedMember', options.seedMember);
  appendQueryValue(query, 'status', options.status);

  return `/account-ratings/trust-derivation?${query.toString()}`;
}

export function buildAccountRatingsPath(options: {
  category?: AccountRatingCategory;
  limit?: number;
  offset?: number;
  rater?: string;
  reverse?: boolean;
  target?: string;
} = {}) {
  const query = new URLSearchParams();

  appendQueryValue(query, 'category', options.category);
  appendQueryValue(query, 'limit', options.limit ?? DEFAULT_RATING_LIMIT);
  appendQueryValue(query, 'offset', options.offset);
  appendQueryValue(query, 'rater', options.rater);
  appendQueryValue(query, 'reverse', options.reverse);
  appendQueryValue(query, 'target', options.target);

  return `/account-ratings?${query.toString()}`;
}

export function buildTrustChangesPath(options: {
  category?: AccountRatingCategory;
  limit?: number;
  offset?: number;
  reverse?: boolean;
  account?: string;
  previousStatus?: TrustStatus;
  newStatus?: TrustStatus;
} = {}) {
  const query = new URLSearchParams();

  appendQueryValue(query, 'account', options.account);
  appendQueryValue(query, 'category', options.category);
  appendQueryValue(query, 'limit', options.limit ?? 25);
  appendQueryValue(query, 'newStatus', options.newStatus);
  appendQueryValue(query, 'offset', options.offset);
  appendQueryValue(query, 'previousStatus', options.previousStatus);
  appendQueryValue(query, 'reverse', options.reverse);

  return `/account-ratings/trust-changes?${query.toString()}`;
}

export function buildResourceRatingsPath(options: {
  identifier?: string;
  limit?: number;
  name?: string;
  offset?: number;
  reverse?: boolean;
  service?: string;
} = {}) {
  const query = new URLSearchParams();

  appendQueryValue(query, 'identifier', options.identifier);
  appendQueryValue(query, 'limit', options.limit ?? 25);
  appendQueryValue(query, 'name', options.name);
  appendQueryValue(query, 'offset', options.offset);
  appendQueryValue(query, 'reverse', options.reverse);
  appendQueryValue(query, 'service', options.service);

  return `/resource-ratings?${query.toString()}`;
}

export function buildRatingCooldownPath(options: {
  target: string;
  rater: string;
  category?: AccountRatingCategory;
}) {
  const query = new URLSearchParams();

  appendQueryValue(query, 'target', options.target);
  appendQueryValue(query, 'rater', options.rater);
  appendQueryValue(query, 'category', options.category);

  return `/account-ratings/cooldown?${query.toString()}`;
}

export function getNodeStatus() {
  return fetchNodeApiData<NodeStatus>('/admin/status', t('fetch.nodeStatus'), 256 * 1024);
}

export function getAccountData(address: string) {
  return fetchNodeApiData<AccountData>(`/addresses/${encodeURIComponent(address)}`, t('fetch.accountData'), 256 * 1024);
}

export function getTrustSummary() {
  return fetchNodeApiData<TrustSummary>('/account-ratings/trust-summary', t('fetch.trustSummary'));
}

export function getTrustPolicy() {
  return fetchNodeApiData<TrustPolicy>('/account-ratings/trust-policy', t('fetch.trustPolicy'));
}

/**
 * Fetch a page of the trust derivation listing plus the total category size from the `X-Total-Count`
 * response header (set by Core on the paginated listing). `total` is `null` when the header is
 * absent — e.g. the browser-dev fallback, which doesn't surface response headers — so the UI can
 * cleanly omit the "of M" hint instead of showing a wrong count.
 */
export async function getTrustDerivationPage(
  options?: Parameters<typeof buildTrustDerivationPath>[0],
): Promise<{ derivations: TrustDerivation[]; total: number | null }> {
  const result = await fetchNodeApiResult<TrustDerivation[]>(
    buildTrustDerivationPath(options),
    t('fetch.trustDerivation'),
  );

  return { derivations: result.data, total: readNumericHeader(result.headers, 'X-Total-Count') };
}

export function getAccountRatings(options?: Parameters<typeof buildAccountRatingsPath>[0]) {
  return fetchNodeApiData<AccountRating[]>(buildAccountRatingsPath(options), t('fetch.accountRatings'));
}

export function getTrustChanges(options?: Parameters<typeof buildTrustChangesPath>[0]) {
  return fetchNodeApiData<TrustStatusChange[]>(buildTrustChangesPath(options), t('fetch.trustChanges'));
}

export function getResourceRatings(options?: Parameters<typeof buildResourceRatingsPath>[0]) {
  return fetchNodeApiData<ResourceRatingSummary[]>(buildResourceRatingsPath(options), t('fetch.resourceRatings'));
}

export function getTrustProfile(targetPublicKey: string) {
  const query = new URLSearchParams({ target: targetPublicKey });

  return fetchNodeApiData<AccountTrustProfile>(`/account-ratings/trust-profile?${query.toString()}`, t('fetch.trustProfile'));
}

export function getTrustExplanation(targetPublicKey: string, live = false) {
  const query = new URLSearchParams({ target: targetPublicKey });

  if (live) {
    query.set('live', 'true');
  }

  return fetchNodeApiData<AccountTrustExplanation>(
    `/account-ratings/trust-explanation?${query.toString()}`,
    t('fetch.trustExplanation'),
  );
}

export function getRatingCooldown(options: Parameters<typeof buildRatingCooldownPath>[0]) {
  return fetchNodeApiData<AccountRatingCooldown>(buildRatingCooldownPath(options), t('fetch.ratingCooldown'), 256 * 1024);
}

// Live preview of a proposed rating's validity and trust impact (#33). Lets the UI block a submit
// Core would reject (cooldown, self, unchanged…) and show the resulting trust delta before signing.
export function getRatingPreview(options: {
  category: AccountRatingCategory;
  rater: string;
  rating: number;
  target: string;
}) {
  const query = new URLSearchParams();

  appendQueryValue(query, 'category', options.category);
  appendQueryValue(query, 'rater', options.rater);
  appendQueryValue(query, 'rating', options.rating);
  appendQueryValue(query, 'target', options.target);

  return fetchNodeApiData<RatingImpactPreview>(
    `/account-ratings/preview?${query.toString()}`,
    t('fetch.ratingPreview'),
    256 * 1024,
  );
}

/**
 * Resolve the current Qortium Home account (the rater). Home-only: the GET_SELECTED_ACCOUNT and
 * RATE_ACCOUNT bridge actions have no browser-dev equivalent, so this returns null without a bridge.
 * The selected-account action carries no public key, so we read it from /addresses/{address}, which
 * is null until the account has an on-chain transaction.
 */
export async function resolveSelfAccount(): Promise<SelfAccount | null> {
  if (!hasHomeBridge()) {
    return null;
  }

  const selected = await qdnRequest<{ address?: string; name?: string | null; isUnlocked?: boolean } | null>({
    action: 'GET_SELECTED_ACCOUNT',
  });

  const address = selected?.address;

  if (!address) {
    return null;
  }

  let publicKey: string | null = null;

  try {
    const accountData = await getAccountData(address);
    publicKey = accountData.publicKey ?? null;
  } catch {
    publicKey = null;
  }

  return {
    address,
    isUnlocked: selected?.isUnlocked,
    name: selected?.name ?? null,
    publicKey,
  };
}

/**
 * Ask Qortium Home to unlock the selected account, prompting the user when it is locked.
 * Returns the selected account with its refreshed lock state; if it is already unlocked Home
 * returns immediately without a prompt. Home-only.
 */
export async function ensureAccountUnlocked(): Promise<SelfAccount | null> {
  if (!hasHomeBridge()) {
    return null;
  }

  const account = await qdnRequest<{ address?: string; name?: string | null; isUnlocked?: boolean } | null>({
    action: 'UNLOCK_SELECTED_ACCOUNT',
  });

  if (!account?.address) {
    return null;
  }

  return {
    address: account.address,
    isUnlocked: account.isUnlocked,
    name: account.name ?? null,
    publicKey: null,
  };
}

/**
 * Submit a trust rating through Qortium Home, which builds, signs, and broadcasts the
 * RATE_ACCOUNT transaction. Home-only — there is no key to sign with in browser development.
 */
export async function submitRating(request: RateAccountRequest): Promise<RateAccountResult> {
  if (!hasHomeBridge()) {
    throw new Error(t('error.appUnavailable'));
  }

  return qdnRequest<RateAccountResult>({
    action: 'RATE_ACCOUNT',
    category: request.category,
    rating: request.rating,
    targetPublicKey: request.targetPublicKey,
  });
}
