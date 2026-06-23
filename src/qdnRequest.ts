import type { BridgeState, NodeApiFetchResult, QdnAction } from './types';
import { t } from './i18n';

const DEFAULT_NODE_API_URL = 'http://127.0.0.1:24891';

export const LOCAL_READ_ACTIONS = [
  'FETCH_NODE_API',
  'GET_NODE_STATUS',
  'IS_USING_PUBLIC_NODE',
  'SHOW_ACTIONS',
  'WHICH_UI',
] as const;

type QdnRequest = {
  action: string;
  maxBytes?: number;
  method?: string;
  path?: string;
  [key: string]: unknown;
};

export function getNodeApiUrl() {
  return (import.meta.env.VITE_QORTIUM_NODE_API_URL || DEFAULT_NODE_API_URL).replace(/\/+$/, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** @internal exported for unit tests; not part of the module's public surface. */
export function parseResponseData(body: string, contentType: string) {
  if (!body) {
    return null;
  }

  if (contentType.toLowerCase().includes('json') || /^[\s\n\r]*[\[{]/.test(body)) {
    try {
      return JSON.parse(body) as unknown;
    } catch {
      return body;
    }
  }

  return body;
}

/** @internal exported for unit tests; not part of the module's public surface. */
export function sanitizeNodePath(path: unknown) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
    throw new Error(t('error.nodeApiPathPrefix'));
  }

  if (/[\x00-\x1F]/.test(path)) {
    throw new Error(t('error.nodeApiControlChars'));
  }

  const url = new URL(path, DEFAULT_NODE_API_URL);

  return `${url.pathname}${url.search}`;
}

/** @internal exported for unit tests; not part of the module's public surface. */
export function sanitizeReadMethod(method: unknown) {
  const normalizedMethod = typeof method === 'string' && method.trim() ? method.trim().toUpperCase() : 'GET';

  if (normalizedMethod !== 'GET' && normalizedMethod !== 'HEAD') {
    throw new Error(t('error.nodeApiGetOnly'));
  }

  return normalizedMethod;
}

function getContentLength(response: Response, bodyLength: number) {
  const rawLength = response.headers.get('content-length');
  const contentLength = rawLength ? Number(rawLength) : bodyLength;

  return Number.isFinite(contentLength) ? contentLength : undefined;
}

async function fetchLocalNodeApi(request: QdnRequest): Promise<NodeApiFetchResult> {
  const method = sanitizeReadMethod(request.method);
  const apiPath = sanitizeNodePath(request.path);
  const response = await fetch(`${getNodeApiUrl()}${apiPath}`, { method });
  const contentType = response.headers.get('content-type') ?? '';
  const body = method === 'HEAD' ? '' : await response.text();
  const bodyLength = new TextEncoder().encode(body).byteLength;
  const maxBytes = typeof request.maxBytes === 'number' ? request.maxBytes : 0;

  if (maxBytes > 0 && bodyLength > maxBytes) {
    throw new Error(t('error.nodeApiByteLimit', { maxBytes: maxBytes.toLocaleString() }));
  }

  // `headers` is intentionally omitted in browser-dev: it is a bridge-only field populated by
  // Qortium Home's FETCH_NODE_API. No consumer reads it in the local fallback path today.
  return {
    body,
    contentLength: getContentLength(response, bodyLength),
    contentType,
    data: parseResponseData(body, contentType),
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
  };
}

async function fallbackQdnRequest<T>(request: QdnRequest): Promise<T> {
  switch (request.action.toUpperCase()) {
    case 'SHOW_ACTIONS':
      return [...LOCAL_READ_ACTIONS] as T;
    case 'WHICH_UI':
      return 'BROWSER_DEV' as T;
    case 'IS_USING_PUBLIC_NODE':
      return false as T;
    case 'FETCH_NODE_API':
      return (await fetchLocalNodeApi(request)) as T;
    case 'GET_NODE_STATUS': {
      const result = await fetchLocalNodeApi({ action: 'FETCH_NODE_API', path: '/admin/status' });

      if (!result.ok) {
        throw new Error(result.body || t('error.nodeStatusFailed', { status: result.status }));
      }

      return result.data as T;
    }
    default:
      throw new Error(t('error.localActionUnavailable', { action: String(request.action) }));
  }
}

export function hasHomeBridge() {
  return typeof window !== 'undefined' && typeof window.qdnRequest === 'function';
}

export async function qdnRequest<T = unknown>(request: QdnRequest): Promise<T> {
  if (!isRecord(request) || typeof request.action !== 'string') {
    throw new Error(t('error.qdnActionRequired'));
  }

  const bridgeRequest = typeof window !== 'undefined' ? window.qdnRequest : undefined;

  if (typeof bridgeRequest === 'function') {
    return bridgeRequest<T>(request);
  }

  return fallbackQdnRequest<T>(request);
}

export async function getBridgeState(): Promise<BridgeState> {
  let actions: QdnAction[] = [];
  let ui = hasHomeBridge() ? 'QORTIUM_HOME' : 'BROWSER_DEV';

  try {
    const requestedActions = await qdnRequest<unknown>({ action: 'SHOW_ACTIONS' });

    actions = Array.isArray(requestedActions)
      ? requestedActions.filter((action): action is QdnAction => typeof action === 'string')
      : [];
  } catch {
    actions = [...LOCAL_READ_ACTIONS];
  }

  try {
    const requestedUi = await qdnRequest<unknown>({ action: 'WHICH_UI' });

    if (typeof requestedUi === 'string' && requestedUi) {
      ui = requestedUi;
    }
  } catch {
    // Keep the inferred UI label.
  }

  return {
    actions,
    isHomeBridge: hasHomeBridge(),
    ui,
  };
}
