import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAccountAvatar, parseAccountAvatarResponse } from './avatarClient';
import { hasHomeBridge, qdnRequest } from './qdnRequest';

vi.mock('./qdnRequest', () => ({
  hasHomeBridge: vi.fn(),
  qdnRequest: vi.fn(),
}));

const ADDRESS = 'Qavatar';

describe('pointer-aware account avatar client', () => {
  const hasHomeBridgeMock = vi.mocked(hasHomeBridge);
  const qdnRequestMock = vi.mocked(qdnRequest);

  beforeEach(() => {
    hasHomeBridgeMock.mockReset();
    qdnRequestMock.mockReset();
    hasHomeBridgeMock.mockReturnValue(true);
  });

  it('accepts a bounded pointer image only when the response matches the requested address', () => {
    expect(
      parseAccountAvatarResponse(
        {
          address: ADDRESS,
          body: 'AQIDBA==',
          contentLength: 4,
          contentType: 'image/png',
          descriptor: { identifier: 'avatar', name: 'alice', service: 'THUMBNAIL' },
          encoding: 'base64',
          source: 'POINTER',
        },
        ADDRESS,
      ),
    ).toMatchObject({ contentType: 'image/png', kind: 'ready', source: 'POINTER' });
  });

  it('fails closed for mismatched, raw-url, or malformed pointer payloads', () => {
    expect(parseAccountAvatarResponse({ address: 'Qother', body: 'AQIDBA==' }, ADDRESS)).toEqual({ kind: 'unavailable' });
    expect(
      parseAccountAvatarResponse(
        {
          address: ADDRESS,
          body: 'https://node.invalid/avatar.png',
          contentLength: 4,
          contentType: 'image/png',
          encoding: 'base64',
          source: 'LEGACY',
        },
        ADDRESS,
      ),
    ).toEqual({ kind: 'unavailable' });
  });

  it('returns PENDING with a bounded retry delay', () => {
    expect(parseAccountAvatarResponse({ retryAfterSeconds: 999, status: 'PENDING' }, ADDRESS)).toEqual({
      kind: 'pending',
      retryAfterSeconds: 30,
    });
  });

  it('feature-gates the bridge call and requests only the rendered account address', async () => {
    await expect(fetchAccountAvatar(ADDRESS, [])).resolves.toEqual({ kind: 'unavailable' });
    expect(qdnRequestMock).not.toHaveBeenCalled();

    qdnRequestMock.mockResolvedValueOnce({
      address: ADDRESS,
      body: 'AQIDBA==',
      contentLength: 4,
      contentType: 'image/png',
      descriptor: { identifier: 'avatar', name: 'alice', service: 'THUMBNAIL' },
      encoding: 'base64',
      source: 'POINTER',
    });
    await expect(fetchAccountAvatar(ADDRESS, ['FETCH_ACCOUNT_AVATAR'])).resolves.toMatchObject({ kind: 'ready' });
    expect(qdnRequestMock).toHaveBeenCalledWith({ action: 'FETCH_ACCOUNT_AVATAR', address: ADDRESS });
  });
});
