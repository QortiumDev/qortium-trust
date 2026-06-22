import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getBridgeState,
  hasHomeBridge,
  LOCAL_READ_ACTIONS,
  parseResponseData,
  qdnRequest,
  sanitizeNodePath,
  sanitizeReadMethod,
} from './qdnRequest';

/**
 * The module guards every host access behind `typeof window !== 'undefined'`, and the vitest
 * environment is `node`, so `window` is genuinely absent unless we stub it. Toggling the global
 * is therefore how we exercise the Home-bridge vs BROWSER_DEV routing.
 */
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubFetch(impl: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const fetchMock = vi.fn(impl as never);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function makeResponse(
  body: string,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  const headers = new Headers(init.headers ?? { 'content-type': 'application/json' });
  return {
    ok: (init.status ?? 200) >= 200 && (init.status ?? 200) < 300,
    status: init.status ?? 200,
    statusText: 'OK',
    headers,
    text: async () => body,
  } as unknown as Response;
}

describe('sanitizeNodePath', () => {
  it('rejects protocol-relative paths', () => {
    expect(() => sanitizeNodePath('//x')).toThrow('Node API paths must start with /.');
  });

  it('rejects a path containing a NUL control character', () => {
    expect(() => sanitizeNodePath('/admin/status\x00')).toThrow('invalid control characters');
  });

  it('rejects non-string and missing paths', () => {
    expect(() => sanitizeNodePath(undefined)).toThrow('Node API paths must start with /.');
    expect(() => sanitizeNodePath(42 as unknown)).toThrow('Node API paths must start with /.');
    expect(() => sanitizeNodePath({} as unknown)).toThrow('Node API paths must start with /.');
  });

  it('rejects paths that do not start with a slash', () => {
    expect(() => sanitizeNodePath('admin/status')).toThrow('Node API paths must start with /.');
  });

  it('preserves query strings', () => {
    expect(sanitizeNodePath('/account-ratings?category=SUBJECT&limit=250')).toBe(
      '/account-ratings?category=SUBJECT&limit=250',
    );
  });
});

describe('sanitizeReadMethod', () => {
  it('defaults missing/blank method to GET', () => {
    expect(sanitizeReadMethod(undefined)).toBe('GET');
    expect(sanitizeReadMethod('   ')).toBe('GET');
    expect(sanitizeReadMethod('get')).toBe('GET');
    expect(sanitizeReadMethod('HEAD')).toBe('HEAD');
  });

  it('rejects write methods such as POST', () => {
    expect(() => sanitizeReadMethod('POST')).toThrow('Only GET and HEAD');
    expect(() => sanitizeReadMethod('DELETE')).toThrow('Only GET and HEAD');
  });
});

describe('parseResponseData', () => {
  it('returns null for an empty body', () => {
    expect(parseResponseData('', 'application/json')).toBeNull();
  });

  it('parses JSON when content-type announces it', () => {
    expect(parseResponseData('{"a":1}', 'application/json')).toEqual({ a: 1 });
  });

  it('parses JSON-looking bodies even with a non-JSON content-type', () => {
    expect(parseResponseData('[1,2,3]', 'text/plain')).toEqual([1, 2, 3]);
  });

  it('falls back to the raw string when JSON is malformed', () => {
    expect(parseResponseData('{not json', 'application/json')).toBe('{not json');
  });

  it('returns plain text unchanged', () => {
    expect(parseResponseData('hello world', 'text/plain')).toBe('hello world');
  });
});

describe('FETCH_NODE_API maxBytes limit (via fallbackQdnRequest)', () => {
  // No window => qdnRequest routes to fallbackQdnRequest, which calls fetchLocalNodeApi.
  it('throws once the body exceeds a positive maxBytes', async () => {
    stubFetch(() => makeResponse('0123456789', { headers: { 'content-type': 'text/plain' } }));

    await expect(
      qdnRequest({ action: 'FETCH_NODE_API', path: '/x', maxBytes: 4 }),
    ).rejects.toThrow('exceeded the');
  });

  it('does not throw when maxBytes is 0 (unbounded)', async () => {
    stubFetch(() => makeResponse('0123456789', { headers: { 'content-type': 'text/plain' } }));

    const result = await qdnRequest<{ body: string }>({
      action: 'FETCH_NODE_API',
      path: '/x',
      maxBytes: 0,
    });
    expect(result.body).toBe('0123456789');
  });

  it('does not throw when the body is within the limit', async () => {
    stubFetch(() => makeResponse('012', { headers: { 'content-type': 'text/plain' } }));

    const result = await qdnRequest<{ body: string }>({
      action: 'FETCH_NODE_API',
      path: '/x',
      maxBytes: 4,
    });
    expect(result.body).toBe('012');
  });

  it('rejects a POST FETCH_NODE_API before fetching', async () => {
    const fetchMock = stubFetch(() => makeResponse(''));
    await expect(
      qdnRequest({ action: 'FETCH_NODE_API', path: '/x', method: 'POST' }),
    ).rejects.toThrow('Only GET and HEAD');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('qdnRequest input validation', () => {
  it('rejects requests without a string action', async () => {
    await expect(qdnRequest({} as never)).rejects.toThrow('must include an action');
    await expect(qdnRequest(null as never)).rejects.toThrow('must include an action');
  });
});

describe('bridge routing', () => {
  it('routes through window.qdnRequest when the bridge is present (QORTIUM_HOME)', async () => {
    const bridge = vi.fn(async () => 'bridge-result');
    vi.stubGlobal('window', { qdnRequest: bridge });

    expect(hasHomeBridge()).toBe(true);
    await expect(qdnRequest({ action: 'GET_ACCOUNT_DATA' })).resolves.toBe('bridge-result');
    expect(bridge).toHaveBeenCalledWith({ action: 'GET_ACCOUNT_DATA' });
  });

  it('falls back to fallbackQdnRequest when the bridge is absent (BROWSER_DEV)', async () => {
    // No window stub => bridge absent.
    expect(hasHomeBridge()).toBe(false);
    await expect(qdnRequest({ action: 'WHICH_UI' })).resolves.toBe('BROWSER_DEV');
    await expect(qdnRequest({ action: 'IS_USING_PUBLIC_NODE' })).resolves.toBe(false);
    await expect(qdnRequest({ action: 'SHOW_ACTIONS' })).resolves.toEqual([...LOCAL_READ_ACTIONS]);
  });

  it('treats a window without qdnRequest as no bridge', async () => {
    vi.stubGlobal('window', {});
    expect(hasHomeBridge()).toBe(false);
    await expect(qdnRequest({ action: 'WHICH_UI' })).resolves.toBe('BROWSER_DEV');
  });

  it('rejects unknown actions in browser development', async () => {
    await expect(qdnRequest({ action: 'RATE_ACCOUNT' })).rejects.toThrow(
      'not available in local browser development',
    );
  });
});

describe('getBridgeState', () => {
  it('reports BROWSER_DEV and the local read actions without a bridge', async () => {
    const state = await getBridgeState();
    expect(state.isHomeBridge).toBe(false);
    expect(state.ui).toBe('BROWSER_DEV');
    expect(state.actions).toEqual([...LOCAL_READ_ACTIONS]);
  });

  it('reports QORTIUM_HOME and the bridge-advertised actions when present', async () => {
    const bridge = vi.fn(async (request: { action: string }) => {
      if (request.action === 'SHOW_ACTIONS') {
        return ['FETCH_NODE_API', 'RATE_ACCOUNT', 42] as unknown;
      }
      if (request.action === 'WHICH_UI') {
        return 'QORTIUM_HOME';
      }
      return undefined;
    });
    vi.stubGlobal('window', { qdnRequest: bridge });

    const state = await getBridgeState();
    expect(state.isHomeBridge).toBe(true);
    expect(state.ui).toBe('QORTIUM_HOME');
    // Non-string entries (the 42) are filtered out.
    expect(state.actions).toEqual(['FETCH_NODE_API', 'RATE_ACCOUNT']);
  });

  it('falls back to LOCAL_READ_ACTIONS when SHOW_ACTIONS rejects', async () => {
    const bridge = vi.fn(async (request: { action: string }) => {
      if (request.action === 'SHOW_ACTIONS') {
        throw new Error('SHOW_ACTIONS not supported');
      }
      return 'QORTIUM_HOME';
    });
    vi.stubGlobal('window', { qdnRequest: bridge });

    const state = await getBridgeState();
    expect(state.actions).toEqual([...LOCAL_READ_ACTIONS]);
    expect(state.ui).toBe('QORTIUM_HOME');
  });
});
