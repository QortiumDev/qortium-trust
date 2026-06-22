import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildAccountRatingsPath,
  buildRatingCooldownPath,
  buildResourceRatingsPath,
  buildTrustChangesPath,
  buildTrustDerivationPath,
  submitRating,
} from './trustApi';
import { hasHomeBridge, qdnRequest } from './qdnRequest';

vi.mock('./qdnRequest', () => ({
  hasHomeBridge: vi.fn(),
  qdnRequest: vi.fn(),
}));

describe('trust API path builders', () => {
  it('builds trust derivation query paths with defaults', () => {
    expect(buildTrustDerivationPath({ category: 'SUBJECT' })).toBe(
      '/account-ratings/trust-derivation?category=SUBJECT&limit=250',
    );
  });

  it('includes filters only when present', () => {
    expect(
      buildTrustDerivationPath({
        category: 'PLAYER',
        live: true,
        minLevel: 2,
        reverse: true,
        seedMember: false,
        status: 'SILVER',
      }),
    ).toBe(
      '/account-ratings/trust-derivation?category=PLAYER&limit=250&live=true&minLevel=2&reverse=true&seedMember=false&status=SILVER',
    );
  });

  it('encodes rating edge filters', () => {
    expect(
      buildAccountRatingsPath({
        category: 'MANAGER',
        limit: 10,
        rater: 'A/B',
        target: 'C D',
      }),
    ).toBe('/account-ratings?category=MANAGER&limit=10&rater=A%2FB&target=C+D');
  });

  it('builds change and resource rating paths', () => {
    expect(buildTrustChangesPath({ category: 'TRAINER', limit: 5, newStatus: 'GOLD' })).toBe(
      '/account-ratings/trust-changes?category=TRAINER&limit=5&newStatus=GOLD',
    );
    expect(buildResourceRatingsPath({ service: 'APP', name: 'Trust', identifier: 'Trust' })).toBe(
      '/resource-ratings?identifier=Trust&limit=25&name=Trust&service=APP',
    );
  });

  it('builds rating cooldown paths with raw wire category values', () => {
    expect(buildRatingCooldownPath({ target: 'tPub', rater: 'rPub', category: 'MANAGER' })).toBe(
      '/account-ratings/cooldown?target=tPub&rater=rPub&category=MANAGER',
    );
    expect(buildRatingCooldownPath({ target: 'tPub', rater: 'rPub' })).toBe(
      '/account-ratings/cooldown?target=tPub&rater=rPub',
    );
  });
});

describe('submitRating bridge requirement', () => {
  const hasHomeBridgeMock = vi.mocked(hasHomeBridge);
  const qdnRequestMock = vi.mocked(qdnRequest);

  beforeEach(() => {
    hasHomeBridgeMock.mockReset();
    qdnRequestMock.mockReset();
  });

  it('throws when the Home bridge is absent', async () => {
    hasHomeBridgeMock.mockReturnValue(false);

    await expect(submitRating({ category: 'SUBJECT', rating: 1, targetPublicKey: 'tPub' })).rejects.toThrow(
      'Submitting ratings requires Qortium Home.',
    );
    expect(qdnRequestMock).not.toHaveBeenCalled();
  });

  it('routes a RATE_ACCOUNT request through the bridge when present', async () => {
    hasHomeBridgeMock.mockReturnValue(true);
    qdnRequestMock.mockResolvedValue({ signature: 'sig' } as never);

    await expect(submitRating({ category: 'SUBJECT', rating: 1, targetPublicKey: 'tPub' })).resolves.toEqual({
      signature: 'sig',
    });
    expect(qdnRequestMock).toHaveBeenCalledWith({
      action: 'RATE_ACCOUNT',
      category: 'SUBJECT',
      rating: 1,
      targetPublicKey: 'tPub',
    });
  });
});
