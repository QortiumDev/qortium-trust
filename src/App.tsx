import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  ArrowDown,
  ArrowDownUp,
  ArrowLeft,
  ArrowUp,
  CircleDot,
  Layers,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import trustIconUrl from './assets/qortium-trust-protoicon-black-transparent.png';
import { createTrustGraphModel, filterDerivations, type TrustGraphModel, type TrustGraphNode } from './graphModel';
import {
  getAvatarFallbackCharacter,
  getIdentityLabel,
  loadIdentityProfile,
} from './identityProfiles';
import { getBridgeState } from './qdnRequest';
import {
  ensureAccountUnlocked,
  getAccountData,
  getAccountRatings,
  getNodeStatus,
  getRatingCooldown,
  getResourceRatings,
  getTrustChanges,
  getTrustDerivation,
  getTrustExplanation,
  getTrustPolicy,
  getTrustProfile,
  getTrustSummary,
  resolveSelfAccount,
  submitRating,
} from './trustApi';
import {
  applyDisplaySettings,
  getDisplaySettingsUpdateFromMessage,
  getInitialDisplaySettings,
} from './displaySettings';
import {
  categoryDescription,
  categoryLabel,
  compactAddress,
  formatDate,
  formatNumber,
  formatPercent,
  ratingTone,
  statusLabel,
  statusTone,
  TRUST_CATEGORIES,
  TRUST_STATUSES,
} from './format';
import type {
  AccountData,
  AccountRating,
  AccountRatingCategory,
  AccountRatingCooldown,
  AccountTrustExplanation,
  AccountTrustProfile,
  BridgeState,
  IdentityProfile,
  IdentityProfilesByAddress,
  NodeStatus,
  ResourceRatingSummary,
  SelfAccount,
  TrustDerivation,
  TrustPolicy,
  TrustStatus,
  TrustStatusChange,
  TrustSummary,
} from './types';

type QdnRenderWindow = Window &
  typeof globalThis & {
    _qdnContext?: unknown;
    _qdnIdentifier?: unknown;
  };

type ViewMode = 'accounts' | 'graph' | 'changes' | 'resources';
type AccountSortKey =
  | 'account'
  | 'status'
  | 'level'
  | 'blocksMinted'
  | 'score'
  | 'ratings'
  | 'youRated'
  | 'voteWeight'
  | 'seed';
type SortDirection = 'asc' | 'desc';
type AccountSortEntry = {
  direction: SortDirection;
  key: AccountSortKey;
};
// Ordered by priority, front = primary. Clicking a column promotes it to the front and keeps the
// previous columns as tiebreakers, so users can stack their own sort (e.g. name, then rating).
type AccountSortState = AccountSortEntry[];
type AccountDataByAddress = Record<string, AccountData>;
type RatingsByAddress = Record<string, number>;

// Default view: the accounts you have rated highest first, then most blocks minted.
const DEFAULT_ACCOUNT_SORT: AccountSortState = [
  { direction: 'desc', key: 'youRated' },
  { direction: 'desc', key: 'blocksMinted' },
];
// Sentinel below the -4..+4 rating range so accounts you have not rated sort to the bottom.
const UNRATED_SORT_VALUE = -5;

type ExplorerState = {
  bridge: BridgeState | null;
  changes: TrustStatusChange[];
  derivations: TrustDerivation[];
  nodeStatus: NodeStatus | null;
  policy: TrustPolicy | null;
  ratings: AccountRating[];
  resources: ResourceRatingSummary[];
  summary: TrustSummary | null;
};

type IdentityProps = {
  address: string;
  profile?: IdentityProfile;
};

type AccountDetailState = {
  explanation: AccountTrustExplanation | null;
  loading: boolean;
  profile: AccountTrustProfile | null;
  publicKey: string | null;
};

const EMPTY_EXPLORER_STATE: ExplorerState = {
  bridge: null,
  changes: [],
  derivations: [],
  nodeStatus: null,
  policy: null,
  ratings: [],
  resources: [],
  summary: null,
};

function getQdnAssetUrl(assetUrl: string) {
  if (typeof window === 'undefined') {
    return assetUrl;
  }

  const qdnWindow = window as QdnRenderWindow;

  if (qdnWindow._qdnContext !== 'render' && !window.location.pathname.includes('/render/')) {
    return assetUrl;
  }

  const identifier =
    new URLSearchParams(window.location.search).get('identifier') ??
    (typeof qdnWindow._qdnIdentifier === 'string' ? qdnWindow._qdnIdentifier : '');

  if (!identifier) {
    return assetUrl;
  }

  const url = new URL(assetUrl, window.location.href);

  if (!url.searchParams.has('identifier')) {
    url.searchParams.set('identifier', identifier);
  }

  return url.toString();
}

function IdentityAvatar({ address, profile, size = 'normal' }: IdentityProps & { size?: 'small' | 'normal' | 'large' }) {
  const label = getIdentityLabel(profile, address);

  if (profile?.avatarSrc) {
    return <img alt="" className={`identity-avatar identity-avatar-${size}`} src={profile.avatarSrc} title={label} />;
  }

  return (
    <span aria-hidden="true" className={`identity-avatar identity-avatar-${size} identity-avatar-fallback`}>
      {getAvatarFallbackCharacter(profile?.name, address)}
    </span>
  );
}

function IdentityLabel({ address, profile }: IdentityProps) {
  const label = getIdentityLabel(profile, address);

  return (
    <span className="identity-label">
      <span className="identity-name">{label}</span>
      {label !== address ? <span className="mono identity-address">{compactAddress(address, 10, 7)}</span> : null}
    </span>
  );
}

function compactIdentityGraphLabel(profile: IdentityProfile | undefined, address: string) {
  const label = getIdentityLabel(profile, address);

  if (label === address) {
    return compactAddress(address, 5, 4);
  }

  return label.length > 14 ? `${label.slice(0, 13)}...` : label;
}

function StatusBadge({ status }: { status: TrustStatus }) {
  return <span className={`badge badge-${statusTone(status)}`}>{statusLabel(status)}</span>;
}

function NodeSyncPill({ nodeStatus }: { nodeStatus: NodeStatus | null }) {
  const synced = !!nodeStatus && !nodeStatus.isSynchronizing;
  const label = !nodeStatus
    ? 'Connecting'
    : nodeStatus.isSynchronizing
      ? `Syncing ${formatPercent(nodeStatus.syncPercent)}`
      : 'Synced';
  const title =
    nodeStatus?.height !== undefined ? `Block height ${formatNumber(nodeStatus.height)}` : 'Node status';

  return (
    <span className={`node-pill ${synced ? 'node-pill--ok' : 'node-pill--busy'}`} title={title}>
      <span aria-hidden="true" className="node-pill__dot" />
      {label}
    </span>
  );
}

function getDefaultAccountSortDirection(key: AccountSortKey): SortDirection {
  return key === 'account' ? 'asc' : 'desc';
}

// The trust category (Minters/Voters/Guides/Designers) selector. A segmented tab switcher so the
// four roles are visible at a glance; the per-role description renders alongside it in the toolbar.
function CategoryTabs({
  category,
  onChange,
}: {
  category: AccountRatingCategory;
  onChange: (category: AccountRatingCategory) => void;
}) {
  return (
    <div className="segmented-control" aria-label="Trust category">
      {TRUST_CATEGORIES.map((candidate) => (
        <button
          className={candidate === category ? 'active' : ''}
          key={candidate}
          onClick={() => onChange(candidate)}
          type="button"
        >
          {categoryLabel(candidate)}
        </button>
      ))}
    </div>
  );
}

const VIEW_OPTIONS: { label: string; value: ViewMode }[] = [
  { label: 'Accounts', value: 'accounts' },
  { label: 'Graph', value: 'graph' },
  { label: 'Changes', value: 'changes' },
  { label: 'Resources', value: 'resources' },
];

// The explorer view (Accounts/Graph/Changes/Resources) as a dropdown that sits next to the status
// filter, keeping all the list-shaping controls together on one row.
function ViewSelect({
  onChange,
  selectRef,
  view,
}: {
  onChange: (view: ViewMode) => void;
  selectRef?: React.RefObject<HTMLSelectElement | null>;
  view: ViewMode;
}) {
  return (
    <select
      aria-label="Explorer view"
      onChange={(event) => onChange(event.target.value as ViewMode)}
      ref={selectRef}
      value={view}
    >
      {VIEW_OPTIONS.map((candidate) => (
        <option key={candidate.value} value={candidate.value}>
          {candidate.label}
        </option>
      ))}
    </select>
  );
}

function getDerivationCategory(derivation: TrustDerivation, category: AccountRatingCategory) {
  return derivation.categories.find((candidate) => candidate.category === category);
}

function getInboundRatingCount(derivation: TrustDerivation, category: AccountRatingCategory) {
  const inbound = getDerivationCategory(derivation, category)?.inboundRatings;

  return (inbound?.positiveRatingCount ?? 0) + (inbound?.negativeRatingCount ?? 0);
}

function getAccountSortLabel(derivation: TrustDerivation, profiles: IdentityProfilesByAddress) {
  return getIdentityLabel(profiles[derivation.accountAddress], derivation.accountAddress);
}

function getAccountMintingLevel(accountData: AccountData | undefined) {
  return accountData?.level;
}

function getAccountBlocksMinted(accountData: AccountData | undefined) {
  return accountData?.blocksMinted;
}

function compareAccountLabels(
  left: TrustDerivation,
  right: TrustDerivation,
  profiles: IdentityProfilesByAddress,
) {
  const labelSort = getAccountSortLabel(left, profiles).localeCompare(getAccountSortLabel(right, profiles), undefined, {
    numeric: true,
    sensitivity: 'base',
  });

  return labelSort || left.accountAddress.localeCompare(right.accountAddress);
}

function compareAccountRows(
  left: TrustDerivation,
  right: TrustDerivation,
  sortKey: AccountSortKey,
  category: AccountRatingCategory,
  profiles: IdentityProfilesByAddress,
  accountDataByAddress: AccountDataByAddress,
  youRatedByAddress: RatingsByAddress,
) {
  const leftCategory = getDerivationCategory(left, category);
  const rightCategory = getDerivationCategory(right, category);

  switch (sortKey) {
    case 'account':
      return compareAccountLabels(left, right, profiles);
    case 'status':
      return left.derivedTrustStatusValue - right.derivedTrustStatusValue;
    case 'level':
      return (getAccountMintingLevel(accountDataByAddress[left.accountAddress]) ?? -1) -
        (getAccountMintingLevel(accountDataByAddress[right.accountAddress]) ?? -1);
    case 'blocksMinted':
      return (getAccountBlocksMinted(accountDataByAddress[left.accountAddress]) ?? -1) -
        (getAccountBlocksMinted(accountDataByAddress[right.accountAddress]) ?? -1);
    case 'score':
      return (leftCategory?.score ?? 0) - (rightCategory?.score ?? 0);
    case 'ratings': {
      const ratingSort = getInboundRatingCount(left, category) - getInboundRatingCount(right, category);

      if (ratingSort !== 0) {
        return ratingSort;
      }

      return (leftCategory?.inboundRatings.positiveRatingCount ?? 0) -
        (rightCategory?.inboundRatings.positiveRatingCount ?? 0);
    }
    case 'youRated':
      return (youRatedByAddress[left.accountAddress] ?? UNRATED_SORT_VALUE) -
        (youRatedByAddress[right.accountAddress] ?? UNRATED_SORT_VALUE);
    case 'voteWeight':
      return left.derivedTrustWeightPercent - right.derivedTrustWeightPercent;
    case 'seed':
      return Number(left.mintingSeedMember) - Number(right.mintingSeedMember);
    default:
      return 0;
  }
}

function getAriaSort(sort: AccountSortState, key: AccountSortKey) {
  const entry = sort.find((candidate) => candidate.key === key);

  if (!entry) {
    return 'none';
  }

  return entry.direction === 'asc' ? 'ascending' : 'descending';
}

function SortHeader({
  label,
  onSort,
  sort,
  sortKey,
}: {
  label: string;
  onSort: (key: AccountSortKey) => void;
  sort: AccountSortState;
  sortKey: AccountSortKey;
}) {
  const rank = sort.findIndex((entry) => entry.key === sortKey);
  const active = rank >= 0;
  const Icon = active ? (sort[rank].direction === 'asc' ? ArrowUp : ArrowDown) : ArrowDownUp;

  return (
    <button
      className={`sort-header ${active ? 'active' : ''}`}
      onClick={() => onSort(sortKey)}
      title={`Sort by ${label}`}
      type="button"
    >
      <span>{label}</span>
      <Icon aria-hidden="true" size={13} />
      {active && sort.length > 1 ? <span className="sort-rank">{rank + 1}</span> : null}
    </button>
  );
}

function TrustGraph({
  graph,
  onSelect,
  profiles,
  selectedAddress,
}: {
  graph: TrustGraphModel;
  onSelect: (node: TrustGraphNode) => void;
  profiles: IdentityProfilesByAddress;
  selectedAddress?: string;
}) {
  const nodeByAddress = useMemo(
    () => new Map(graph.nodes.map((node) => [node.address, node] as const)),
    [graph.nodes],
  );

  const laneWidth = graph.width / TRUST_STATUSES.length;

  return (
    <div className="graph-surface">
      <svg
        aria-label="Trust graph"
        className="trust-graph"
        role="img"
        style={{ aspectRatio: `${graph.width} / ${graph.height}` }}
        viewBox={`0 0 ${graph.width} ${graph.height}`}
      >
        <g className="graph-lanes">
          {TRUST_STATUSES.map((status, index) => (
            <g key={status}>
              <rect height={graph.height} width={laneWidth} x={index * laneWidth} y="0" />
              <text x={index * laneWidth + 20} y="28">
                {statusLabel(status)}
              </text>
            </g>
          ))}
        </g>
        <g className="graph-links">
          {graph.links.map((link) => {
            const source = nodeByAddress.get(link.source);
            const target = nodeByAddress.get(link.target);

            if (!source || !target) {
              return null;
            }

            return (
              <line
                className={`graph-link graph-link-${ratingTone(link.rating)}`}
                key={link.id}
                strokeWidth={Math.max(1, link.confidence)}
                x1={source.x}
                x2={target.x}
                y1={source.y}
                y2={target.y}
              >
                <title>
                  {compactAddress(link.source)}
                  {' -> '}
                  {compactAddress(link.target)} ({link.rating})
                </title>
              </line>
            );
          })}
        </g>
        <g className="graph-nodes">
          {graph.nodes.map((node, index) => {
            const profile = profiles[node.address];
            const label = getIdentityLabel(profile, node.address);
            const radius = node.seedMember ? 15 : 12;
            const clipId = `avatar-clip-${index}`;

            return (
              <g
                className={`graph-node graph-node-${statusTone(node.status)} ${
                  node.address === selectedAddress ? 'selected' : ''
                }`}
                key={node.address}
                onClick={() => onSelect(node)}
                role="button"
                tabIndex={0}
              >
                <defs>
                  <clipPath id={clipId}>
                    <circle cx={node.x} cy={node.y} r={radius - 2} />
                  </clipPath>
                </defs>
                <circle cx={node.x} cy={node.y} r={radius} />
                {profile?.avatarSrc ? (
                  <image
                    clipPath={`url(#${clipId})`}
                    height={(radius - 2) * 2}
                    href={profile.avatarSrc}
                    preserveAspectRatio="xMidYMid slice"
                    width={(radius - 2) * 2}
                    x={node.x - radius + 2}
                    y={node.y - radius + 2}
                  />
                ) : (
                  <text className="graph-node-initial" x={node.x} y={node.y + 4}>
                    {getAvatarFallbackCharacter(profile?.name, node.address)}
                  </text>
                )}
                <text className="graph-node-label" x={node.x} y={node.y + 32}>
                  {compactIdentityGraphLabel(profile, node.address)}
                </text>
                <title>
                  {label} - {node.address} - {statusLabel(node.status)} L{node.level}
                </title>
              </g>
            );
          })}
        </g>
      </svg>
      {graph.links.length === 0 ? (
        <div className="empty-overlay">
          <CircleDot size={18} />
          <span>No active rating edges in this category yet.</span>
        </div>
      ) : null}
    </div>
  );
}

function AccountsTable({
  accountDataByAddress,
  category,
  derivations,
  onRate,
  onRatingSubmitted,
  onSelect,
  onSort,
  openRateAddress,
  pendingByAddress,
  profiles,
  ratingActionAvailable,
  self,
  selectedAddress,
  sort,
  youRatedByAddress,
}: {
  accountDataByAddress: AccountDataByAddress;
  category: AccountRatingCategory;
  derivations: TrustDerivation[];
  onRate: (address: string | null) => void;
  onRatingSubmitted: (entry: PendingRatingEntry) => void;
  onSelect: (derivation: TrustDerivation) => void;
  onSort: (key: AccountSortKey) => void;
  openRateAddress: string | null;
  pendingByAddress: RatingsByAddress;
  profiles: IdentityProfilesByAddress;
  ratingActionAvailable: boolean;
  self: SelfAccount | null;
  selectedAddress?: string;
  sort: AccountSortState;
  youRatedByAddress: RatingsByAddress;
}) {
  // Close any open quick-rate popover when the sort or category changes, since the row it was
  // anchored to may move or its cooldown context may change. onRate is setOpenRateAddress (stable).
  useEffect(() => {
    onRate(null);
  }, [category, sort, onRate]);

  // A pending (unconfirmed) rating optimistically overrides the confirmed value for sorting, so a
  // freshly-rated account jumps to its new position immediately.
  const effectiveYouRated = useMemo<RatingsByAddress>(
    () => ({ ...youRatedByAddress, ...pendingByAddress }),
    [pendingByAddress, youRatedByAddress],
  );

  const sortedDerivations = useMemo(
    () =>
      derivations
        .map((derivation, index) => ({ derivation, index }))
        .sort((left, right) => {
          // Apply each sort column in priority order; the first to break the tie wins.
          for (const { direction, key } of sort) {
            const comparison = compareAccountRows(
              left.derivation,
              right.derivation,
              key,
              category,
              profiles,
              accountDataByAddress,
              effectiveYouRated,
            );

            if (comparison !== 0) {
              return direction === 'asc' ? comparison : -comparison;
            }
          }

          return compareAccountLabels(left.derivation, right.derivation, profiles) || left.index - right.index;
        })
        .map(({ derivation }) => derivation),
    [accountDataByAddress, category, derivations, effectiveYouRated, profiles, sort],
  );

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th aria-sort={getAriaSort(sort, 'account')}>
              <SortHeader label="Account" onSort={onSort} sort={sort} sortKey="account" />
            </th>
            <th aria-sort={getAriaSort(sort, 'status')}>
              <SortHeader label="Status" onSort={onSort} sort={sort} sortKey="status" />
            </th>
            <th aria-sort={getAriaSort(sort, 'level')}>
              <SortHeader label="Level" onSort={onSort} sort={sort} sortKey="level" />
            </th>
            <th aria-sort={getAriaSort(sort, 'blocksMinted')}>
              <SortHeader label="Blocks minted" onSort={onSort} sort={sort} sortKey="blocksMinted" />
            </th>
            <th aria-sort={getAriaSort(sort, 'score')}>
              <SortHeader label="Score" onSort={onSort} sort={sort} sortKey="score" />
            </th>
            <th aria-sort={getAriaSort(sort, 'ratings')}>
              <SortHeader label="Ratings" onSort={onSort} sort={sort} sortKey="ratings" />
            </th>
            <th aria-sort={getAriaSort(sort, 'youRated')}>
              <SortHeader label="You rated" onSort={onSort} sort={sort} sortKey="youRated" />
            </th>
            <th aria-sort={getAriaSort(sort, 'voteWeight')}>
              <SortHeader label="Vote weight" onSort={onSort} sort={sort} sortKey="voteWeight" />
            </th>
            <th aria-sort={getAriaSort(sort, 'seed')}>
              <SortHeader label="Seed" onSort={onSort} sort={sort} sortKey="seed" />
            </th>
            <th>Rate</th>
          </tr>
        </thead>
        <tbody>
          {sortedDerivations.map((derivation) => {
            const categoryData = getDerivationCategory(derivation, category);
            const inbound = categoryData?.inboundRatings;
            const profile = profiles[derivation.accountAddress];
            const accountData = accountDataByAddress[derivation.accountAddress];
            const youRated = youRatedByAddress[derivation.accountAddress];
            const pendingRating = pendingByAddress[derivation.accountAddress];

            return (
              <tr
                className={selectedAddress === derivation.accountAddress ? 'selected-row' : ''}
                key={derivation.accountAddress}
                onClick={() => onSelect(derivation)}
              >
                <td>
                  <div className="identity-cell">
                    <IdentityAvatar address={derivation.accountAddress} profile={profile} size="small" />
                    <IdentityLabel address={derivation.accountAddress} profile={profile} />
                  </div>
                </td>
                <td>
                  <StatusBadge status={derivation.derivedTrustStatus} />
                </td>
                <td>{formatNumber(getAccountMintingLevel(accountData))}</td>
                <td>{formatNumber(getAccountBlocksMinted(accountData))}</td>
                <td>{formatNumber(categoryData?.score ?? 0)}</td>
                <td>
                  {formatNumber(inbound?.positiveRatingCount ?? 0)} / {formatNumber(inbound?.negativeRatingCount ?? 0)}
                </td>
                <td>
                  {pendingRating !== undefined ? (
                    <span className="you-rated-pending" title="Submitted — waiting for confirmation">
                      <span className="you-rated-spinner" aria-hidden="true" />
                      {pendingRating !== 0 ? (
                        <span className={`you-rated ${ratingTone(pendingRating)}`}>
                          {pendingRating > 0 ? `+${pendingRating}` : pendingRating}
                        </span>
                      ) : null}
                    </span>
                  ) : youRated === undefined ? (
                    <span className="muted">—</span>
                  ) : (
                    <span className={`you-rated ${ratingTone(youRated)}`}>
                      {youRated > 0 ? `+${youRated}` : youRated}
                    </span>
                  )}
                </td>
                <td>{formatPercent(derivation.derivedTrustWeightPercent)}</td>
                <td>{derivation.mintingSeedMember ? 'Yes' : 'No'}</td>
                <RateCell
                  category={category}
                  derivation={derivation}
                  onRate={onRate}
                  onRatingSubmitted={onRatingSubmitted}
                  open={openRateAddress === derivation.accountAddress}
                  pendingRating={pendingByAddress[derivation.accountAddress]}
                  ratingActionAvailable={ratingActionAvailable}
                  self={self}
                />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ChangesTable({ changes, profiles }: { changes: TrustStatusChange[]; profiles: IdentityProfilesByAddress }) {
  if (changes.length === 0) {
    return <EmptyState icon={<ArrowDownUp size={18} />} text="No trust status changes are recorded yet." />;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Account</th>
            <th>Category</th>
            <th>Previous</th>
            <th>New</th>
            <th>Score</th>
            <th>Height</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((change) => {
            const profile = profiles[change.accountAddress];

            return (
              <tr key={`${change.accountAddress}-${change.category}-${change.snapshotHeight}`}>
                <td>
                  <div className="identity-cell">
                    <IdentityAvatar address={change.accountAddress} profile={profile} size="small" />
                    <IdentityLabel address={change.accountAddress} profile={profile} />
                  </div>
                </td>
                <td>{categoryLabel(change.category)}</td>
                <td>
                  <StatusBadge status={change.previousTrustStatus} />
                </td>
                <td>
                  <StatusBadge status={change.newTrustStatus} />
                </td>
                <td>
                  {formatNumber(change.previousScore)}
                  {' -> '}
                  {formatNumber(change.newScore)}
                </td>
                <td>{formatNumber(change.snapshotHeight)}</td>
                <td>{formatDate(change.snapshotTimestamp)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ResourceRatingsTable({ resources }: { resources: ResourceRatingSummary[] }) {
  if (resources.length === 0) {
    return <EmptyState icon={<Layers size={18} />} text="No resource ratings are recorded yet." />;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Resource</th>
            <th>Service</th>
            <th>Count</th>
            <th>Average</th>
            <th>Weighted</th>
            <th>Total weight</th>
          </tr>
        </thead>
        <tbody>
          {resources.map((resource) => (
            <tr key={`${resource.service}-${resource.name}-${resource.identifier}`}>
              <td>
                <span className="resource-name">{resource.name}</span>
                <span className="muted">{resource.identifier || 'default'}</span>
              </td>
              <td>{resource.service}</td>
              <td>{formatNumber(resource.ratingCount)}</td>
              <td>{formatNumber(resource.averageRating)}</td>
              <td>{formatNumber(resource.weightedAverageRating)}</td>
              <td>{formatNumber(resource.totalWeight)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="empty-state">
      {icon}
      <span>{text}</span>
    </div>
  );
}

const RATING_VALUES = [4, 3, 2, 1, 0, -1, -2, -3, -4];
const RATING_MAGNITUDES = ['', 'Low', 'Medium', 'High', 'Very high'];
const PENDING_CONFIRM_POLL_MS = 8000;

// A submitted-but-unconfirmed rating, tracked at the app level so several can be in flight at once
// and the "You rated" column can show a per-account spinner without blocking new submissions.
type PendingRatingEntry = {
  category: AccountRatingCategory;
  rating: number;
  raterPublicKey: string;
  targetAddress: string;
  targetPublicKey: string;
};
type PendingRatingsByKey = Record<string, PendingRatingEntry>;

function pendingRatingKey(category: AccountRatingCategory, targetAddress: string) {
  return `${category}:${targetAddress}`;
}

function ratingOptionLabel(value: number) {
  if (value === 0) {
    return '0 · Remove rating';
  }

  const tone = value > 0 ? 'Positive' : 'Negative';

  return `${value > 0 ? '+' : ''}${value} · ${tone} (${RATING_MAGNITUDES[Math.abs(value)]})`;
}

function mapRatingError(message: string) {
  const checks: [RegExp, string][] = [
    [/TOO_SOON/i, 'You rated this account too recently. Wait for the cooldown to clear before changing it.'],
    [/CANNOT_RATE_SELF/i, 'You cannot rate your own account.'],
    [/PUBLIC_KEY_UNKNOWN/i, 'This account has no on-chain history yet, so it cannot be rated.'],
    [/UNCHANGED/i, 'That rating matches your current rating — nothing to change.'],
    [/INVALID_ACCOUNT_RATING/i, 'Rating must be a whole number between -4 and +4.'],
    [/NO_BALANCE/i, 'Your account has insufficient balance to cover the transaction fee.'],
    [/NEEDS_SYNC|SYNCHRONIZ/i, 'Your node is still syncing. Try again once it has caught up.'],
  ];

  for (const [pattern, text] of checks) {
    if (pattern.test(message)) {
      return text;
    }
  }

  return message;
}

type RatingControlArgs = {
  category: AccountRatingCategory;
  onSubmitted: (entry: PendingRatingEntry) => void;
  pendingRating: number | undefined;
  ratingActionAvailable: boolean;
  self: SelfAccount | null;
  targetAddress: string;
  targetPublicKey: string;
};

// Single source of truth for rating cooldown/unlock/submit/gating logic, shared by the full-mode
// RatingForm (detail view) and the compact RatingPopover (inline quick-rate). All hooks run
// unconditionally — the cooldown effect internally no-ops when !canInteract — so consumers must
// render the unavailable state from `canInteract`/`note` rather than the hook short-circuiting.
function useRatingControl({
  category,
  onSubmitted,
  pendingRating,
  ratingActionAvailable,
  self,
  targetAddress,
  targetPublicKey,
}: RatingControlArgs) {
  const isSelf = !!self && self.address === targetAddress;
  const raterPublicKey = self?.publicKey ?? null;
  const canInteract = ratingActionAvailable && !!self && !!raterPublicKey && !isSelf;
  const isPending = pendingRating !== undefined;

  const [rating, setRating] = useState(0);
  const [cooldown, setCooldown] = useState<AccountRatingCooldown | null>(null);
  const [cooldownLoading, setCooldownLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'positive' | 'negative' } | null>(null);

  // Refetch cooldown on mount and whenever this account's pending state flips, so that once the
  // rating confirms (pendingRating clears) "your current rating" reflects the new on-chain value.
  useEffect(() => {
    if (!canInteract || !raterPublicKey) {
      setCooldown(null);
      return;
    }

    let cancelled = false;
    setCooldownLoading(true);

    getRatingCooldown({ category, rater: raterPublicKey, target: targetPublicKey })
      .then((result) => {
        if (cancelled) {
          return;
        }

        setCooldown(result);
        setRating(result.activeRating ?? 0);
      })
      .catch(() => {
        if (!cancelled) {
          setCooldown(null);
          // Without cooldown data we cannot trust a carried-over selection; reset to a no-op.
          setRating(0);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCooldownLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [canInteract, category, pendingRating, raterPublicKey, targetPublicKey]);

  let note = 'Open this app in Qortium Home to submit trust ratings.';

  if (ratingActionAvailable && !self) {
    note = 'Sign in to a Qortium Home account to submit trust ratings.';
  } else if (ratingActionAvailable && isSelf) {
    note = 'You cannot rate your own account.';
  } else if (ratingActionAvailable && self && !raterPublicKey) {
    note = 'Your account needs at least one on-chain transaction before it can submit ratings.';
  }

  const activeRating = cooldown?.activeRating ?? null;
  const unchanged = activeRating === null ? rating === 0 : rating === activeRating;
  const onCooldown = cooldown ? !cooldown.canChangeNow : false;
  const accountLocked = self?.isUnlocked === false;
  const submitDisabled = submitting || cooldownLoading || onCooldown || unchanged || isPending;

  // Returns true only on a successful broadcast so callers (the quick-rate popover) get a reliable
  // success signal: reading `message` after the await would see the stale render-time value.
  const handleSubmit = async (): Promise<boolean> => {
    if (!raterPublicKey) {
      return false;
    }

    const submittedRating = rating;
    setSubmitting(true);
    setMessage(null);

    try {
      // Signing needs an unlocked account; ask Home to unlock (prompts the user only when locked).
      // UNLOCK_SELECTED_ACCOUNT resolves (never rejects) on cancel/timeout with isUnlocked false,
      // so we drive entirely off the returned lock state.
      const unlocked = await ensureAccountUnlocked();

      if (!unlocked) {
        setMessage({ text: 'Qortium Home could not confirm your account is unlocked. Try again.', tone: 'negative' });
        return false;
      }

      if (unlocked.isUnlocked === false) {
        setMessage({ text: 'Unlock your account in Qortium Home to submit a rating.', tone: 'negative' });
        return false;
      }

      // submitRating resolves once Home has broadcast (accepted) the transaction. We hand the
      // pending entry up to the app, which tracks confirmation — neither surface blocks afterward, so
      // the user can immediately rate other accounts.
      await submitRating({ category, rating: submittedRating, targetPublicKey });
      onSubmitted({ category, rating: submittedRating, raterPublicKey, targetAddress, targetPublicKey });
      return true;
    } catch (submitError) {
      setMessage({
        text: mapRatingError(submitError instanceof Error ? submitError.message : String(submitError)),
        tone: 'negative',
      });
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  return {
    accountLocked,
    activeRating,
    canInteract,
    cooldown,
    cooldownLoading,
    handleSubmit,
    isPending,
    message,
    note,
    onCooldown,
    rating,
    setRating,
    submitDisabled,
    submitting,
    unchanged,
  };
}

type RatingControl = ReturnType<typeof useRatingControl>;

// Full-mode rating surface (detail view). Thin renderer over useRatingControl.
function RatingForm(props: RatingControlArgs) {
  const { category, pendingRating, self } = props;
  const control = useRatingControl(props);

  if (!control.canInteract) {
    return (
      <div className="mini-section">
        <h3>Rate this account</h3>
        <p className="muted">{control.note}</p>
      </div>
    );
  }

  const { accountLocked, activeRating, cooldown, cooldownLoading, isPending, message, onCooldown, rating, submitDisabled, submitting, unchanged } =
    control;

  return (
    <div className="mini-section">
      <h3>Rate this account</h3>
      <p className="muted rating-context">
        Rating as {self?.name ?? compactAddress(self?.address, 8, 6)} in the {categoryLabel(category)} category.
      </p>
      <div className="rating-form">
        <label className="rating-select">
          <span>Rating</span>
          <select
            disabled={submitting || cooldownLoading || isPending}
            onChange={(event) => control.setRating(Number(event.target.value))}
            value={rating}
          >
            {RATING_VALUES.map((value) => (
              <option key={value} value={value}>
                {ratingOptionLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <button
          className="rating-submit"
          disabled={submitDisabled}
          onClick={() => void control.handleSubmit()}
          type="button"
        >
          {submitting ? 'Submitting...' : isPending ? 'Pending...' : rating === 0 ? 'Remove rating' : 'Submit rating'}
        </button>
      </div>
      {isPending ? (
        <div className="rating-pending">
          <span className="rating-pending__spinner" aria-hidden="true" />
          <div>
            <strong>
              {pendingRating === 0
                ? 'Removing your rating — pending confirmation'
                : `Your ${pendingRating! > 0 ? '+' : ''}${pendingRating} rating is pending confirmation`}
            </strong>
            <p className="muted">
              Waiting for the transaction to be included in a block
              {cooldown?.candidateChangeHeight
                ? ` — applies around block ${formatNumber(cooldown.candidateChangeHeight)}`
                : ''}
              . You can rate other accounts while you wait.
            </p>
          </div>
        </div>
      ) : (
        <p className="muted rating-status">
          {cooldownLoading
            ? 'Checking rating cooldown...'
            : onCooldown
              ? `On cooldown — ${formatNumber(cooldown?.blocksRemaining)} block(s) remaining.`
              : activeRating === null
                ? 'You have not rated this account yet.'
                : `Your current rating is ${activeRating > 0 ? '+' : ''}${activeRating}.`}
        </p>
      )}
      {!isPending && accountLocked ? (
        <p className="muted">Your account is locked — submitting will prompt you to unlock it.</p>
      ) : null}
      {!isPending && unchanged && !cooldownLoading && !onCooldown ? (
        <p className="muted">
          {activeRating === null
            ? 'Choose a non-zero rating to submit.'
            : 'Choose a different rating, or 0 to remove your existing one.'}
        </p>
      ) : null}
      {message ? <p className={`rating-message ${message.tone}`}>{message.text}</p> : null}
    </div>
  );
}

// Compact rating surface (inline quick-rate popover): select + Submit + one-line status. Presents an
// already-built control, so the underlying cooldown/unlock/submit logic is shared with RatingForm.
function RatingPopover({
  control,
  onClose,
  selectRef,
}: {
  control: RatingControl;
  onClose: () => void;
  selectRef?: React.RefObject<HTMLSelectElement | null>;
}) {
  const {
    activeRating,
    cooldown,
    cooldownLoading,
    isPending,
    message,
    onCooldown,
    rating,
    submitDisabled,
    submitting,
  } = control;

  const handleSubmit = async () => {
    // Close only on success — an error leaves `message` set so the user can read it and retry.
    // We use the boolean return rather than reading `control.message`, which is captured at render
    // time and so would still hold the pre-submit (stale) value here.
    if (await control.handleSubmit()) {
      onClose();
    }
  };

  return (
    <div className="rating-popover-body">
      <label className="rating-select">
        <span>Rating</span>
        <select
          disabled={submitting || cooldownLoading || isPending}
          onChange={(event) => control.setRating(Number(event.target.value))}
          ref={selectRef}
          value={rating}
        >
          {RATING_VALUES.map((value) => (
            <option key={value} value={value}>
              {ratingOptionLabel(value)}
            </option>
          ))}
        </select>
      </label>
      <button
        className="rating-submit"
        disabled={submitDisabled}
        onClick={() => void handleSubmit()}
        type="button"
      >
        {submitting ? 'Submitting...' : isPending ? 'Pending...' : rating === 0 ? 'Remove rating' : 'Submit rating'}
      </button>
      <p className="muted rating-popover-status">
        {isPending
          ? 'Rating pending confirmation.'
          : cooldownLoading
            ? 'Checking rating cooldown...'
            : onCooldown
              ? `On cooldown — ${formatNumber(cooldown?.blocksRemaining)} block(s) remaining.`
              : activeRating === null
                ? 'You have not rated this account yet.'
                : `Your current rating is ${activeRating > 0 ? '+' : ''}${activeRating}.`}
      </p>
      {message ? <p className={`rating-message ${message.tone}`}>{message.text}</p> : null}
    </div>
  );
}

// A single Accounts-table rate cell: the Rate trigger button (whose ref anchors the popover) plus the
// popover itself when open. Extracted so each row owns a stable button ref for portal positioning.
function RateCell({
  category,
  derivation,
  onRate,
  onRatingSubmitted,
  open,
  pendingRating,
  ratingActionAvailable,
  self,
}: {
  category: AccountRatingCategory;
  derivation: TrustDerivation;
  onRate: (address: string | null) => void;
  onRatingSubmitted: (entry: PendingRatingEntry) => void;
  open: boolean;
  pendingRating: number | undefined;
  ratingActionAvailable: boolean;
  self: SelfAccount | null;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const rowIsSelf = !!self && self.address === derivation.accountAddress;
  const rowDisabled = !ratingActionAvailable || !self || !self.publicKey || rowIsSelf;
  const rowNote = !ratingActionAvailable
    ? 'Open this app in Qortium Home to submit trust ratings.'
    : !self
      ? 'Sign in to a Qortium Home account to submit trust ratings.'
      : rowIsSelf
        ? 'You cannot rate your own account.'
        : !self.publicKey
          ? 'Your account needs at least one on-chain transaction before it can submit ratings.'
          : 'Rate this account';

  return (
    <td className="rate-cell" onClick={(event) => event.stopPropagation()}>
      <button
        aria-expanded={open}
        className="rate-button"
        disabled={rowDisabled}
        onClick={(event) => {
          event.stopPropagation();
          onRate(open ? null : derivation.accountAddress);
        }}
        ref={buttonRef}
        title={rowNote}
        type="button"
      >
        Rate
      </button>
      {open ? (
        <RowRatePopover
          anchorRef={buttonRef}
          category={category}
          onClose={() => onRate(null)}
          onRatingSubmitted={onRatingSubmitted}
          pendingRating={pendingRating}
          ratingActionAvailable={ratingActionAvailable}
          self={self}
          targetAddress={derivation.accountAddress}
          targetPublicKey={derivation.accountPublicKey}
        />
      ) : null}
    </td>
  );
}

// Owns the rating control for a single open row so the hook lives exactly as long as the popover is
// open, and closes the popover on outside pointer-down / Escape. Rendered into a portal with fixed
// positioning anchored to the trigger button so the scrollable `.table-wrap` (overflow:auto) never
// clips it, regardless of scroll position or how far down the row is.
function RowRatePopover({
  anchorRef,
  category,
  onClose,
  onRatingSubmitted,
  pendingRating,
  ratingActionAvailable,
  self,
  targetAddress,
  targetPublicKey,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  category: AccountRatingCategory;
  onClose: () => void;
  onRatingSubmitted: (entry: PendingRatingEntry) => void;
  pendingRating: number | undefined;
  ratingActionAvailable: boolean;
  self: SelfAccount | null;
  targetAddress: string;
  targetPublicKey: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const control = useRatingControl({
    category,
    onSubmitted: onRatingSubmitted,
    pendingRating,
    ratingActionAvailable,
    self,
    targetAddress,
    targetPublicKey,
  });

  // Anchor the fixed-position popover to the trigger button's viewport rect, flipping it upward when
  // there is not enough room below (e.g. bottom rows). Recompute on scroll/resize so it tracks the
  // row while the table scrolls underneath.
  const POPOVER_WIDTH = 280;

  useEffect(() => {
    const updatePosition = () => {
      const anchor = anchorRef.current;

      if (!anchor) {
        return;
      }

      const rect = anchor.getBoundingClientRect();
      const popoverHeight = ref.current?.offsetHeight ?? 0;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpward = popoverHeight > 0 && spaceBelow < popoverHeight + 12 && rect.top > popoverHeight + 12;
      const top = openUpward ? rect.top - popoverHeight - 6 : rect.bottom + 6;
      // Right-align to the trigger, then clamp to the viewport so it never runs off either edge.
      const left = Math.max(8, Math.min(rect.right - POPOVER_WIDTH, window.innerWidth - POPOVER_WIDTH - 8));

      setPosition({ left, top });
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [anchorRef]);

  // Move focus into the popover so Escape works from the keyboard (focus would otherwise stay on the
  // trigger button, outside this subtree) and screen-reader users land on the controls.
  useEffect(() => {
    selectRef.current?.focus();
  }, []);

  // Depend on the stable onClose (setOpenRateAddress) rather than the whole props bag to avoid
  // re-subscribing every render. pointerdown fires before the row's click handler; the trigger button
  // is excluded so its toggle handler (not this listener) governs a click on the button itself.
  // The keydown listener is on the document so Escape closes even while focus is on the trigger.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      if (ref.current?.contains(target) || anchorRef.current?.contains(target)) {
        return;
      }

      onClose();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        anchorRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [anchorRef, onClose]);

  return createPortal(
    <div
      className="rate-popover"
      onClick={(event) => event.stopPropagation()}
      ref={ref}
      style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? 'visible' : 'hidden' }}
    >
      <RatingPopover control={control} onClose={onClose} selectRef={selectRef} />
    </div>,
    document.body,
  );
}

// Full-width detail takeover: identity header, prominent rate section (primary action, above the
// fold), then a two-column stats + impacts grid. Only mounted when an account is selected, so
// selectedDerivation is guaranteed non-null.
function AccountDetail({
  category,
  detail,
  onBack,
  onRatingSubmitted,
  pendingRating,
  profile,
  profiles,
  ratingActionAvailable,
  self,
  selectedDerivation,
}: {
  category: AccountRatingCategory;
  detail: AccountDetailState;
  onBack: () => void;
  onRatingSubmitted: (entry: PendingRatingEntry) => void;
  pendingRating: number | undefined;
  profile?: IdentityProfile;
  profiles: IdentityProfilesByAddress;
  ratingActionAvailable: boolean;
  self: SelfAccount | null;
  selectedDerivation: TrustDerivation;
}) {
  const backButtonRef = useRef<HTMLButtonElement>(null);

  // Move focus to Back when the takeover mounts so keyboard/screen-reader users land on a control
  // (the clicked row that triggered the takeover has been unmounted, dropping focus to <body>).
  useEffect(() => {
    backButtonRef.current?.focus();
  }, []);

  const backBar = (
    <div className="detail-back">
      <button aria-label="Back to list" className="back-button" onClick={onBack} ref={backButtonRef} type="button">
        <ArrowLeft size={16} /> Back
      </button>
    </div>
  );

  // Render the identity header and the rate section immediately — they only need props and the
  // already-loaded derivation, not the detail fetch. This keeps the rating form (and any pending
  // state) visible while the profile/explanation load, so reopening a just-rated account still shows
  // its pending rating instead of a blank skeleton.
  const profileCategory = detail.profile?.categories.find((candidate) => candidate.category === category);
  const explanationCategory = detail.explanation?.categories.find((candidate) => candidate.category === category);
  const fallbackCategory = selectedDerivation.categories.find((candidate) => candidate.category === category);
  const label = getIdentityLabel(profile, selectedDerivation.accountAddress);

  return (
    <>
      {backBar}
      <div className="detail-header">
        <IdentityAvatar address={selectedDerivation.accountAddress} profile={profile} size="large" />
        <div>
          <StatusBadge status={detail.profile?.trustStatus ?? selectedDerivation.derivedTrustStatus} />
          <h2>{label}</h2>
        </div>
        {label !== selectedDerivation.accountAddress ? (
          <span className="mono">{compactAddress(selectedDerivation.accountAddress, 12, 8)}</span>
        ) : null}
        <span className="mono">{compactAddress(selectedDerivation.accountPublicKey, 9, 8)}</span>
      </div>
      <div className="detail-rate">
        <RatingForm
          category={category}
          key={`${selectedDerivation.accountPublicKey}:${category}`}
          onSubmitted={onRatingSubmitted}
          pendingRating={pendingRating}
          ratingActionAvailable={ratingActionAvailable}
          self={self}
          targetAddress={selectedDerivation.accountAddress}
          targetPublicKey={selectedDerivation.accountPublicKey}
        />
      </div>
      {detail.loading ? (
        <div className="detail-columns-loading">
          <div className="skeleton-block" />
          <div className="skeleton-block short" />
        </div>
      ) : (
      <div className="detail-columns">
        <div className="detail-stats">
          <div className="detail-grid">
            <div>
              <span>Category</span>
              <strong>{categoryLabel(category)}</strong>
            </div>
            <div>
              <span>Level</span>
              <strong>{formatNumber(profileCategory?.level ?? fallbackCategory?.level ?? 0)}</strong>
            </div>
            <div>
              <span>Score</span>
              <strong>{formatNumber(profileCategory?.score ?? fallbackCategory?.score ?? 0)}</strong>
            </div>
            <div>
              <span>Weight</span>
              <strong>
                {formatPercent(detail.profile?.trustWeightPercent ?? selectedDerivation.derivedTrustWeightPercent)}
              </strong>
            </div>
            <div>
              <span>Blocks minted</span>
              <strong>{formatNumber(detail.profile?.blocksMinted)}</strong>
            </div>
            <div>
              <span>Effective vote</span>
              <strong>{formatNumber(detail.profile?.effectiveVoteWeight)}</strong>
            </div>
          </div>
          <div className="mini-section">
            <h3>Rating Counts</h3>
            <div className="rating-counts">
              <span className="positive">
                +{formatNumber(profileCategory?.inboundRatings.positiveRatingCount ?? 0)}
              </span>
              <span className="negative">
                -{formatNumber(profileCategory?.inboundRatings.negativeRatingCount ?? 0)}
              </span>
              <span>{formatNumber(profileCategory?.outboundRatings.totalRatingCount ?? 0)} outbound</span>
            </div>
          </div>
        </div>
        <div className="detail-impacts">
          <div className="mini-section">
            <h3>Top Impacts</h3>
            {(explanationCategory?.topPositiveImpacts.length ?? 0) +
              (explanationCategory?.topNegativeImpacts.length ?? 0) ===
            0 ? (
              <p className="muted">No impact rows for this category.</p>
            ) : (
              <ul className="impact-list">
                {[
                  ...(explanationCategory?.topPositiveImpacts ?? []),
                  ...(explanationCategory?.topNegativeImpacts ?? []),
                ].map((impact) => {
                  const impactProfile = profiles[impact.raterAddress];

                  return (
                    <li key={`${impact.raterAddress}-${impact.category}-${impact.rating}`}>
                      <span className={`impact-dot ${ratingTone(impact.rating)}`} />
                      <div className="identity-cell compact">
                        <IdentityAvatar address={impact.raterAddress} profile={impactProfile} size="small" />
                        <IdentityLabel address={impact.raterAddress} profile={impactProfile} />
                      </div>
                      <strong>{formatNumber(impact.impact)}</strong>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
      )}
    </>
  );
}

function PolicyFooter({ policy, summary }: { policy: TrustPolicy | null; summary: TrustSummary | null }) {
  if (!policy && !summary) {
    return null;
  }

  return (
    <footer className="policy-footer">
      <span>Active weight: {categoryLabel(summary?.activeWeightCategory ?? policy?.activeWeightCategory ?? 'SUBJECT')}</span>
      <span>Rating cooldown: {formatNumber(policy?.accountRatingChangeCooldownBlocks)} blocks</span>
      <span>Positive branches: {formatNumber(policy?.positiveMinBranchCount)}</span>
      <span>Suspicious raters: {formatNumber(policy?.suspiciousMinRaterCount)}</span>
      <span>Snapshot: {formatDate(summary?.snapshotTimestamp)}</span>
    </footer>
  );
}

export default function App() {
  const [accountDataByAddress, setAccountDataByAddress] = useState<AccountDataByAddress>({});
  const [accountSort, setAccountSort] = useState<AccountSortState>(DEFAULT_ACCOUNT_SORT);
  const [category, setCategory] = useState<AccountRatingCategory>('SUBJECT');
  const [data, setData] = useState<ExplorerState>(EMPTY_EXPLORER_STATE);
  const [displaySettings, setDisplaySettings] = useState(getInitialDisplaySettings);
  const [detail, setDetail] = useState<AccountDetailState>({
    explanation: null,
    loading: false,
    profile: null,
    publicKey: null,
  });
  const [detailReloadToken, setDetailReloadToken] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [identityProfiles, setIdentityProfiles] = useState<IdentityProfilesByAddress>({});
  const [loading, setLoading] = useState(true);
  const [openRateAddress, setOpenRateAddress] = useState<string | null>(null);
  const [pendingRatings, setPendingRatings] = useState<PendingRatingsByKey>({});
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [self, setSelf] = useState<SelfAccount | null>(null);
  const [statusFilter, setStatusFilter] = useState<TrustStatus | 'ALL'>('ALL');
  const [view, setView] = useState<ViewMode>('accounts');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchToggleRef = useRef<HTMLButtonElement>(null);
  const viewSelectRef = useRef<HTMLSelectElement>(null);
  // Set when leaving the detail takeover so we restore focus to the view selector once the list
  // re-mounts (the AccountDetail Back button it lived on has been unmounted).
  const restoreListFocusRef = useRef(false);

  const ratingActionAvailable = (data.bridge?.actions ?? []).includes('RATE_ACCOUNT');

  const loadData = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) {
      setLoading(true);
    }
    setError(null);

    try {
      const [bridge, nodeStatus, summary, policy, derivations, ratings, changes, resources] = await Promise.all([
        getBridgeState(),
        getNodeStatus(),
        getTrustSummary(),
        getTrustPolicy(),
        getTrustDerivation({ category, limit: 250 }),
        getAccountRatings({ category, limit: 1000 }),
        getTrustChanges({ category, limit: 25 }),
        getResourceRatings({ limit: 25, reverse: true }),
      ]);

      setData({
        bridge,
        changes,
        derivations,
        nodeStatus,
        policy,
        ratings,
        resources,
        summary,
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Trust data could not be loaded.');
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [category]);

  // Hold the latest loadData so the confirmation poll can refresh without depending on its identity
  // (loadData changes on category/account switches, which would otherwise reset the poll timer).
  const loadDataRef = useRef(loadData);
  useEffect(() => {
    loadDataRef.current = loadData;
  }, [loadData]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    // Attempt identity resolution whenever a Home bridge is present. resolveSelfAccount fails
    // gracefully if GET_SELECTED_ACCOUNT is unsupported, so we do not gate on the advertised
    // action list (which may omit read actions even when Home supports them).
    if (!data.bridge?.isHomeBridge) {
      setSelf(null);
      return;
    }

    let cancelled = false;

    resolveSelfAccount()
      .then((account) => {
        if (!cancelled) {
          setSelf(account);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSelf(null);
        }
      });

    return () => {
      cancelled = true;
    };
    // Depend on the primitive, not the bridge object: getBridgeState() returns a fresh object on
    // every loadData, which would otherwise re-resolve identity on every refresh.
  }, [data.bridge?.isHomeBridge]);

  useEffect(() => {
    applyDisplaySettings(displaySettings);
  }, [displaySettings]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      setDisplaySettings((current) => getDisplaySettingsUpdateFromMessage(event.data, current) ?? current);
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  // Clear the query on close so a hidden search never silently filters the list. On close (e.g. via
  // Escape in the input, which unmounts it) return focus to the toggle so keyboard users keep an anchor.
  const toggleSearch = useCallback(() => {
    setSearchOpen((open) => {
      const next = !open;

      if (!next) {
        setQuery('');
        searchToggleRef.current?.focus();
      }

      return next;
    });
  }, []);

  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
    }
  }, [searchOpen]);

  const handleBack = useCallback(() => {
    restoreListFocusRef.current = true;
    setSelectedAddress(null);
  }, []);

  // Switching the view from the toolbar dropdown also exits any open detail takeover, so the chosen
  // view's list/graph is what comes into focus.
  const handleViewChange = useCallback((next: ViewMode) => {
    setView(next);
    setSelectedAddress(null);
  }, []);

  // After Back returns to the list, move focus to the view selector so keyboard focus is not lost
  // to <body>. Runs once per return; the flag prevents stealing focus on unrelated re-renders.
  useEffect(() => {
    if (!selectedAddress && restoreListFocusRef.current) {
      restoreListFocusRef.current = false;
      viewSelectRef.current?.focus();
    }
  }, [selectedAddress]);

  const changeAccountSort = useCallback((key: AccountSortKey) => {
    setAccountSort((current) => {
      const existingIndex = current.findIndex((entry) => entry.key === key);

      // Already the primary column: just flip its direction.
      if (existingIndex === 0) {
        const [primary, ...rest] = current;
        return [{ direction: primary.direction === 'asc' ? 'desc' : 'asc', key }, ...rest];
      }

      // Already a tiebreaker: promote it to primary, preserving its direction.
      if (existingIndex > 0) {
        return [current[existingIndex], ...current.filter((entry) => entry.key !== key)];
      }

      // New column: make it primary and keep the previous columns as tiebreakers.
      return [{ direction: getDefaultAccountSortDirection(key), key }, ...current];
    });
  }, []);

  const filteredDerivations = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const searched = normalizedQuery
      ? filterDerivations(data.derivations, query).concat(
          data.derivations.filter((derivation) => {
            const profile = identityProfiles[derivation.accountAddress];
            return profile?.name?.toLowerCase().includes(normalizedQuery);
          }),
        )
      : data.derivations;
    const uniqueSearched = [...new Map(searched.map((derivation) => [derivation.accountAddress, derivation])).values()];

    if (statusFilter === 'ALL') {
      return uniqueSearched;
    }

    return uniqueSearched.filter((derivation) => derivation.derivedTrustStatus === statusFilter);
  }, [data.derivations, identityProfiles, query, statusFilter]);

  // Derive from the unfiltered list so the full-width detail survives search/status-filter changes
  // and search close. The table row highlight and graph still key off filteredDerivations.
  const selectedDerivation = useMemo(
    () => data.derivations.find((derivation) => derivation.accountAddress === selectedAddress) ?? null,
    [data.derivations, selectedAddress],
  );

  const graph = useMemo(
    () => createTrustGraphModel(filteredDerivations, data.ratings, category),
    [category, data.ratings, filteredDerivations],
  );

  // What the current user has rated each account in the selected category (the loaded ratings are
  // already category-scoped). Drives the "You rated" column and the default sort.
  const youRatedByAddress = useMemo<RatingsByAddress>(() => {
    if (!self) {
      return {};
    }

    const byAddress: RatingsByAddress = {};

    for (const rating of data.ratings) {
      if (rating.raterAddress === self.address && rating.category === category) {
        byAddress[rating.targetAddress] = rating.rating;
      }
    }

    return byAddress;
  }, [category, data.ratings, self]);

  // Pending (submitted-but-unconfirmed) ratings for the selected category, keyed by target address.
  const pendingByAddress = useMemo<RatingsByAddress>(() => {
    const byAddress: RatingsByAddress = {};

    for (const entry of Object.values(pendingRatings)) {
      if (entry.category === category) {
        byAddress[entry.targetAddress] = entry.rating;
      }
    }

    return byAddress;
  }, [category, pendingRatings]);

  useEffect(() => {
    const addresses = new Set<string>();

    for (const derivation of data.derivations) {
      addresses.add(derivation.accountAddress);
    }

    for (const rating of data.ratings) {
      addresses.add(rating.raterAddress);
      addresses.add(rating.targetAddress);
    }

    for (const change of data.changes) {
      addresses.add(change.accountAddress);
    }

    const missingAddresses = [...addresses].filter((address) => !identityProfiles[address]);

    if (missingAddresses.length === 0) {
      return;
    }

    let cancelled = false;
    const actions = data.bridge?.actions ?? [];

    Promise.allSettled(missingAddresses.map((address) => loadIdentityProfile(address, actions))).then((results) => {
      if (cancelled) {
        return;
      }

      setIdentityProfiles((current) => {
        const next = { ...current };

        for (const result of results) {
          if (result.status === 'fulfilled') {
            next[result.value.address] = result.value;
          }
        }

        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [data.bridge?.actions, data.changes, data.derivations, data.ratings, identityProfiles]);

  useEffect(() => {
    const missingAddresses = [...new Set(data.derivations.map((derivation) => derivation.accountAddress))].filter(
      (address) => !accountDataByAddress[address],
    );

    if (missingAddresses.length === 0) {
      return;
    }

    let cancelled = false;

    Promise.allSettled(missingAddresses.map((address) => getAccountData(address))).then((results) => {
      if (cancelled) {
        return;
      }

      const accountRows = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));

      if (accountRows.length === 0) {
        return;
      }

      setAccountDataByAddress((current) => {
        const next = { ...current };

        for (const account of accountRows) {
          next[account.address] = account;
        }

        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [accountDataByAddress, data.derivations]);

  useEffect(() => {
    const publicKey = selectedDerivation?.accountPublicKey;

    if (!publicKey) {
      setDetail({ explanation: null, loading: false, profile: null, publicKey: null });
      return;
    }

    let cancelled = false;
    setDetail((current) => ({
      explanation: current.publicKey === publicKey ? current.explanation : null,
      loading: true,
      profile: current.publicKey === publicKey ? current.profile : null,
      publicKey,
    }));

    Promise.all([getTrustProfile(publicKey), getTrustExplanation(publicKey)])
      .then(([profile, explanation]) => {
        if (!cancelled) {
          setDetail({ explanation, loading: false, profile, publicKey });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDetail({ explanation: null, loading: false, profile: null, publicKey });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [detailReloadToken, selectedDerivation?.accountPublicKey]);

  const handleRatingSubmitted = useCallback((entry: PendingRatingEntry) => {
    setPendingRatings((current) => ({
      ...current,
      [pendingRatingKey(entry.category, entry.targetAddress)]: entry,
    }));
  }, []);

  // Confirm pending ratings in the background: poll each one's cooldown until the active rating
  // matches what was submitted, then drop it and silently refresh so the confirmed value shows.
  // This runs independently of any open panel, so several ratings can confirm concurrently.
  useEffect(() => {
    const entries = Object.entries(pendingRatings);

    if (entries.length === 0) {
      return;
    }

    let cancelled = false;
    let timer = 0;

    const poll = async () => {
      const confirmedKeys: string[] = [];

      await Promise.all(
        entries.map(async ([key, entry]) => {
          try {
            const cooldown = await getRatingCooldown({
              category: entry.category,
              rater: entry.raterPublicKey,
              target: entry.targetPublicKey,
            });
            const expected = entry.rating === 0 ? null : entry.rating;

            if (cooldown.activeRating === expected) {
              confirmedKeys.push(key);
            }
          } catch {
            // Keep waiting on transient errors.
          }
        }),
      );

      if (cancelled) {
        return;
      }

      if (confirmedKeys.length > 0) {
        // Refresh the trust data first and only drop the optimistic pending entry once the confirmed
        // value is in `data.ratings`. Clearing before the reload completes would briefly leave the
        // "You rated" cell blank (pending gone, confirmed value not yet loaded).
        setDetailReloadToken((token) => token + 1);
        await loadDataRef.current({ silent: true });

        if (cancelled) {
          return;
        }

        setPendingRatings((current) => {
          const next = { ...current };

          for (const key of confirmedKeys) {
            // Only clear if the value still matches — the user may have re-rated while we polled.
            if (next[key] && next[key].rating === pendingRatings[key].rating) {
              delete next[key];
            }
          }

          return next;
        });
      }

      if (!cancelled) {
        timer = window.setTimeout(() => void poll(), PENDING_CONFIRM_POLL_MS);
      }
    };

    timer = window.setTimeout(() => void poll(), PENDING_CONFIRM_POLL_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pendingRatings]);

  const selectDerivation = (derivation: TrustDerivation) => {
    setSelectedAddress(derivation.accountAddress);
  };

  const selectNode = (node: TrustGraphNode) => {
    setSelectedAddress(node.address);
  };

  const trustIconSrc = getQdnAssetUrl(trustIconUrl);

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="app-header__identity">
          <span className="app-header__mark" aria-hidden="true">
            <img alt="" src={trustIconSrc} />
          </span>
          <div>
            <div className="eyebrow">Qortium</div>
            <h1>Trust Explorer</h1>
          </div>
        </div>
        <div className="header-actions">
          <NodeSyncPill nodeStatus={data.nodeStatus} />
          <button
            aria-expanded={searchOpen}
            aria-label={searchOpen ? 'Hide account search' : 'Search accounts'}
            className={`icon-button ${searchOpen ? 'icon-button--active' : ''}`}
            onClick={toggleSearch}
            ref={searchToggleRef}
            title="Search accounts"
            type="button"
          >
            <Search size={18} />
          </button>
          <span className="runtime-pill">{data.bridge?.ui ?? 'Loading'}</span>
          <button className="icon-button" disabled={loading} onClick={() => void loadData()} title="Refresh" type="button">
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      <section className="toolbar">
        <div className="toolbar__category">
          <CategoryTabs category={category} onChange={setCategory} />
          <p className="category-description">{categoryDescription(category)}</p>
        </div>
        <div className="toolbar__controls">
          {searchOpen ? (
            <div className="search-field">
              <Search size={17} />
              <input
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    toggleSearch();
                  }
                }}
                placeholder="Search account or public key"
                ref={searchInputRef}
                value={query}
              />
              <button aria-label="Close search" className="search-field__close" onClick={toggleSearch} type="button">
                <X size={15} />
              </button>
            </div>
          ) : null}
          <ViewSelect onChange={handleViewChange} selectRef={viewSelectRef} view={view} />
          <select
            aria-label="Trust status"
            onChange={(event) => setStatusFilter(event.target.value as TrustStatus | 'ALL')}
            value={statusFilter}
          >
            <option value="ALL">All statuses</option>
            {TRUST_STATUSES.map((status) => (
              <option key={status} value={status}>
                {statusLabel(status)}
              </option>
            ))}
          </select>
        </div>
      </section>

      {error ? (
        <div className="error-banner">
          <AlertTriangle size={18} />
          {error}
        </div>
      ) : null}

      <section className="workspace">
        <div className="main-panel">
          {selectedDerivation ? (
            <AccountDetail
              category={category}
              detail={detail}
              onBack={handleBack}
              onRatingSubmitted={handleRatingSubmitted}
              pendingRating={pendingByAddress[selectedDerivation.accountAddress]}
              profile={identityProfiles[selectedDerivation.accountAddress]}
              profiles={identityProfiles}
              ratingActionAvailable={ratingActionAvailable}
              self={self}
              selectedDerivation={selectedDerivation}
            />
          ) : (
            <>
              {loading ? (
                <div className="loading-panel">
                  <div className="skeleton-block" />
                  <div className="skeleton-block short" />
                  <div className="skeleton-table" />
                </div>
              ) : view === 'accounts' ? (
                <AccountsTable
                  accountDataByAddress={accountDataByAddress}
                  category={category}
                  derivations={filteredDerivations}
                  onRate={setOpenRateAddress}
                  onRatingSubmitted={handleRatingSubmitted}
                  onSelect={selectDerivation}
                  onSort={changeAccountSort}
                  openRateAddress={openRateAddress}
                  pendingByAddress={pendingByAddress}
                  profiles={identityProfiles}
                  ratingActionAvailable={ratingActionAvailable}
                  self={self}
                  selectedAddress={selectedAddress ?? undefined}
                  sort={accountSort}
                  youRatedByAddress={youRatedByAddress}
                />
              ) : view === 'graph' ? (
                <TrustGraph
                  graph={graph}
                  onSelect={selectNode}
                  profiles={identityProfiles}
                  selectedAddress={selectedAddress ?? undefined}
                />
              ) : view === 'changes' ? (
                <ChangesTable changes={data.changes} profiles={identityProfiles} />
              ) : (
                <ResourceRatingsTable resources={data.resources} />
              )}
            </>
          )}
        </div>
      </section>

      <PolicyFooter policy={data.policy} summary={data.summary} />
    </main>
  );
}
