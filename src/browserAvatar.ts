import { getNodeApiUrl } from './qdnRequest';
import type { AccountAvatarResult } from './avatarClient';

const MAX_BYTES = 500 * 1024;
const unavailable = { kind: 'unavailable' } as const;

// Browser preview only. Keep Home's pointer-first behavior: legacy thumbnails are
// consulted only when Core explicitly reports that the account has no pointer.
async function readBounded(response: Response, limit: number): Promise<Uint8Array> {
  if (Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel();
    throw new Error('Avatar response exceeds byte limit');
  }
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) { await reader.cancel(); throw new Error('Avatar response exceeds byte limit'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

function rasterType(bytes: Uint8Array) {
  const starts = (prefix: number[], offset = 0) => prefix.every((value, index) => bytes[index + offset] === value);
  if (starts([137, 80, 78, 71, 13, 10, 26, 10])) return 'image/png';
  if (starts([255, 216, 255])) return 'image/jpeg';
  if (starts([71, 73, 70, 56])) return 'image/gif';
  if (starts([66, 77])) return 'image/bmp';
  if (starts([82, 73, 70, 70]) && starts([87, 69, 66, 80], 8)) return 'image/webp';
  return null;
}

const read = (path: string) => fetch(`${getNodeApiUrl()}${path}`, {
  method: 'GET', redirect: 'error', signal: AbortSignal.timeout(10_000),
});
const readJson = async (response: Response) => JSON.parse(new TextDecoder().decode(await readBounded(response, 16 * 1024)));

async function imageResult(response: Response, source: 'POINTER' | 'LEGACY'): Promise<AccountAvatarResult> {
  if (response.status === 202) {
    await response.body?.cancel();
    const retry = Number(response.headers.get('retry-after') ?? 2);
    return { kind: 'pending', retryAfterSeconds: Number.isFinite(retry) ? Math.min(30, Math.max(1, retry)) : 2 };
  }
  if (!response.ok) { await response.body?.cancel(); return unavailable; }
  const bytes = await readBounded(response, MAX_BYTES);
  const contentType = rasterType(bytes);
  return contentType ? { kind: 'ready', bytes, contentType, source } : unavailable;
}

async function load(address: string): Promise<AccountAvatarResult> {
  const accountPath = `/addresses/${encodeURIComponent(address)}/avatar`;
  const info = await read(`${accountPath}/info`);
  if (info.status !== 404) {
    if (!info.ok) { await info.body?.cancel(); return unavailable; }
    const pointer = await readJson(info);
    if (typeof pointer?.service !== 'string' || !pointer.service.trim() || typeof pointer.name !== 'string' || !pointer.name.trim()) return unavailable;
    return imageResult(await read(accountPath), 'POINTER');
  }
  await info.body?.cancel();
  const primary = await read(`/names/primary/${encodeURIComponent(address)}`);
  if (!primary.ok) { await primary.body?.cancel(); return unavailable; }
  const name = (await readJson(primary))?.name;
  if (typeof name !== 'string' || !name) return unavailable;
  for (const identifier of ['avatar', 'qortal_avatar']) {
    const result = await imageResult(await read(`/arbitrary/THUMBNAIL/${encodeURIComponent(name)}/${identifier}?async=true`), 'LEGACY');
    if (result.kind !== 'unavailable') return result;
  }
  return unavailable;
}

// Limit preview-node pressure and share overlapping table/detail requests.
const inFlight = new Map<string, Promise<AccountAvatarResult>>();
const queue: (() => void)[] = [];
let active = 0;
export function fetchBrowserAvatar(address: string): Promise<AccountAvatarResult> {
  const existing = inFlight.get(address);
  if (existing) return existing;
  const result = new Promise<AccountAvatarResult>(resolve => {
    const run = () => {
      active += 1;
      void load(address).catch(() => unavailable).then(resolve).finally(() => {
        active -= 1;
        inFlight.delete(address);
        queue.shift()?.();
      });
    };
    if (active < 4) run(); else queue.push(run);
  });
  inFlight.set(address, result);
  return result;
}
