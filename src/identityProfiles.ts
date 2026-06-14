import { qdnRequest } from './qdnRequest';
import { fetchNodeApiData } from './trustApi';
import type { IdentityProfile, NameSummary, QdnAction } from './types';

const AVATAR_MAX_BYTES = 500 * 1024;
const NAME_MAX_BYTES = 2 * 1024 * 1024;

export function normalizeRegisteredName(name: string | null | undefined) {
  return typeof name === 'string' && name.length > 0 ? name : null;
}

export function getAvatarFallbackCharacter(name: string | null | undefined, address: string) {
  const registeredName = normalizeRegisteredName(name);

  return registeredName ? (Array.from(registeredName)[0] ?? '?') : '?';
}

function hasBridgeAction(actions: QdnAction[] | undefined, action: string) {
  return actions?.some((candidate) => candidate.toUpperCase() === action.toUpperCase()) ?? false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function getStringProperty(value: unknown, key: string) {
  if (!isRecord(value)) {
    return undefined;
  }

  const property = value[key];

  return typeof property === 'string' ? property : undefined;
}

function getNumberProperty(value: unknown, key: string) {
  if (!isRecord(value)) {
    return undefined;
  }

  const property = value[key];

  return typeof property === 'number' ? property : undefined;
}

function getFirstRegisteredName(names: NameSummary[]) {
  for (const summary of names) {
    const name = normalizeRegisteredName(summary.name);

    if (name) {
      return name;
    }
  }

  return null;
}

function getImageMimeType(properties: unknown, base64: string) {
  const mimeType = getStringProperty(properties, 'mimeType');

  if (mimeType?.toLowerCase().startsWith('image/')) {
    return mimeType;
  }

  if (base64.startsWith('iVBORw0KGgo')) {
    return 'image/png';
  }

  if (base64.startsWith('/9j/')) {
    return 'image/jpeg';
  }

  if (base64.startsWith('R0lGOD')) {
    return 'image/gif';
  }

  if (base64.startsWith('UklGR')) {
    return 'image/webp';
  }

  return 'image/png';
}

function getBase64Payload(value: unknown) {
  if (typeof value !== 'string') {
    throw new Error('Avatar resource returned an unsupported response.');
  }

  const base64 = value.trim();

  if (!base64) {
    throw new Error('Avatar resource returned empty image data.');
  }

  return base64;
}

async function getAccountNames(address: string, actions?: QdnAction[]) {
  if (hasBridgeAction(actions, 'GET_ACCOUNT_NAMES')) {
    return qdnRequest<NameSummary[]>({
      action: 'GET_ACCOUNT_NAMES',
      address,
    });
  }

  return fetchNodeApiData<NameSummary[]>(`/names/address/${encodeURIComponent(address)}`, 'Account names', NAME_MAX_BYTES);
}

async function resolveRegisteredName(address: string, actions?: QdnAction[]) {
  return getFirstRegisteredName(await getAccountNames(address, actions));
}

async function getAvatarProperties(name: string, actions?: QdnAction[]) {
  const request = {
    service: 'THUMBNAIL',
    name,
    identifier: 'avatar',
    path: '',
  };

  if (hasBridgeAction(actions, 'GET_QDN_RESOURCE_PROPERTIES')) {
    return qdnRequest<unknown>({
      action: 'GET_QDN_RESOURCE_PROPERTIES',
      ...request,
    });
  }

  return fetchNodeApiData<unknown>(
    `/arbitrary/resource/properties/THUMBNAIL/${encodeURIComponent(name)}/avatar`,
    'Avatar properties',
    64 * 1024,
  );
}

async function getAvatarBase64(name: string, actions?: QdnAction[]) {
  const request = {
    service: 'THUMBNAIL',
    name,
    identifier: 'avatar',
    path: '',
  };

  if (hasBridgeAction(actions, 'FETCH_QDN_RESOURCE')) {
    return getBase64Payload(
      await qdnRequest<unknown>({
        action: 'FETCH_QDN_RESOURCE',
        ...request,
        encoding: 'base64',
        rebuild: true,
        maxBytes: AVATAR_MAX_BYTES,
      }),
    );
  }

  return fetchNodeApiData<string>(
    `/arbitrary/THUMBNAIL/${encodeURIComponent(name)}/avatar?encoding=base64&rebuild=true`,
    'Avatar image',
    AVATAR_MAX_BYTES,
  );
}

export async function fetchAvatarImage(name: string, actions?: QdnAction[]) {
  const properties = await getAvatarProperties(name, actions);
  const size = getNumberProperty(properties, 'size');

  if (typeof size === 'number' && size > AVATAR_MAX_BYTES) {
    throw new Error('Avatar exceeds the thumbnail size limit.');
  }

  const base64 = getBase64Payload(await getAvatarBase64(name, actions));
  const mimeType = getImageMimeType(properties, base64);

  return `data:${mimeType};base64,${base64}`;
}

export async function loadIdentityProfile(address: string, actions?: QdnAction[]): Promise<IdentityProfile> {
  const name = await resolveRegisteredName(address, actions);

  if (!name) {
    return {
      address,
      avatarSrc: null,
      name: null,
    };
  }

  try {
    return {
      address,
      avatarSrc: await fetchAvatarImage(name, actions),
      name,
    };
  } catch {
    return {
      address,
      avatarSrc: null,
      name,
    };
  }
}

export function getIdentityLabel(profile: IdentityProfile | undefined, address: string) {
  return profile?.name ?? address;
}
