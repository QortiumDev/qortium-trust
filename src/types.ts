export type TrustStatus = 'SUSPICIOUS' | 'UNVERIFIED' | 'BRONZE' | 'SILVER' | 'GOLD';

export type AccountRatingCategory = 'SUBJECT' | 'PLAYER' | 'TRAINER' | 'MANAGER';

export type QdnAction =
  | 'FETCH_NODE_API'
  | 'GET_NODE_STATUS'
  | 'IS_USING_PUBLIC_NODE'
  | 'SHOW_ACTIONS'
  | 'WHICH_UI'
  | 'GET_SELECTED_ACCOUNT'
  | 'GET_ACCOUNT_DATA'
  | 'RATE_ACCOUNT'
  | string;

export type BridgeState = {
  actions: QdnAction[];
  isHomeBridge: boolean;
  ui: string;
};

export type NameSummary = {
  name?: string | null;
  owner?: string;
};

export type IdentityProfile = {
  address: string;
  avatarSrc: string | null;
  name: string | null;
};

export type IdentityProfilesByAddress = Record<string, IdentityProfile>;

export type NodeApiFetchResult<T = unknown> = {
  body: string;
  contentLength?: number;
  contentType: string;
  data: T;
  headers?: Record<string, string>;
  ok: boolean;
  status: number;
  statusText: string;
};

export type NodeStatus = {
  height?: number;
  isSynchronizing?: boolean;
  syncPercent?: number;
  syncPhase?: string;
  numberOfConnections?: number;
};

export type AccountData = {
  address: string;
  publicKey?: string | null;
  defaultGroupId?: number;
  level?: number;
  blocksMinted: number;
  trustStatus?: TrustStatus;
  trustStatusValue?: number;
  trustWeightPercent?: number;
  trustAllowsMinting?: boolean;
  effectiveVoteWeight?: number;
  trustSnapshotHeight?: number | null;
  trustSnapshotTimestamp?: number | null;
};

export type RatingCounts = {
  positiveLowCount: number;
  positiveMediumCount: number;
  positiveHighCount: number;
  positiveVeryHighCount: number;
  negativeLowCount: number;
  negativeMediumCount: number;
  negativeHighCount: number;
  negativeVeryHighCount: number;
  positiveRatingCount: number;
  negativeRatingCount: number;
  totalRatingCount: number;
};

export type TrustSummaryStatus = {
  status: TrustStatus;
  statusValue: number;
  voteWeightPercent: number;
  trustAllowsMinting: boolean;
  accountCount: number;
  seedMemberCount: number;
  rawVoteWeight: number;
  effectiveVoteWeight: number;
};

export type TrustSummaryCategory = {
  category: AccountRatingCategory;
  statusCounts: {
    status: TrustStatus;
    statusValue: number;
    accountCount: number;
  }[];
};

export type RatingCategorySummary = {
  category: AccountRatingCategory;
  ratingCount: number;
  positiveRatingCount: number;
  negativeRatingCount: number;
};

export type TrustSummary = {
  activeWeightCategory: AccountRatingCategory;
  snapshotHeight: number | null;
  snapshotTimestamp: number | null;
  snapshotAccountCount: number;
  snapshotRowCount: number;
  expectedSnapshotRowCount: number;
  snapshotsComplete: boolean;
  activeRatingCount: number;
  trustStatusChangeCount: number;
  latestTrustChangeHeight?: number | null;
  latestTrustChangeTimestamp?: number | null;
  activeSnapshotAccountCount: number;
  activeSeedMemberCount: number;
  activeMintingAllowedCount: number;
  suspiciousCount: number;
  rawVoteWeight: number;
  effectiveVoteWeight: number;
  statusSummaries: TrustSummaryStatus[];
  categorySummaries: TrustSummaryCategory[];
  ratingCategorySummaries: RatingCategorySummary[];
};

export type TrustCategory = {
  category: AccountRatingCategory;
  score: number;
  levelScore: number;
  levelScoreCap: number;
  level: number;
  mappedTrustStatus: TrustStatus;
  mappedTrustStatusValue: number;
  mappedTrustWeightPercent?: number;
  inboundRatings: RatingCounts;
  impacts?: TrustImpact[];
};

export type TrustDerivation = {
  accountPublicKey: string;
  accountAddress: string;
  derivedTrustStatus: TrustStatus;
  derivedTrustStatusValue: number;
  derivedTrustWeightPercent: number;
  mintingSeedMember: boolean;
  snapshotHeight: number | null;
  snapshotTimestamp: number | null;
  live: boolean;
  categories: TrustCategory[];
};

export type AccountRating = {
  targetPublicKey: string;
  targetAddress: string;
  raterPublicKey: string;
  raterAddress: string;
  category: AccountRatingCategory;
  rating: number;
  ratingDirection: 'POSITIVE' | 'NEGATIVE' | 'NONE' | string;
  ratingConfidence: number;
};

export type TrustStatusChange = {
  accountPublicKey: string;
  accountAddress: string;
  category: AccountRatingCategory;
  previousLevel: number;
  newLevel: number;
  previousTrustStatus: TrustStatus;
  newTrustStatus: TrustStatus;
  previousScore: number;
  newScore: number;
  previousSnapshotHeight: number;
  snapshotHeight: number;
  snapshotTimestamp: number;
};

export type TrustPolicy = {
  activeWeightCategory: AccountRatingCategory;
  startingEnergy: number;
  managerEnergyHops: number;
  positiveMinBranchCount: number;
  suspiciousMinRaterCount: number;
  suspiciousMinBranchCount: number;
  suspiciousMinRatingConfidence: number;
  accountRatingChangeCooldownBlocks: number;
  statusVoteWeights: {
    status: TrustStatus;
    voteWeightPercent: number;
  }[];
  categoryPolicies: {
    category: AccountRatingCategory;
    levels: {
      level: number;
      mappedStatus: TrustStatus;
      voteWeightPercent: number;
      threshold: number;
      scoreCap: number;
    }[];
    suspiciousThreshold: number;
    suspiciousLevelScoreCap: number;
  }[];
};

export type AccountTrustProfile = {
  targetPublicKey: string;
  targetAddress: string;
  trustStatus: TrustStatus;
  trustStatusValue: number;
  trustWeightPercent: number;
  trustAllowsMinting: boolean;
  blocksMinted: number;
  effectiveVoteWeight: number;
  activeWeightCategory: AccountRatingCategory;
  mintingSeedMember: boolean;
  snapshotHeight: number | null;
  snapshotTimestamp: number | null;
  categories: {
    category: AccountRatingCategory;
    score: number;
    levelScore: number;
    levelScoreCap: number;
    level: number;
    mappedTrustStatus: TrustStatus;
    mappedTrustStatusValue: number;
    mappedTrustWeightPercent: number;
    inboundRatings: RatingCounts;
    outboundRatings: RatingCounts;
    snapshotHeight: number | null;
    snapshotTimestamp: number | null;
  }[];
};

export type TrustImpact = {
  raterPublicKey: string;
  raterAddress: string;
  category: AccountRatingCategory;
  rating: number;
  ratingConfidence: number;
  evaluatorLevel: number;
  evaluatorScore: number;
  impact: number;
  trustBranchKeys?: string[];
};

export type AccountTrustExplanation = {
  targetPublicKey: string;
  targetAddress: string;
  trustStatus: TrustStatus;
  trustStatusValue: number;
  trustWeightPercent: number;
  activeWeightCategory: AccountRatingCategory;
  mintingSeedMember: boolean;
  snapshotHeight: number | null;
  snapshotTimestamp: number | null;
  live: boolean;
  categories: {
    category: AccountRatingCategory;
    score: number;
    levelScore: number;
    levelScoreCap: number;
    level: number;
    mappedTrustStatus: TrustStatus;
    mappedTrustWeightPercent: number;
    topPositiveImpacts: TrustImpact[];
    topNegativeImpacts: TrustImpact[];
  }[];
};

/**
 * The logged-in Qortium Home account acting as the rater. `publicKey` is null until the
 * account has at least one on-chain transaction, in which case it cannot submit ratings yet.
 */
export type SelfAccount = {
  address: string;
  publicKey: string | null;
  name: string | null;
  isUnlocked?: boolean;
};

/** Mirrors Core `AccountRatingCooldownData` from GET /account-ratings/cooldown. */
export type AccountRatingCooldown = {
  targetPublicKey: string;
  targetAddress: string;
  raterPublicKey: string;
  raterAddress: string;
  category: AccountRatingCategory;
  activeRating: number | null;
  cooldownBlocks: number;
  latestRatingChangeHeight: number | null;
  currentHeight: number;
  candidateChangeHeight: number;
  earliestAllowedHeight: number;
  blocksRemaining: number;
  canChangeNow: boolean;
};

/** Payload the app hands to Qortium Home's RATE_ACCOUNT bridge action. */
export type RateAccountRequest = {
  targetPublicKey: string;
  category: AccountRatingCategory;
  rating: number;
};

/** Envelope Qortium Home returns after building, signing, and broadcasting the rating. */
export type RateAccountResult = {
  accepted?: boolean;
  action?: string;
  targetPublicKey?: string;
  category?: AccountRatingCategory;
  rating?: number;
  result?: unknown;
  transactionSignature?: string;
};

export type ResourceRatingSummary = {
  service: string;
  name: string;
  identifier: string;
  ratingCount: number;
  ratingTotal: number;
  rawTotalWeight: number | null;
  totalWeight: number | null;
  averageRating: number | null;
  rawWeightedAverageRating: number | null;
  weightedAverageRating: number | null;
};
