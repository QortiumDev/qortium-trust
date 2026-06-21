import { describe, expect, it } from 'vitest';
import { isQdnRenderContext, resolveQdnAssetUrl } from './qdnAsset';

const ORIGIN = 'https://node.example';

describe('resolveQdnAssetUrl', () => {
  it('returns the asset unchanged outside a render context (browser dev)', () => {
    expect(
      resolveQdnAssetUrl('./assets/icon.png', {
        origin: ORIGIN,
        pathname: '/',
        search: '',
      }),
    ).toBe('./assets/icon.png');
  });

  it('rebuilds against the path-segment render prefix (current #46 scheme)', () => {
    expect(
      resolveQdnAssetUrl('./assets/icon.png', {
        context: 'render',
        origin: ORIGIN,
        pathname: '/render/APP/Trust/Trust',
        search: '',
      }),
    ).toBe(`${ORIGIN}/render/APP/Trust/Trust/assets/icon.png`);
  });

  it('resolves correctly whether or not the render path has a trailing slash', () => {
    const withSlash = resolveQdnAssetUrl('./assets/icon.png', {
      context: 'render',
      origin: ORIGIN,
      pathname: '/render/APP/Trust/Trust/',
      search: '',
    });

    expect(withSlash).toBe(`${ORIGIN}/render/APP/Trust/Trust/assets/icon.png`);
  });

  it('handles root-relative asset paths under the render prefix', () => {
    expect(
      resolveQdnAssetUrl('/assets/icon.png', {
        context: 'render',
        origin: ORIGIN,
        pathname: '/render/APP/Trust/Trust',
        search: '',
      }),
    ).toBe(`${ORIGIN}/render/APP/Trust/Trust/assets/icon.png`);
  });

  it('falls back to the legacy ?identifier= hint when no identifier segment is present', () => {
    const resolved = resolveQdnAssetUrl('./assets/icon.png', {
      context: 'render',
      origin: ORIGIN,
      pathname: '/render/APP/Trust',
      search: '?identifier=Trust',
    });

    expect(resolved).toBe(`${ORIGIN}/render/APP/assets/icon.png?identifier=Trust`);
  });

  it('uses the injected _qdnIdentifier global in the legacy scheme when the query is absent', () => {
    const resolved = resolveQdnAssetUrl('./assets/icon.png', {
      context: 'render',
      identifier: 'Trust',
      origin: ORIGIN,
      pathname: '/render/APP/Trust',
      search: '',
    });

    expect(resolved).toBe(`${ORIGIN}/render/APP/assets/icon.png?identifier=Trust`);
  });

  it('returns the asset unchanged in the legacy scheme when no identifier can be found', () => {
    expect(
      resolveQdnAssetUrl('./assets/icon.png', {
        context: 'render',
        origin: ORIGIN,
        pathname: '/render/APP/Trust',
        search: '',
      }),
    ).toBe('./assets/icon.png');
  });
});

describe('isQdnRenderContext', () => {
  it('detects the render context from the injected global or the path', () => {
    expect(isQdnRenderContext({ context: 'render', origin: ORIGIN, pathname: '/', search: '' })).toBe(true);
    expect(
      isQdnRenderContext({ origin: ORIGIN, pathname: '/render/APP/Trust/Trust', search: '' }),
    ).toBe(true);
    expect(isQdnRenderContext({ origin: ORIGIN, pathname: '/', search: '' })).toBe(false);
  });
});
