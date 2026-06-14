import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchAvatarImage,
  getAvatarFallbackCharacter,
  getIdentityLabel,
  loadIdentityProfile,
  normalizeRegisteredName,
} from './identityProfiles';
import { qdnRequest } from './qdnRequest';

vi.mock('./qdnRequest', () => ({
  qdnRequest: vi.fn(),
}));

describe('identity profile helpers', () => {
  const qdnRequestMock = vi.mocked(qdnRequest);

  beforeEach(() => {
    qdnRequestMock.mockReset();
  });

  it('normalizes registered names and fallback initials', () => {
    expect(normalizeRegisteredName('alice')).toBe('alice');
    expect(normalizeRegisteredName('')).toBeNull();
    expect(getAvatarFallbackCharacter('alice', 'Qabc')).toBe('a');
    expect(getAvatarFallbackCharacter('Bob', 'Qabc')).toBe('B');
    expect(getAvatarFallbackCharacter(null, 'Qabc')).toBe('?');
  });

  it('fetches avatar images from THUMBNAIL avatar resources through Home actions', async () => {
    qdnRequestMock
      .mockResolvedValueOnce({ filename: 'avatar.png', mimeType: 'image/png', size: 128 })
      .mockResolvedValueOnce('iVBORw0KGgo=');

    await expect(fetchAvatarImage('alice', ['GET_QDN_RESOURCE_PROPERTIES', 'FETCH_QDN_RESOURCE'])).resolves.toBe(
      'data:image/png;base64,iVBORw0KGgo=',
    );
    expect(qdnRequestMock).toHaveBeenNthCalledWith(1, {
      action: 'GET_QDN_RESOURCE_PROPERTIES',
      service: 'THUMBNAIL',
      name: 'alice',
      identifier: 'avatar',
      path: '',
    });
    expect(qdnRequestMock).toHaveBeenNthCalledWith(2, {
      action: 'FETCH_QDN_RESOURCE',
      service: 'THUMBNAIL',
      name: 'alice',
      identifier: 'avatar',
      path: '',
      encoding: 'base64',
      rebuild: true,
      maxBytes: 500 * 1024,
    });
  });

  it('loads the first registered name and keeps it if avatar loading fails', async () => {
    qdnRequestMock
      .mockResolvedValueOnce([{ name: null, owner: 'Qabc' }, { name: 'bob', owner: 'Qabc' }])
      .mockRejectedValueOnce(new Error('No avatar'));

    await expect(loadIdentityProfile('Qabc', ['GET_ACCOUNT_NAMES', 'GET_QDN_RESOURCE_PROPERTIES'])).resolves.toEqual({
      address: 'Qabc',
      avatarSrc: null,
      name: 'bob',
    });
  });

  it('falls back to raw address labels', () => {
    expect(getIdentityLabel(undefined, 'Qabc')).toBe('Qabc');
    expect(getIdentityLabel({ address: 'Qabc', avatarSrc: null, name: 'alice' }, 'Qabc')).toBe('alice');
  });
});
