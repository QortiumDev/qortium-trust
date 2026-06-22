import type {
  AccountData,
  AccountRating,
  AccountRatingCategory,
  BridgeState,
  IdentityProfile,
  NodeStatus,
  ResourceRatingSummary,
  TrustDerivation,
  TrustPolicy,
  TrustStatusChange,
  TrustSummary,
  AccountTrustExplanation,
  AccountTrustProfile,
} from './types';

export type ViewMode = 'accounts' | 'graph' | 'changes' | 'resources';

export type AccountSortKey =
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

export type AccountDataByAddress = Record<string, AccountData>;
export type RatingsByAddress = Record<string, number>;

export type ExplorerState = {
  bridge: BridgeState | null;
  changes: TrustStatusChange[];
  derivations: TrustDerivation[];
  nodeStatus: NodeStatus | null;
  policy: TrustPolicy | null;
  ratings: AccountRating[];
  resources: ResourceRatingSummary[];
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

// A submitted-but-unconfirmed rating, tracked at the app level so several can be in flight at once
// and the "You rated" column can show a per-account spinner without blocking new submissions.
export type PendingRatingEntry = {
  category: AccountRatingCategory;
  rating: number;
  raterPublicKey: string;
  targetAddress: string;
  targetPublicKey: string;
};

export type PendingRatingsByKey = Record<string, PendingRatingEntry>;
