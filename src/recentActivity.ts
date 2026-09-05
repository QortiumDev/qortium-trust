import { fetchNodeApiData, getTrustDerivationPage, getTrustProfile } from './trustApi';
import { t } from './i18n';
import type { AccountRatingCategory, TrustDerivation } from './types';

export type RecentActivity = Record<string, { timestamp: number; signature: string; publicKey: string }>;
type DirectoryPage = Awaited<ReturnType<typeof getTrustDerivationPage>>;

// Re-read a growing prefix, rather than stitching offset pages whose timestamp ties have
// no stable server ordering. A short response proves exhaustion; hitting a cap never does.
export async function readRecentActivity(height: number): Promise<RecentActivity> {
  if (!Number.isSafeInteger(height) || height < 1) throw new Error('Missing chain height');
  for (const limit of [1000, 4000, 8000]) {
    const rows = await fetchNodeApiData<unknown>(
      `/transactions/search?txType=RATE_ACCOUNT&confirmationStatus=CONFIRMED&reverse=true&startBlock=1&blockLimit=${height}&limit=${limit}&offset=0`,
      t('fetch.accountRatings'),
    );
    if (!Array.isArray(rows) || rows.length > limit) throw new Error('Invalid rating history');
    if (rows.length === limit) continue;
    const result: RecentActivity = Object.create(null);
    const signatures = new Set<string>();
    for (const row of rows) {
      if (!row || row.type !== 'RATE_ACCOUNT' || !Number.isSafeInteger(row.timestamp) || row.timestamp <= 0 ||
          !Number.isSafeInteger(row.blockHeight) || row.blockHeight < 1 || row.blockHeight > height ||
          typeof row.signature !== 'string' || !row.signature || signatures.has(row.signature) ||
          typeof row.raterAddress !== 'string' || !row.raterAddress ||
          typeof row.raterPublicKey !== 'string' || !row.raterPublicKey ||
          !Number.isInteger(row.rating) || row.rating < -4 || row.rating > 4 ||
          !['SUBJECT', 'PLAYER', 'TRAINER', 'MANAGER'].includes(row.category) ||
          !['NOT_REQUIRED', 'APPROVED', 'PENDING', 'REJECTED', 'EXPIRED', 'INVALID'].includes(row.approvalStatus)) {
        throw new Error('Invalid rating history entry');
      }
      signatures.add(row.signature);
      if (!['NOT_REQUIRED', 'APPROVED'].includes(row.approvalStatus)) continue;
      const previous = result[row.raterAddress];
      if (!previous || row.timestamp > previous.timestamp ||
          (row.timestamp === previous.timestamp && row.signature > previous.signature)) {
        // Timestamp is the transaction's submission time, not its confirmation time.
        // Rating 0 is deliberately included: removing a rating is outgoing activity too.
        result[row.raterAddress] = { timestamp: row.timestamp, signature: row.signature, publicKey: row.raterPublicKey };
      }
    }
    return result;
  }
  throw new Error('Rating history exceeds scan budget');
}

export async function loadRecentDirectory(height: number, initial: DirectoryPage, initialLimit: number, category: AccountRatingCategory) {
  const blockPath = `/blocks/byheight/${height}`;
  const before = await fetchNodeApiData<{ signature: string }>(blockPath, t('fetch.nodeStatus'));
  if (!before?.signature) throw new Error('Missing snapshot block');
  const activity = await readRecentActivity(height);
  let page = initial;
  let complete = page.total !== null ? page.derivations.length === page.total : page.derivations.length < initialLimit;
  if (!complete) {
    page = await getTrustDerivationPage({ category, live: true, limit: 5000 });
    complete = page.total !== null ? page.derivations.length === page.total : page.derivations.length < 5000;
  }
  if (!complete) throw new Error('Account directory exceeds scan budget');
  const derivations = [...page.derivations];
  const known = new Set(derivations.map(row => row.accountAddress));
  const missing = Object.keys(activity).filter(address => !known.has(address));
  if (missing.length > 32) throw new Error('Historical account lookup exceeds budget');
  // A person who clears their last edge is still discoverable. Use their real profile;
  // never invent an Unverified status to make an incomplete directory appear complete.
  for (const address of missing) {
    const profile = await getTrustProfile(activity[address].publicKey);
    if (profile.targetAddress !== address || !Array.isArray(profile.categories)) throw new Error('Invalid historical account profile');
    derivations.push({
      accountAddress: profile.targetAddress,
      accountPublicKey: profile.targetPublicKey,
      derivedTrustStatus: profile.trustStatus,
      derivedTrustStatusValue: profile.trustStatusValue,
      derivedTrustWeightPercent: profile.trustWeightPercent,
      mintingSeedMember: profile.mintingSeedMember,
      blocksMinted: profile.blocksMinted,
      effectiveVoteWeight: profile.effectiveVoteWeight,
      categories: profile.categories,
    } satisfies TrustDerivation);
  }
  const after = await fetchNodeApiData<{ signature: string }>(blockPath, t('fetch.nodeStatus'));
  if (before.signature !== after?.signature) throw new Error('Chain changed during activity read');
  return { activity, derivations, total: derivations.length };
}
