import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchAvatarImage,
  getAvatarFallbackCharacter,
  getIdentityLabel,
  loadIdentityProfile,
  loadIdentityProfiles,
  normalizeRegisteredName,
} from './identityProfiles';
import { hasHomeBridge, qdnRequest } from './qdnRequest';

vi.mock('./qdnRequest', () => ({
  qdnRequest: vi.fn(),
  hasHomeBridge: vi.fn(),
}));

describe('identity profile helpers', () => {
  const qdnRequestMock = vi.mocked(qdnRequest);
  const hasHomeBridgeMock = vi.mocked(hasHomeBridge);

  beforeEach(() => {
    qdnRequestMock.mockReset();
    hasHomeBridgeMock.mockReset();
    hasHomeBridgeMock.mockReturnValue(true);
  });

  it('normalizes registered names and fallback initials', () => {
    expect(normalizeRegisteredName('alice')).toBe('alice');
    expect(normalizeRegisteredName('')).toBeNull();
    expect(getAvatarFallbackCharacter('alice', 'Qabc')).toBe('a');
    expect(getAvatarFallbackCharacter('Bob', 'Qabc')).toBe('B');
  });

  it('uses a question mark as the fallback for unnamed accounts', () => {
    expect(getAvatarFallbackCharacter(null, 'Qabc')).toBe('?');
    expect(getAvatarFallbackCharacter('', 'Z9foo')).toBe('?');
    expect(getAvatarFallbackCharacter(null, '')).toBe('?');
  });

  it('resolves avatar render URLs through the GET_QDN_RESOURCE_URL bridge action', async () => {
    qdnRequestMock.mockResolvedValueOnce('http://127.0.0.1:24891/render/THUMBNAIL/alice/avatar');

    await expect(fetchAvatarImage('alice', ['GET_QDN_RESOURCE_URL'])).resolves.toBe(
      'http://127.0.0.1:24891/render/THUMBNAIL/alice/avatar',
    );
    expect(qdnRequestMock).toHaveBeenCalledWith({
      action: 'GET_QDN_RESOURCE_URL',
      service: 'THUMBNAIL',
      name: 'alice',
      identifier: 'avatar',
    });
  });

  it('throws when the bridge returns no render URL', async () => {
    qdnRequestMock.mockResolvedValueOnce('');

    await expect(fetchAvatarImage('alice', ['GET_QDN_RESOURCE_URL'])).rejects.toThrow(/render URL/);
  });

  it('loads the first registered name and keeps it if avatar resolution fails', async () => {
    qdnRequestMock
      .mockResolvedValueOnce([
        { name: null, owner: 'Qabc' },
        { name: 'bob', owner: 'Qabc' },
      ])
      .mockRejectedValueOnce(new Error('No avatar'));

    await expect(
      loadIdentityProfile('Qabc', ['GET_ACCOUNT_NAMES', 'GET_QDN_RESOURCE_URL']),
    ).resolves.toEqual({
      address: 'Qabc',
      avatarSrc: null,
      name: 'bob',
    });
  });

  it('resolves to a nameless record when the name lookup itself fails', async () => {
    qdnRequestMock.mockRejectedValueOnce(new Error('names endpoint down'));

    await expect(loadIdentityProfile('Qdead', ['GET_ACCOUNT_NAMES'])).resolves.toEqual({
      address: 'Qdead',
      avatarSrc: null,
      name: null,
    });
  });

  it('sets the bridge render URL straight onto the resolved profile', async () => {
    qdnRequestMock
      .mockResolvedValueOnce([{ name: 'alice', owner: 'Qalice' }])
      .mockResolvedValueOnce('http://127.0.0.1:24891/render/THUMBNAIL/alice/avatar');

    await expect(
      loadIdentityProfile('Qalice', ['GET_ACCOUNT_NAMES', 'GET_QDN_RESOURCE_URL']),
    ).resolves.toEqual({
      address: 'Qalice',
      avatarSrc: 'http://127.0.0.1:24891/render/THUMBNAIL/alice/avatar',
      name: 'alice',
    });
  });

  it('falls back to raw address labels', () => {
    expect(getIdentityLabel(undefined, 'Qabc')).toBe('Qabc');
    expect(getIdentityLabel({ address: 'Qabc', avatarSrc: null, name: 'alice' }, 'Qabc')).toBe('alice');
  });

  describe('loadIdentityProfiles', () => {
    it('resolves the whole set in one RESOLVE_IDENTITIES call when the action is advertised', async () => {
      qdnRequestMock.mockResolvedValueOnce([
        { address: 'Qalice', name: 'alice', avatarSrc: 'http://node/THUMBNAIL/alice/avatar' },
        { address: 'Qbob', name: null, avatarSrc: null },
      ]);

      await expect(loadIdentityProfiles(['Qalice', 'Qbob'], ['RESOLVE_IDENTITIES'])).resolves.toEqual([
        { address: 'Qalice', avatarSrc: 'http://node/THUMBNAIL/alice/avatar', name: 'alice' },
        { address: 'Qbob', avatarSrc: null, name: null },
      ]);
      expect(qdnRequestMock).toHaveBeenCalledTimes(1);
      expect(qdnRequestMock).toHaveBeenCalledWith({ action: 'RESOLVE_IDENTITIES', addresses: ['Qalice', 'Qbob'] });
    });

    it('drops the avatar URL for an entry the bridge returns without a name', async () => {
      qdnRequestMock.mockResolvedValueOnce([{ address: 'Qx', name: null, avatarSrc: 'http://node/THUMBNAIL/x/avatar' }]);

      await expect(loadIdentityProfiles(['Qx'], ['RESOLVE_IDENTITIES'])).resolves.toEqual([
        { address: 'Qx', avatarSrc: null, name: null },
      ]);
    });

    it('emits a nameless record for addresses missing from the batch response', async () => {
      qdnRequestMock.mockResolvedValueOnce([{ address: 'Qalice', name: 'alice', avatarSrc: null }]);

      await expect(loadIdentityProfiles(['Qalice', 'Qghost'], ['RESOLVE_IDENTITIES'])).resolves.toEqual([
        { address: 'Qalice', avatarSrc: null, name: 'alice' },
        { address: 'Qghost', avatarSrc: null, name: null },
      ]);
    });

    it('falls back to per-address resolution when RESOLVE_IDENTITIES is not advertised', async () => {
      // No batch action → per-address path: GET_ACCOUNT_NAMES then (named) avatar resolution.
      qdnRequestMock
        .mockResolvedValueOnce([{ name: 'alice', owner: 'Qalice' }])
        .mockResolvedValueOnce('http://node/render/THUMBNAIL/alice/avatar');

      await expect(loadIdentityProfiles(['Qalice'], ['GET_ACCOUNT_NAMES', 'GET_QDN_RESOURCE_URL'])).resolves.toEqual([
        { address: 'Qalice', avatarSrc: 'http://node/render/THUMBNAIL/alice/avatar', name: 'alice' },
      ]);
      expect(qdnRequestMock).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RESOLVE_IDENTITIES' }),
      );
    });

    it('falls back to per-address resolution when the batch call throws', async () => {
      qdnRequestMock
        .mockRejectedValueOnce(new Error('batch unavailable'))
        .mockResolvedValueOnce([{ name: 'bob', owner: 'Qbob' }])
        .mockRejectedValueOnce(new Error('no avatar'));

      await expect(loadIdentityProfiles(['Qbob'], ['RESOLVE_IDENTITIES', 'GET_ACCOUNT_NAMES'])).resolves.toEqual([
        { address: 'Qbob', avatarSrc: null, name: 'bob' },
      ]);
    });

    it('returns an empty array without any bridge call for no addresses', async () => {
      await expect(loadIdentityProfiles([], ['RESOLVE_IDENTITIES'])).resolves.toEqual([]);
      expect(qdnRequestMock).not.toHaveBeenCalled();
    });
  });
});
