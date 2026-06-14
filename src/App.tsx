import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  CircleDot,
  Database,
  GitBranch,
  Layers,
  RefreshCw,
  Search,
  Shield,
  Table2,
  UserRound,
} from 'lucide-react';
import { createTrustGraphModel, filterDerivations, type TrustGraphModel, type TrustGraphNode } from './graphModel';
import {
  getAvatarFallbackCharacter,
  getIdentityLabel,
  loadIdentityProfile,
} from './identityProfiles';
import { getBridgeState } from './qdnRequest';
import {
  getAccountData,
  getAccountRatings,
  getNodeStatus,
  getResourceRatings,
  getTrustChanges,
  getTrustDerivation,
  getTrustExplanation,
  getTrustPolicy,
  getTrustProfile,
  getTrustSummary,
} from './trustApi';
import {
  applyDisplaySettings,
  getDisplaySettingsUpdateFromMessage,
  getInitialDisplaySettings,
} from './displaySettings';
import {
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
  AccountTrustExplanation,
  AccountTrustProfile,
  BridgeState,
  IdentityProfile,
  IdentityProfilesByAddress,
  NodeStatus,
  ResourceRatingSummary,
  TrustDerivation,
  TrustPolicy,
  TrustStatus,
  TrustStatusChange,
  TrustSummary,
} from './types';

type ViewMode = 'graph' | 'accounts' | 'changes' | 'resources';
type AccountSortKey = 'account' | 'status' | 'level' | 'blocksMinted' | 'score' | 'ratings' | 'voteWeight' | 'seed';
type SortDirection = 'asc' | 'desc';
type AccountSortState = {
  direction: SortDirection;
  key: AccountSortKey;
};
type AccountDataByAddress = Record<string, AccountData>;

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

function Metric({
  icon,
  label,
  value,
  tone = 'neutral',
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  tone?: 'neutral' | 'positive' | 'negative' | 'gold';
}) {
  return (
    <div className={`metric metric-${tone}`}>
      <div className="metric-icon">{icon}</div>
      <div>
        <div className="metric-label">{label}</div>
        <div className="metric-value">{value}</div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: TrustStatus }) {
  return <span className={`badge badge-${statusTone(status)}`}>{statusLabel(status)}</span>;
}

function getDefaultAccountSortDirection(key: AccountSortKey): SortDirection {
  return key === 'account' ? 'asc' : 'desc';
}

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

function ViewTabs({ view, onChange }: { view: ViewMode; onChange: (view: ViewMode) => void }) {
  const views: { icon: ReactNode; label: string; value: ViewMode }[] = [
    { icon: <GitBranch size={16} />, label: 'Graph', value: 'graph' },
    { icon: <Table2 size={16} />, label: 'Accounts', value: 'accounts' },
    { icon: <ArrowDownUp size={16} />, label: 'Changes', value: 'changes' },
    { icon: <Layers size={16} />, label: 'Resources', value: 'resources' },
  ];

  return (
    <div className="view-tabs" aria-label="Explorer view">
      {views.map((candidate) => (
        <button
          className={candidate.value === view ? 'active' : ''}
          key={candidate.value}
          onClick={() => onChange(candidate.value)}
          type="button"
        >
          {candidate.icon}
          {candidate.label}
        </button>
      ))}
    </div>
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
    case 'voteWeight':
      return left.derivedTrustWeightPercent - right.derivedTrustWeightPercent;
    case 'seed':
      return Number(left.mintingSeedMember) - Number(right.mintingSeedMember);
    default:
      return 0;
  }
}

function getAriaSort(sort: AccountSortState, key: AccountSortKey) {
  if (sort.key !== key) {
    return 'none';
  }

  return sort.direction === 'asc' ? 'ascending' : 'descending';
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
  const active = sort.key === sortKey;
  const Icon = active ? (sort.direction === 'asc' ? ArrowUp : ArrowDown) : ArrowDownUp;

  return (
    <button
      className={`sort-header ${active ? 'active' : ''}`}
      onClick={() => onSort(sortKey)}
      title={`Sort by ${label}`}
      type="button"
    >
      <span>{label}</span>
      <Icon aria-hidden="true" size={13} />
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

  return (
    <div className="graph-surface">
      <svg aria-label="Trust graph" className="trust-graph" role="img" viewBox="0 0 960 520">
        <g className="graph-lanes">
          {TRUST_STATUSES.map((status, index) => (
            <g key={status}>
              <rect height="520" width="192" x={index * 192} y="0" />
              <text x={index * 192 + 20} y="28">
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
  onSelect,
  onSort,
  profiles,
  selectedAddress,
  sort,
}: {
  accountDataByAddress: AccountDataByAddress;
  category: AccountRatingCategory;
  derivations: TrustDerivation[];
  onSelect: (derivation: TrustDerivation) => void;
  onSort: (key: AccountSortKey) => void;
  profiles: IdentityProfilesByAddress;
  selectedAddress?: string;
  sort: AccountSortState;
}) {
  const sortedDerivations = useMemo(
    () =>
      derivations
        .map((derivation, index) => ({ derivation, index }))
        .sort((left, right) => {
          const primarySort = compareAccountRows(
            left.derivation,
            right.derivation,
            sort.key,
            category,
            profiles,
            accountDataByAddress,
          );

          if (primarySort !== 0) {
            return sort.direction === 'asc' ? primarySort : -primarySort;
          }

          return compareAccountLabels(left.derivation, right.derivation, profiles) || left.index - right.index;
        })
        .map(({ derivation }) => derivation),
    [accountDataByAddress, category, derivations, profiles, sort.direction, sort.key],
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
            <th aria-sort={getAriaSort(sort, 'voteWeight')}>
              <SortHeader label="Vote weight" onSort={onSort} sort={sort} sortKey="voteWeight" />
            </th>
            <th aria-sort={getAriaSort(sort, 'seed')}>
              <SortHeader label="Seed" onSort={onSort} sort={sort} sortKey="seed" />
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedDerivations.map((derivation) => {
            const categoryData = getDerivationCategory(derivation, category);
            const inbound = categoryData?.inboundRatings;
            const profile = profiles[derivation.accountAddress];
            const accountData = accountDataByAddress[derivation.accountAddress];

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
                <td>{formatPercent(derivation.derivedTrustWeightPercent)}</td>
                <td>{derivation.mintingSeedMember ? 'Yes' : 'No'}</td>
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

function AccountPanel({
  category,
  detail,
  profile,
  profiles,
  selectedDerivation,
}: {
  category: AccountRatingCategory;
  detail: AccountDetailState;
  profile?: IdentityProfile;
  profiles: IdentityProfilesByAddress;
  selectedDerivation: TrustDerivation | null;
}) {
  if (detail.loading) {
    return (
      <aside className="detail-panel">
        <div className="panel-title">
          <UserRound size={18} />
          Account
        </div>
        <div className="skeleton-block" />
        <div className="skeleton-block short" />
      </aside>
    );
  }

  if (!selectedDerivation) {
    return (
      <aside className="detail-panel">
        <div className="panel-title">
          <UserRound size={18} />
          Account
        </div>
        <EmptyState icon={<CircleDot size={18} />} text="Select an account to inspect its trust profile." />
      </aside>
    );
  }

  const profileCategory = detail.profile?.categories.find((candidate) => candidate.category === category);
  const explanationCategory = detail.explanation?.categories.find((candidate) => candidate.category === category);
  const fallbackCategory = selectedDerivation.categories.find((candidate) => candidate.category === category);
  const label = getIdentityLabel(profile, selectedDerivation.accountAddress);

  return (
    <aside className="detail-panel">
      <div className="panel-title">
        <UserRound size={18} />
        Account
      </div>
      <div className="account-identity">
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
          <strong>{formatPercent(detail.profile?.trustWeightPercent ?? selectedDerivation.derivedTrustWeightPercent)}</strong>
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
          <span className="positive">+{formatNumber(profileCategory?.inboundRatings.positiveRatingCount ?? 0)}</span>
          <span className="negative">-{formatNumber(profileCategory?.inboundRatings.negativeRatingCount ?? 0)}</span>
          <span>{formatNumber(profileCategory?.outboundRatings.totalRatingCount ?? 0)} outbound</span>
        </div>
      </div>
      <div className="mini-section">
        <h3>Top Impacts</h3>
        {(explanationCategory?.topPositiveImpacts.length ?? 0) + (explanationCategory?.topNegativeImpacts.length ?? 0) ===
        0 ? (
          <p className="muted">No impact rows for this category.</p>
        ) : (
          <ul className="impact-list">
            {[...(explanationCategory?.topPositiveImpacts ?? []), ...(explanationCategory?.topNegativeImpacts ?? [])].map(
              (impact) => {
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
              },
            )}
          </ul>
        )}
      </div>
    </aside>
  );
}

function SummaryRail({ state }: { state: ExplorerState }) {
  const syncLabel =
    state.nodeStatus?.syncPhase ??
    (state.nodeStatus?.isSynchronizing ? `${formatPercent(state.nodeStatus.syncPercent)} sync` : 'Connected');

  return (
    <div className="summary-rail">
      <Metric icon={<Database size={18} />} label="Node" value={syncLabel} />
      <Metric
        icon={<Shield size={18} />}
        label="Snapshot Accounts"
        value={formatNumber(state.summary?.snapshotAccountCount)}
        tone="positive"
      />
      <Metric
        icon={<Activity size={18} />}
        label="Active Ratings"
        value={formatNumber(state.summary?.activeRatingCount)}
      />
      <Metric
        icon={<AlertTriangle size={18} />}
        label="Suspicious"
        value={formatNumber(state.summary?.suspiciousCount)}
        tone={state.summary?.suspiciousCount ? 'negative' : 'neutral'}
      />
      <Metric
        icon={<CircleDot size={18} />}
        label="Snapshot Height"
        value={formatNumber(state.summary?.snapshotHeight)}
        tone="gold"
      />
    </div>
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
  const [accountSort, setAccountSort] = useState<AccountSortState>({
    direction: 'asc',
    key: 'account',
  });
  const [category, setCategory] = useState<AccountRatingCategory>('SUBJECT');
  const [data, setData] = useState<ExplorerState>(EMPTY_EXPLORER_STATE);
  const [displaySettings, setDisplaySettings] = useState(getInitialDisplaySettings);
  const [detail, setDetail] = useState<AccountDetailState>({
    explanation: null,
    loading: false,
    profile: null,
    publicKey: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [identityProfiles, setIdentityProfiles] = useState<IdentityProfilesByAddress>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<TrustStatus | 'ALL'>('ALL');
  const [view, setView] = useState<ViewMode>('graph');

  const loadData = useCallback(async () => {
    setLoading(true);
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

      if (!selectedAddress && derivations.length > 0) {
        setSelectedAddress(derivations[0].accountAddress);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Trust data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [category, selectedAddress]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

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

  const changeAccountSort = useCallback((key: AccountSortKey) => {
    setAccountSort((current) => ({
      direction:
        current.key === key
          ? current.direction === 'asc'
            ? 'desc'
            : 'asc'
          : getDefaultAccountSortDirection(key),
      key,
    }));
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

  const selectedDerivation = useMemo(
    () => filteredDerivations.find((derivation) => derivation.accountAddress === selectedAddress) ?? null,
    [filteredDerivations, selectedAddress],
  );

  const graph = useMemo(
    () => createTrustGraphModel(filteredDerivations, data.ratings, category),
    [category, data.ratings, filteredDerivations],
  );

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
  }, [selectedDerivation?.accountPublicKey]);

  const selectDerivation = (derivation: TrustDerivation) => {
    setSelectedAddress(derivation.accountAddress);
  };

  const selectNode = (node: TrustGraphNode) => {
    setSelectedAddress(node.address);
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <div className="eyebrow">Qortium</div>
          <h1>Trust Explorer</h1>
        </div>
        <div className="header-actions">
          <span className="runtime-pill">{data.bridge?.ui ?? 'Loading'}</span>
          <button className="icon-button" disabled={loading} onClick={() => void loadData()} title="Refresh" type="button">
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      <SummaryRail state={data} />

      <section className="toolbar">
        <CategoryTabs category={category} onChange={setCategory} />
        <div className="search-field">
          <Search size={17} />
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search account or public key"
            value={query}
          />
        </div>
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
      </section>

      {error ? (
        <div className="error-banner">
          <AlertTriangle size={18} />
          {error}
        </div>
      ) : null}

      <section className="workspace">
        <div className="main-panel">
          <ViewTabs onChange={setView} view={view} />
          {loading ? (
            <div className="loading-panel">
              <div className="skeleton-block" />
              <div className="skeleton-block short" />
              <div className="skeleton-table" />
            </div>
          ) : view === 'graph' ? (
            <TrustGraph
              graph={graph}
              onSelect={selectNode}
              profiles={identityProfiles}
              selectedAddress={selectedAddress ?? undefined}
            />
          ) : view === 'accounts' ? (
            <AccountsTable
              accountDataByAddress={accountDataByAddress}
              category={category}
              derivations={filteredDerivations}
              onSelect={selectDerivation}
              onSort={changeAccountSort}
              profiles={identityProfiles}
              selectedAddress={selectedAddress ?? undefined}
              sort={accountSort}
            />
          ) : view === 'changes' ? (
            <ChangesTable changes={data.changes} profiles={identityProfiles} />
          ) : (
            <ResourceRatingsTable resources={data.resources} />
          )}
        </div>
        <AccountPanel
          category={category}
          detail={detail}
          profile={selectedDerivation ? identityProfiles[selectedDerivation.accountAddress] : undefined}
          profiles={identityProfiles}
          selectedDerivation={selectedDerivation}
        />
      </section>

      <PolicyFooter policy={data.policy} summary={data.summary} />
    </main>
  );
}
