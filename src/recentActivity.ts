import { fetchNodeApiData, getTrustDerivationPage } from './trustApi';
import { t } from './i18n';
import type { AccountRatingCategory } from './types';
import { ACTIVITY_SCAN_PREFIXES, MAX_DERIVATION_LIMIT } from './trustLimits';

export type RecentActivity = Record<string, { timestamp: number; signature: string; publicKey: string }>;
type DirectoryPage = Awaited<ReturnType<typeof getTrustDerivationPage>>;

// Re-read a growing prefix, rather than stitching offset pages whose timestamp ties have
// no stable server ordering. A short response proves exhaustion; hitting a cap never does.
export async function readRecentActivity(height: number): Promise<RecentActivity> {
  if (!Number.isSafeInteger(height) || height < 1) throw new Error('Missing chain height');
  for (const limit of ACTIVITY_SCAN_PREFIXES) {
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
    page = await getTrustDerivationPage({ category, live: true, seedMember: true, limit: MAX_DERIVATION_LIMIT });
    complete = page.total !== null ? page.derivations.length === page.total : page.derivations.length < MAX_DERIVATION_LIMIT;
  }
  if (!complete) throw new Error('Account directory exceeds scan budget');
  // Live derivations already include current minting-group members even without rating
  // edges. Historical activity must never reintroduce people outside those groups.
  const derivations = page.derivations.filter(row => row.mintingSeedMember === true);
  const after = await fetchNodeApiData<{ signature: string }>(blockPath, t('fetch.nodeStatus'));
  if (before.signature !== after?.signature) throw new Error('Chain changed during activity read');
  return { activity, derivations, total: derivations.length };
}
