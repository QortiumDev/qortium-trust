import { hasHomeBridge, qdnRequest } from './qdnRequest';
import type { QdnAction } from './types';

const AVATAR_MAX_BYTES = 500 * 1024;
const MAX_PENDING_RETRIES = 3;
const RASTER_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/bmp', 'image/webp']);

export type AccountAvatarResult =
  | { kind: 'ready'; contentType: string; bytes: Uint8Array; source: 'POINTER' | 'LEGACY' }
  | { kind: 'pending'; retryAfterSeconds: number }
  | { kind: 'unavailable' };

type AvatarResponse = Record<string, unknown>;

export function hasBridgeAction(actions: QdnAction[] | undefined, action: string) {
  return actions?.some((candidate) => candidate.toUpperCase() === action.toUpperCase()) ?? false;
}

function isRecord(value: unknown): value is AvatarResponse {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function base64ToBytes(body: string) {
  const normalized = body.trim();

  if (!normalized || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length % 4 !== 0) {
    return null;
  }

  try {
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
  } catch {
    return null;
  }
}

function isPointerDescriptor(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.service === 'string' &&
    value.service.trim() !== '' &&
    typeof value.name === 'string' &&
    value.name.trim() !== '' &&
    typeof value.identifier === 'string' &&
    value.identifier.trim() !== ''
  );
}

/** Parse Home's avatar bridge result without trusting raw URLs or malformed image bytes. */
export function parseAccountAvatarResponse(value: unknown, address: string): AccountAvatarResult {
  if (!isRecord(value)) {
    return { kind: 'unavailable' };
  }

  if (value.status === 'PENDING') {
    const retryAfterSeconds = typeof value.retryAfterSeconds === 'number' ? value.retryAfterSeconds : 1;

    return { kind: 'pending', retryAfterSeconds: Math.min(30, Math.max(1, retryAfterSeconds)) };
  }

  const source = value.source;
  const contentType = typeof value.contentType === 'string' ? value.contentType.toLowerCase() : '';
  const contentLength = value.contentLength;
  const body = value.body;

  if (
    value.address !== address ||
    value.encoding !== 'base64' ||
    (source !== 'POINTER' && source !== 'LEGACY') ||
    !RASTER_IMAGE_MIME_TYPES.has(contentType) ||
    typeof contentLength !== 'number' ||
    !Number.isInteger(contentLength) ||
    contentLength < 1 ||
    contentLength > AVATAR_MAX_BYTES ||
    typeof body !== 'string' ||
    (source === 'POINTER' && !isPointerDescriptor(value.descriptor))
  ) {
    return { kind: 'unavailable' };
  }

  const bytes = base64ToBytes(body);

  if (!bytes || bytes.byteLength !== contentLength || bytes.byteLength > AVATAR_MAX_BYTES) {
    return { kind: 'unavailable' };
  }

  return { kind: 'ready', bytes, contentType, source };
}

export async function fetchAccountAvatar(address: string, actions?: QdnAction[]): Promise<AccountAvatarResult> {
  if (!hasHomeBridge() || !hasBridgeAction(actions, 'FETCH_ACCOUNT_AVATAR')) {
    return { kind: 'unavailable' };
  }

  try {
    return parseAccountAvatarResponse(await qdnRequest<unknown>({ action: 'FETCH_ACCOUNT_AVATAR', address }), address);
  } catch {
    return { kind: 'unavailable' };
  }
}

export function getPendingRetryCount() {
  return MAX_PENDING_RETRIES;
}
