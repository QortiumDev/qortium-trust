import { afterEach, expect, it, vi } from 'vitest';
import { fetchBrowserAvatar } from './browserAvatar';

vi.mock('./qdnRequest', () => ({ getNodeApiUrl: () => 'http://node.test' }));
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
afterEach(() => vi.unstubAllGlobals());

it('loads pointer bytes through Core without reconstructing resource URLs, including a default identifier', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(json({ service: 'THUMBNAIL', name: 'Alice', identifier: '' }))
    .mockResolvedValueOnce(new Response(png, { headers: { 'content-type': 'application/octet-stream' } }));
  vi.stubGlobal('fetch', fetchMock);
  expect(await fetchBrowserAvatar('Qpointer')).toMatchObject({ kind: 'ready', contentType: 'image/png', source: 'POINTER' });
  expect(fetchMock.mock.calls.map(call => call[0])).toEqual(['http://node.test/addresses/Qpointer/avatar/info', 'http://node.test/addresses/Qpointer/avatar']);
});

it('falls back only after a missing pointer, using the current primary name and both legacy identifiers', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(json({}, 404)).mockResolvedValueOnce(json({ name: 'Alice / Bob' }))
    .mockResolvedValueOnce(json({}, 404)).mockResolvedValueOnce(new Response(png));
  vi.stubGlobal('fetch', fetchMock);
  expect(await fetchBrowserAvatar('Qlegacy')).toMatchObject({ kind: 'ready', source: 'LEGACY' });
  expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
    'http://node.test/addresses/Qlegacy/avatar/info', 'http://node.test/names/primary/Qlegacy',
    'http://node.test/arbitrary/THUMBNAIL/Alice%20%2F%20Bob/avatar?async=true',
    'http://node.test/arbitrary/THUMBNAIL/Alice%20%2F%20Bob/qortal_avatar?async=true',
  ]);
});

it.each([500, 403])('does not turn pointer lookup HTTP %s into a legacy lookup', async status => {
  const fetchMock = vi.fn().mockResolvedValue(json({}, status));
  vi.stubGlobal('fetch', fetchMock);
  expect(await fetchBrowserAvatar(`Qerror${status}`)).toEqual({ kind: 'unavailable' });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('preserves pending pointers instead of showing a legacy image', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(json({ service: 'IMAGE', name: 'Alice' }))
    .mockResolvedValueOnce(new Response(null, { status: 202, headers: { 'retry-after': '999' } }));
  vi.stubGlobal('fetch', fetchMock);
  expect(await fetchBrowserAvatar('Qpending')).toEqual({ kind: 'pending', retryAfterSeconds: 30 });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it.each(['html', 'oversize'])('rejects %s payloads despite a declared image MIME', async kind => {
  const payload = kind === 'html' ? '<html>not an avatar</html>' : new Uint8Array(500 * 1024 + 1);
  const fetchMock = vi.fn().mockResolvedValueOnce(json({ service: 'IMAGE', name: 'Alice' }))
    .mockResolvedValueOnce(new Response(payload, { headers: { 'content-type': 'image/png' } }));
  vi.stubGlobal('fetch', fetchMock);
  expect(await fetchBrowserAvatar(`Q${kind}`)).toEqual({ kind: 'unavailable' });
});

it('deduplicates overlapping requests for the same account', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(json({ service: 'IMAGE', name: 'Alice' })).mockResolvedValueOnce(new Response(png));
  vi.stubGlobal('fetch', fetchMock);
  const results = await Promise.all([fetchBrowserAvatar('Qshared'), fetchBrowserAvatar('Qshared')]);
  expect(results.every(result => result.kind === 'ready')).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
