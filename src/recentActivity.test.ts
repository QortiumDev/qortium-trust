import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadRecentDirectory, readRecentActivity } from './recentActivity';
import { fetchNodeApiData, getTrustDerivationPage } from './trustApi';

vi.mock('./trustApi', () => ({ fetchNodeApiData: vi.fn(), getTrustDerivationPage: vi.fn(), getTrustProfile: vi.fn() }));
const read = vi.mocked(fetchNodeApiData);
const tx = (overrides: Record<string, unknown> = {}) => ({
  type: 'RATE_ACCOUNT', timestamp: 100, blockHeight: 5, signature: 'one',
  raterAddress: 'Qrater', raterPublicKey: 'raterKey', category: 'SUBJECT', rating: 4,
  approvalStatus: 'NOT_REQUIRED', ...overrides,
});
beforeEach(() => vi.resetAllMocks());

describe('complete confirmed outgoing activity', () => {
  it('includes clears and other roles once per rater, with deterministic submission-time ties', async () => {
    read.mockResolvedValue([
      tx(), tx({ signature: 'two', timestamp: 200, rating: 0 }),
      tx({ signature: 'three', timestamp: 200, category: 'MANAGER' }),
      tx({ signature: 'pending', timestamp: 300, approvalStatus: 'PENDING' }),
      tx({ signature: 'other', raterAddress: 'Qother', timestamp: 400 }),
    ]);
    const activity = await readRecentActivity(10);
    expect(Object.keys(activity)).toHaveLength(2);
    expect(activity.Qrater).toMatchObject({ timestamp: 200, signature: 'two' });
    expect(activity.Qother.timestamp).toBe(400);
    expect(read.mock.calls[0][0]).toContain('startBlock=1&blockLimit=10&limit=1000&offset=0');
  });

  it('re-reads an expanded prefix until exhausted instead of joining unstable offset pages', async () => {
    read.mockResolvedValueOnce(Array(1000).fill(null)).mockResolvedValueOnce([tx()]);
    expect(Object.keys(await readRecentActivity(10))).toEqual(['Qrater']);
    expect(read.mock.calls[1][0]).toContain('limit=4000&offset=0');
  });

  it('does not certify a capped, duplicate, malformed or out-of-snapshot result', async () => {
    read.mockResolvedValueOnce(Array(1000)).mockResolvedValueOnce(Array(4000)).mockResolvedValueOnce(Array(8000));
    await expect(readRecentActivity(10)).rejects.toThrow('budget');
    read.mockResolvedValue([tx(), tx()]);
    await expect(readRecentActivity(10)).rejects.toThrow('Invalid');
    read.mockResolvedValue([tx({ blockHeight: 11 })]);
    await expect(readRecentActivity(10)).rejects.toThrow('Invalid');
    read.mockResolvedValue({ error: 'unavailable' });
    await expect(readRecentActivity(10)).rejects.toThrow('Invalid');
  });

  it('accepts an exhausted empty history, but rejects a changed snapshot', async () => {
    read.mockResolvedValueOnce({ signature: 'A' }).mockResolvedValueOnce([]).mockResolvedValueOnce({ signature: 'B' });
    await expect(loadRecentDirectory(10, { derivations: [], total: 0 }, 250, 'SUBJECT')).rejects.toThrow('Chain changed');
    read.mockResolvedValueOnce({ signature: 'A' }).mockResolvedValueOnce([]).mockResolvedValueOnce({ signature: 'A' });
    expect(await loadRecentDirectory(10, { derivations: [], total: 0 }, 250, 'SUBJECT')).toEqual({ activity: {}, derivations: [], total: 0 });
  });

  it('keeps current members without activity and does not restore historical non-members', async () => {
    read.mockResolvedValueOnce({ signature: 'A' }).mockResolvedValueOnce([tx({ rating: 0 })]).mockResolvedValueOnce({ signature: 'A' });
    const member = {
      accountAddress: 'Qmember', accountPublicKey: 'memberKey', derivedTrustStatus: 'UNVERIFIED' as const,
      derivedTrustStatusValue: 0, derivedTrustWeightPercent: 0, mintingSeedMember: true, categories: [],
    };
    const result = await loadRecentDirectory(10, { derivations: [member], total: 1 }, 250, 'SUBJECT');
    expect(result.derivations).toEqual([member]);
    expect(result.activity.Qrater).toBeTruthy();
    expect(result.total).toBe(1);
  });

  it('refuses global recency when the people listing is still incomplete', async () => {
    read.mockResolvedValueOnce({ signature: 'A' }).mockResolvedValueOnce([]);
    vi.mocked(getTrustDerivationPage).mockResolvedValue({ derivations: [], total: 6000 });
    await expect(loadRecentDirectory(10, { derivations: [], total: 6000 }, 250, 'SUBJECT')).rejects.toThrow('Account directory');
    expect(getTrustDerivationPage).toHaveBeenCalledWith(expect.objectContaining({ live: true, seedMember: true, limit: 5000 }));
  });
});
