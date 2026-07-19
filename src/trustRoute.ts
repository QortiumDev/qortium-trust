import type { ViewMode } from './viewTypes';

export interface TrustRoute {
  account: string | null;
  view: ViewMode;
}

const TRUST_ROUTE_KEYS = ['account', 'target', 'view'] as const;

export function readTrustRoute(input: string | URL): TrustRoute {
  const url = input instanceof URL ? input : new URL(input, 'http://localhost');
  const requestedView = url.searchParams.get('view');
  const view: ViewMode =
    requestedView === 'graph' || requestedView === 'changes' ? requestedView : 'accounts';

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
