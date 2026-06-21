// Resolves bundled asset URLs (e.g. the app icon) to a location Core's QDN /render proxy can serve.
//
// Qortium Home / Core changed the render URL form (qortium-home commit 0f349f54, "#46"): the
// resource identifier moved from a `?identifier=` query param to a path segment, so a render URL is
// now `/render/{service}/{name}/{identifier}/{path}` and the old `?identifier=` hint is no longer
// honored. Vite emits relative asset URLs (`base: './'`), which only resolve correctly when the
// document base carries the identifier segment (and a trailing slash). To be robust across schemes we
// rebuild the asset URL against the render prefix taken from the path; if no identifier segment is
// present we fall back to the legacy `?identifier=` query hint.

export type QdnAssetContext = {
  /** window._qdnContext — Core injects 'render' inside the QDN render proxy. */
  context?: unknown;
  /** window._qdnIdentifier — Core injects the resource identifier. */
  identifier?: unknown;
  origin: string;
  pathname: string;
  search: string;
};

export function isQdnRenderContext(ctx: QdnAssetContext) {
  return ctx.context === 'render' || ctx.pathname.includes('/render/');
}

export function resolveQdnAssetUrl(assetUrl: string, ctx: QdnAssetContext): string {
  if (!isQdnRenderContext(ctx)) {
    return assetUrl;
  }

  const segments = ctx.pathname.split('/').filter(Boolean);
  const renderIndex = segments.indexOf('render');

  // Path-segment scheme: /render/{service}/{name}/{identifier}/... — rebuild against the render
  // prefix (with a trailing slash) so relative assets resolve regardless of the document's slash.
  if (renderIndex >= 0 && segments.length >= renderIndex + 4) {
    const base = `${ctx.origin}/${segments.slice(0, renderIndex + 4).join('/')}/`;

    try {
      return new URL(assetUrl.replace(/^\.?\//, ''), base).toString();
    } catch {
      return assetUrl;
    }
  }

  // Legacy scheme: identifier lives in the query string (or the injected global). Keep appending the
  // `?identifier=` hint so older nodes still resolve the asset to the right resource.
  const identifier =
    new URLSearchParams(ctx.search).get('identifier') ??
    (typeof ctx.identifier === 'string' ? ctx.identifier : '');

  if (!identifier) {
    return assetUrl;
  }

  try {
    const url = new URL(assetUrl, `${ctx.origin}${ctx.pathname}${ctx.search}`);

    if (!url.searchParams.has('identifier')) {
      url.searchParams.set('identifier', identifier);
    }

    return url.toString();
  } catch {
    return assetUrl;
  }
}
