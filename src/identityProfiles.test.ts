import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchAvatarImage,
  getAvatarFallbackCharacter,
  getIdentityLabel,
  loadIdentityProfile,
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

  it('uses the first base58 address character as the fallback for unnamed accounts', () => {
    expect(getAvatarFallbackCharacter(null, 'Qabc')).toBe('Q');
    expect(getAvatarFallbackCharacter('', 'Z9foo')).toBe('Z');
    // Leading non-base58 characters (e.g. 0, O, I, l) are skipped.
    expect(getAvatarFallbackCharacter(null, '0OIlQ7')).toBe('Q');
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
});
