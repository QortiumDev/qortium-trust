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

export function readTrustRoute(input: string | URL): TrustRoute {
  const url = input instanceof URL ? input : new URL(input, 'http://localhost');
  const requestedView = url.searchParams.get('view');
  // A removed view (e.g. a stale 'graph' link from before the graph was cut) falls back to Accounts
  // rather than round-tripping an unrecognized value onto the URL.
  const view: ViewMode = requestedView === 'changes' ? requestedView : 'accounts';

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
