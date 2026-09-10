import type { ViewMode } from './viewTypes';

export interface TrustRoute {
  account: string | null;
  view: ViewMode;
}

const TRUST_ROUTE_KEYS = ['account', 'target', 'view'] as const;

// Only traverse history entries created inside this app. A direct account link has no
// previous app route, so its Back action must stay in the app and open the account list.
export function trustHistoryDepth(state: unknown): number {
  const depth = (state as { trustNavigationDepth?: unknown } | null)?.trustNavigationDepth;
  return typeof depth === 'number' && Number.isSafeInteger(depth) && depth > 0 ? depth : 0;
}

// Aliases that normalize to the canonical 'developers' view. A link built from either reads the
// same reference workspace; only 'developers' is ever written back onto the URL (see
// getTrustRouteUrl), so these never round-trip verbatim.
const DEVELOPERS_VIEW_ALIASES = new Set(['developers', 'developer', 'reference']);

export function readTrustRoute(input: string | URL): TrustRoute {
  const url = input instanceof URL ? input : new URL(input, 'http://localhost');
  const requestedView = url.searchParams.get('view');
  // A removed view (e.g. a stale 'graph' link from before the graph was cut) falls back to Accounts
  // rather than round-tripping an unrecognized value onto the URL.
  const view: ViewMode =
    requestedView === 'changes'
      ? requestedView
      : requestedView && DEVELOPERS_VIEW_ALIASES.has(requestedView)
        ? 'developers'
        : 'accounts';

  return {
    account: url.searchParams.get('account') ?? url.searchParams.get('target'),
    view,
  };
}

export function getTrustRouteUrl(input: string | URL, route: TrustRoute): URL {
  const url = input instanceof URL ? new URL(input.href) : new URL(input, 'http://localhost');

  for (const key of TRUST_ROUTE_KEYS) {
    url.searchParams.delete(key);
  }

  if (route.view !== 'accounts') {
    url.searchParams.set('view', route.view);
  }
  if (route.account) {
    url.searchParams.set('account', route.account);
  }

  return url;
}

// The Developers reference's in-page table-of-contents anchor. Deliberately independent of
// TrustRoute/TRUST_ROUTE_KEYS: unlike `account`/`view`, an arbitrary `section` value from a
// direct link must survive navigation to every other view untouched (general "keep unrecognized
// query params" policy), and only ever gets written or cleared by the reference workspace itself.
export function readDeveloperSection(input: string | URL): string | null {
  const url = input instanceof URL ? input : new URL(input, 'http://localhost');

  return url.searchParams.get('section');
}

export function getDeveloperSectionUrl(input: string | URL, section: string | null): URL {
  const url = input instanceof URL ? new URL(input.href) : new URL(input, 'http://localhost');

  if (section) {
    url.searchParams.set('section', section);
  } else {
    url.searchParams.delete('section');
  }

  return url;
}
