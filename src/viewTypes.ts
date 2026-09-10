import type {
  AccountRating,
  AccountRatingCategory,
  BridgeState,
  IdentityProfile,
  NodeStatus,
  TrustDerivation,
  TrustPolicy,
  TrustStatusChange,
  TrustSummary,
  AccountTrustExplanation,
  AccountTrustProfile,
} from './types';

export type ViewMode = 'accounts' | 'changes' | 'developers';

export type AccountSortKey =
  | 'latestRating'
  | 'account'
  | 'status'
  | 'level'
  | 'blocksMinted'
  | 'score'
  | 'ratings'
  | 'youRated'
  | 'voteWeight'
  | 'seed';

export type SortDirection = 'asc' | 'desc';

export type AccountSortEntry = {
  direction: SortDirection;
  key: AccountSortKey;
};

// Ordered by priority, front = primary. Clicking a column promotes it to the front and keeps the
// previous columns as tiebreakers, so users can stack their own sort (e.g. name, then rating).
export type AccountSortState = AccountSortEntry[];

export type RatingsByAddress = Record<string, number>;

/**
 * Cross-category rating values keyed by pendingRatingKey's `${category}:${targetAddress}` format.
 */
export type RatingValuesByAccountCategory = Record<string, number>;

// Same key format as RatingValuesByAccountCategory; a value may be a full pending-rating entry
// (so its optimistic rating can be read alongside its confirmation/timeout state) or a bare
// number for callers that only need the rating itself.
export type PendingValueByAccountCategory = Record<string, number | PendingRatingEntry>;

export type ExplorerState = {
  bridge: BridgeState | null;
  changes: TrustStatusChange[];
  derivations: TrustDerivation[];
  nodeStatus: NodeStatus | null;
  policy: TrustPolicy | null;
  ratings: AccountRating[];
  summary: TrustSummary | null;
};

export type IdentityProps = {
  address: string;
  profile?: IdentityProfile;
};

export type AccountDetailState = {
  explanation: AccountTrustExplanation | null;
  loading: boolean;
  profile: AccountTrustProfile | null;
  publicKey: string | null;
};

// A rating awaiting submission or confirmation, tracked at app level so queued jobs and accepted
// broadcasts retain per-account spinners without blocking browsing or drafting other ratings.
// `submittedAt` resets after the broadcast response and only then anchors the confirmation timeout;
// `timedOut` flips once that timeout elapses
// without confirmation, so the entry stays visible (with Retry/Dismiss) instead of polling forever.
export type PendingRatingEntry = {
  // Submitting includes Home approval and broadcast; confirmation polling starts afterward.
  submitting?: boolean;
  confirmationUnknown?: boolean;
  category: AccountRatingCategory;
  rating: number;
  raterPublicKey: string;
  submittedAt: number;
  targetAddress: string;
  targetPublicKey: string;
  timedOut?: boolean;
};

export type PendingRatingsByKey = Record<string, PendingRatingEntry>;
