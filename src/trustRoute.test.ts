import { describe, expect, it } from 'vitest';
import { getDeveloperSectionUrl, getTrustRouteUrl, readDeveloperSection, readTrustRoute } from './trustRoute';

describe('Trust routes', () => {
  it('reads account, view, and legacy target links', () => {
    expect(readTrustRoute('https://example.test/app?account=Qabc&view=changes')).toEqual({
      account: 'Qabc',
      view: 'changes',
    });
    expect(readTrustRoute('https://example.test/app?target=Qlegacy&view=changes')).toEqual({
      account: 'Qlegacy',
      view: 'changes',
    });
  });

  it('falls back to Accounts for absent, invalid, or removed views (e.g. the cut graph view)', () => {
    expect(readTrustRoute('https://example.test/app')).toEqual({ account: null, view: 'accounts' });
    expect(readTrustRoute('https://example.test/app?view=unknown')).toEqual({
      account: null,
      view: 'accounts',
    });
    expect(readTrustRoute('https://example.test/app?view=graph')).toEqual({
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
      { account: null, view: 'changes' as const },
      { account: 'Qdetail', view: 'accounts' as const },
      { account: null, view: 'developers' as const },
      { account: 'Qdetail', view: 'developers' as const },
    ]) {
      expect(readTrustRoute(getTrustRouteUrl('https://example.test/app?theme=dark', route))).toEqual(route);
    }
  });

  it('normalizes the developer/reference aliases to the canonical developers view, but never writes them back', () => {
    for (const alias of ['developers', 'developer', 'reference']) {
      expect(readTrustRoute(`https://example.test/app?view=${alias}`)).toEqual({ account: null, view: 'developers' });
    }

    const url = getTrustRouteUrl('https://example.test/app?view=developer', { account: null, view: 'developers' });
    expect(url.searchParams.get('view')).toBe('developers');
  });

  it('preserves repeated query parameters and the URL fragment across a route rewrite', () => {
    const url = getTrustRouteUrl('https://example.test/app?tag=a&tag=b&view=changes#anchor', {
      account: 'Qnext',
      view: 'developers',
    });

    expect(url.searchParams.getAll('tag')).toEqual(['a', 'b']);
    expect(url.hash).toBe('#anchor');
    expect(url.searchParams.get('view')).toBe('developers');
  });

  it('reads and writes the Developers section anchor independently of the account/view route', () => {
    expect(readDeveloperSection('https://example.test/app?view=developers')).toBeNull();
    expect(readDeveloperSection('https://example.test/app?view=developers&section=policy')).toBe('policy');

    const withSection = getDeveloperSectionUrl('https://example.test/app?view=developers&theme=dark', 'bounds');
    expect(withSection.searchParams.get('section')).toBe('bounds');
    expect(withSection.searchParams.get('theme')).toBe('dark');
    expect(withSection.searchParams.get('view')).toBe('developers');

    const cleared = getDeveloperSectionUrl(withSection, null);
    expect(cleared.searchParams.has('section')).toBe(false);
  });

  it('leaves an existing section param untouched when the account/view route is rewritten', () => {
    const url = getTrustRouteUrl('https://example.test/app?view=developers&section=policy', {
      account: null,
      view: 'accounts',
    });

    // General "keep unrecognized query params" policy — trustRoute.ts only owns account/target/view.
    expect(url.searchParams.get('section')).toBe('policy');
  });
});
