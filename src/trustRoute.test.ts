import { describe, expect, it } from 'vitest';
import { getTrustRouteUrl, readTrustRoute } from './trustRoute';

describe('Trust routes', () => {
  it('reads account, view, and legacy target links', () => {
    expect(readTrustRoute('https://example.test/app?account=Qabc&view=changes')).toEqual({
      account: 'Qabc',
      view: 'changes',
    });
    expect(readTrustRoute('https://example.test/app?target=Qlegacy&view=graph')).toEqual({
      account: 'Qlegacy',
      view: 'graph',
    });
  });

  it('falls back to Accounts for absent or invalid views', () => {
    expect(readTrustRoute('https://example.test/app')).toEqual({ account: null, view: 'accounts' });
    expect(readTrustRoute('https://example.test/app?view=unknown')).toEqual({
      account: null,
      view: 'accounts',
    });
  });

  it('replaces only Trust-owned keys while preserving Home settings and fragments', () => {
    const url = getTrustRouteUrl(
      'https://example.test/render/APP/Trust/Trust?target=old&view=changes&qdnHomeBridge=1&theme=dark&future=value#detail',
      { account: 'Qnext', view: 'accounts' },
    );

    expect(url.pathname).toBe('/render/APP/Trust/Trust');
    expect(url.searchParams.get('account')).toBe('Qnext');
    expect(url.searchParams.has('target')).toBe(false);
    expect(url.searchParams.has('view')).toBe(false);
    expect(url.searchParams.get('qdnHomeBridge')).toBe('1');
    expect(url.searchParams.get('theme')).toBe('dark');
    expect(url.searchParams.get('future')).toBe('value');
    expect(url.hash).toBe('#detail');
  });

  it('round-trips every supported route', () => {
    for (const route of [
      { account: null, view: 'accounts' as const },
      { account: null, view: 'graph' as const },
      { account: null, view: 'changes' as const },
      { account: 'Qdetail', view: 'accounts' as const },
    ]) {
      expect(readTrustRoute(getTrustRouteUrl('https://example.test/app?theme=dark', route))).toEqual(route);
    }
  });
});
