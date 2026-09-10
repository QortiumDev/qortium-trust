// Pure data + derivations for the Developers reference (components/DevelopersReference.tsx).
// Kept separate from the component so every documented number is a plain, unit-testable function of
// the app's real implementation constants — never a hand-typed duplicate that can silently drift.
import { RATING_VALUES, PENDING_CONFIRM_POLL_MS, PENDING_CONFIRM_TIMEOUT_MS } from './ratingControl';
import { ACTIVITY_SCAN_PREFIXES, MAX_DERIVATION_LIMIT, MAX_RATINGS_SCAN, PAGE_SIZE, RATING_PAGE_SIZE } from './trustLimits';
import { LOCAL_READ_ACTIONS } from './qdnRequest';
import type { AccountRatingCategory, KnownQdnAction } from './types';

export type DeveloperReferenceSection = {
  id: string;
  title: string;
};

export const DEVELOPER_REFERENCE_SECTIONS: DeveloperReferenceSection[] = [
  { id: 'overview', title: 'Overview' },
  { id: 'endpoints', title: 'Core read endpoints' },
  { id: 'policy', title: 'Live policy & units' },
  { id: 'roles', title: 'Role mapping' },
  { id: 'ratings', title: 'Rating values' },
  { id: 'capabilities', title: 'Bridge capabilities' },
  { id: 'identity', title: 'Selected account, lock & approval' },
  { id: 'submission', title: 'Asynchronous submission' },
  { id: 'readonly', title: 'Read-only fallback' },
  { id: 'bounds', title: 'Directory & activity bounds' },
  { id: 'privacy', title: 'Data & privacy' },
];

export type DeveloperReferenceEndpoint = {
  method: 'GET';
  path: string;
  description: string;
  source: string;
};

// One row per Core endpoint used by Trust's current explorer flow, taken directly from
// trustApi.ts/recentActivity.ts. All are read-only; the reference never calls these itself.
export const DEVELOPER_REFERENCE_ENDPOINTS: DeveloperReferenceEndpoint[] = [
  { method: 'GET', path: '/admin/status', description: 'Node sync state and chain height.', source: 'getNodeStatus' },
  { method: 'GET', path: '/addresses/{address}', description: 'Account data, including its public key once it has on-chain history.', source: 'getAccountData' },
  { method: 'GET', path: '/account-ratings/trust-summary', description: 'Network-wide trust status and rating counts.', source: 'getTrustSummary' },
  { method: 'GET', path: '/account-ratings/trust-policy', description: 'The live policy this reference reads (see Live policy & units).', source: 'getTrustPolicy' },
  { method: 'GET', path: '/account-ratings/trust-derivation', description: 'Paginated per-account derived trust status by category.', source: 'getTrustDerivationPage' },
  { method: 'GET', path: '/account-ratings', description: 'Individual account ratings, filterable by rater/target/category.', source: 'getAccountRatings' },
  { method: 'GET', path: '/account-ratings/trust-changes', description: 'History of trust-status transitions.', source: 'getTrustChanges' },
  { method: 'GET', path: '/account-ratings/trust-profile', description: 'One account’s full per-category trust profile, inbound and outbound.', source: 'getTrustProfile' },
  { method: 'GET', path: '/account-ratings/trust-explanation', description: 'One account’s status with requirements and top rating impacts.', source: 'getTrustExplanation' },
  { method: 'GET', path: '/account-ratings/cooldown', description: 'Whether a given rater may currently change a rating on a target.', source: 'getRatingCooldown' },
  { method: 'GET', path: '/account-ratings/preview', description: 'Validity and trust-impact preview for a candidate rating, before signing.', source: 'getRatingPreview' },
  { method: 'GET', path: '/transactions/search', description: 'Confirmed RATE_ACCOUNT history, used to derive recent-activity order.', source: 'readRecentActivity' },
  { method: 'GET', path: '/blocks/byheight/{height}', description: 'Block signature, used to detect a chain reorg during an activity read.', source: 'readRecentActivity / loadRecentDirectory' },
];

export type RoleMapping = {
  wireCategory: AccountRatingCategory;
  publicName: string;
  evaluatorRole: string | null;
  purpose: string;
};

// The wire category -> public role-name renaming Trust's UI applies everywhere (see
// format.ts's publicizeTrustText/categoryLabel), restated here as plain data since the reference is
// always English regardless of the app's display language.
export const ROLE_MAPPINGS: RoleMapping[] = [
  {
    wireCategory: 'SUBJECT',
    publicName: 'Minter',
    evaluatorRole: 'Voter',
    purpose: 'Receives the final trust standing. A Minter rating answers one question: is this a unique minting account?',
  },
  {
    wireCategory: 'PLAYER',
    publicName: 'Voter',
    evaluatorRole: 'Guide',
    purpose: 'Rates Minters. A Voter’s Minter ratings only count once they are trusted as a Voter by Guides.',
  },
  {
    wireCategory: 'TRAINER',
    publicName: 'Guide',
    evaluatorRole: 'Designer',
    purpose: 'Rates Voters. A Guide’s Voter ratings only count once they are trusted as a Guide by Designers.',
  },
  {
    wireCategory: 'MANAGER',
    publicName: 'Designer',
    evaluatorRole: null,
    purpose:
      'Rates Guides. Designers share a limited pool of influence: every positive Designer rating splits that share, ' +
      'so it only flows onward through Designers who pass it along.',
  },
];

// Every rating value RatingControls can submit, ± confidence 1-4 and 0 for removal. Derived from
// RATING_VALUES (ratingControl.ts) rather than a hardcoded "-4 to 4", so the reference cannot drift
// from the actual allowed set.
export const RATING_VALUE_RANGE = {
  values: [...RATING_VALUES].sort((a, b) => a - b),
  min: Math.min(...RATING_VALUES),
  max: Math.max(...RATING_VALUES),
  removalValue: 0,
};

// Every action the app knows the literal name of (types.ts's KnownQdnAction). `satisfies` fails to
// compile if this list and that union type ever diverge.
export const KNOWN_QDN_ACTIONS = [
  'OPEN_NEW_TAB',
  'FETCH_NODE_API',
  'GET_NODE_STATUS',
  'IS_USING_PUBLIC_NODE',
  'SHOW_ACTIONS',
  'WHICH_UI',
  'GET_SELECTED_ACCOUNT',
  'GET_ACCOUNT_DATA',
  'GET_ACCOUNT_NAMES',
  'FETCH_ACCOUNT_AVATAR',
  'RESOLVE_IDENTITIES',
  'RATE_ACCOUNT',
] as const satisfies readonly KnownQdnAction[];

export { LOCAL_READ_ACTIONS };

export const SUBMISSION_TIMING = {
  pollIntervalMs: PENDING_CONFIRM_POLL_MS,
  timeoutMs: PENDING_CONFIRM_TIMEOUT_MS,
};

export const DIRECTORY_BOUNDS = {
  pageSize: PAGE_SIZE,
  ratingPageSize: RATING_PAGE_SIZE,
  maxDerivationLimit: MAX_DERIVATION_LIMIT,
  maxRatingsScan: MAX_RATINGS_SCAN,
  activityScanPrefixes: ACTIVITY_SCAN_PREFIXES,
};

// Renders a millisecond duration the way a developer reads it, without asserting a fixed unit
// ("3 minutes") that would silently go stale if the underlying constant ever changed to something
// not evenly divisible by a minute.
export function formatDurationMs(ms: number): string {
  if (ms % 60_000 === 0) {
    const minutes = ms / 60_000;
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }

  if (ms % 1_000 === 0) {
    const seconds = ms / 1_000;
    return `${seconds} second${seconds === 1 ? '' : 's'}`;
  }

  return `${ms} ms`;
}
