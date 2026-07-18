import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Info,
  Maximize2,
  Minimize2,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { changeAccountSortState, getTrustDerivationServerSort } from './accountSort';
import { AccountsTable, type RatingValuesByAccountCategory } from './components/AccountsTable';
import { AccountDetail } from './components/AccountDetail';
import { ChangesTable } from './components/ChangesTable';
import { NodeSyncPill } from './components/Identity';
import { applyDisplaySettings, getDisplaySettingsUpdateFromMessage, getInitialDisplaySettings } from './displaySettings';
import { filterDerivations } from './derivationFilter';
import {
  categoryDescription,
  categoryLabel,
  formatRuntimeLabel,
  statusLabel,
  TRUST_CATEGORIES,
  TRUST_STATUSES,
} from './format';
import type { TrustGraphDirection, TrustGraphNode, TrustGraphSign } from './graphModel';
import { loadIdentityProfiles } from './identityProfiles';
import { setTranslationLanguage, t } from './i18n';
import { getBridgeState } from './qdnRequest';
import { PENDING_CONFIRM_POLL_MS, pendingRatingKey } from './ratingControl';
import { isSelectedAccountChangedMessage } from './selectedAccountMessage';
import {
  getAccountRatingsPage,
  getNodeStatus,
  getRatingCooldown,
  getTrustChanges,
  getTrustDerivationPage,
  getTrustExplanation,
  getTrustGraph,
  getTrustPolicy,
  getTrustProfile,
  getTrustSummary,
  resolveSelfAccount,
} from './trustApi';
import type {
  AccountRating,
  AccountRatingCategory,
  IdentityProfilesByAddress,
  SelfAccount,
  TrustDerivation,
  TrustGraph as ServerTrustGraph,
  TrustStatus,
} from './types';
import type {
  AccountDetailState,
  AccountSortKey,
  AccountSortState,
  ExplorerState,
  PendingRatingEntry,
  PendingRatingsByKey,
  ViewMode,
} from './viewTypes';

const TrustGraphView = lazy(() => import('./components/TrustGraphView'));
const APP_VERSION = __APP_VERSION__;
const PAGE_SIZE = 250;
const RATING_PAGE_SIZE = 1000;

const DEFAULT_ACCOUNT_SORT: AccountSortState = [
  { direction: 'desc', key: 'blocksMinted' },
  { direction: 'asc', key: 'account' },
];

const EMPTY_EXPLORER_STATE: ExplorerState = {
  bridge: null,
  changes: [],
  derivations: [],
  nodeStatus: null,
  policy: null,
  ratings: [],
  summary: null,
};

const ROLE_FLOW: AccountRatingCategory[] = ['MANAGER', 'TRAINER', 'PLAYER', 'SUBJECT'];

async function getAllRatings(options: { rater?: string; target?: string }) {
  const ratings: AccountRating[] = [];
  let offset: number | null = 0;

  while (offset !== null && ratings.length < 20_000) {
    const page = await getAccountRatingsPage({
      ...options,
      limit: RATING_PAGE_SIZE,
      offset,
    });
    ratings.push(...page.ratings);
    offset = page.nextOffset;
  }

  return ratings;
}

function CategorySelect({
  category,
  onChange,
}: {
  category: AccountRatingCategory;
  onChange: (category: AccountRatingCategory) => void;
}) {
  return (
    <label className="field-control">
      <span>{t('label.trustCategory')}</span>
      <select
        aria-label={t('label.trustCategory')}
        onChange={(event) => onChange(event.target.value as AccountRatingCategory)}
        value={category}
      >
        {TRUST_CATEGORIES.map((candidate) => (
          <option key={candidate} value={candidate}>
            {categoryLabel(candidate)}
          </option>
        ))}
      </select>
    </label>
  );
}

function FullscreenButton({
  isFullscreen,
  onToggle,
}: {
  isFullscreen: boolean;
  onToggle: () => void;
}) {
  const label = isFullscreen ? t('action.exitFullscreen') : t('action.enterFullscreen');

  return (
    <button
      aria-label={label}
      className="fullscreen-toggle"
      onClick={onToggle}
      title={label}
      type="button"
    >
      {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
    </button>
  );
}

function TrustFlowGuide() {
  return (
    <section className="trust-flow-guide" aria-labelledby="trust-flow-guide-title">
      <div>
        <p className="eyebrow">{t('trustFlow.eyebrow')}</p>
        <h2 id="trust-flow-guide-title">{t('trustFlow.title')}</h2>
        <p>{t('trustFlow.intro')}</p>
      </div>
      <ol>
        {ROLE_FLOW.map((role, index) => (
          <li key={role}>
            <strong>{categoryLabel(role)}</strong>
            <span>{categoryDescription(role)}</span>
            {index < ROLE_FLOW.length - 1 ? <span aria-hidden="true">→</span> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function App() {
  const [accountSort, setAccountSort] = useState<AccountSortState>(DEFAULT_ACCOUNT_SORT);
  const [category, setCategory] = useState<AccountRatingCategory>('SUBJECT');
  const [data, setData] = useState<ExplorerState>(EMPTY_EXPLORER_STATE);
  const [derivationLimit, setDerivationLimit] = useState(PAGE_SIZE);
  const [derivationTotal, setDerivationTotal] = useState<number | null>(null);
  const [detail, setDetail] = useState<AccountDetailState>({
    explanation: null,
    loading: false,
    profile: null,
    publicKey: null,
  });
  const [detailReloadToken, setDetailReloadToken] = useState(0);
  const [displaySettings, setDisplaySettings] = useState(getInitialDisplaySettings);
  const [error, setError] = useState<string | null>(null);
  const [graphDepth, setGraphDepth] = useState<1 | 2>(1);
  const [graphDirection, setGraphDirection] = useState<TrustGraphDirection>('both');
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphRootAddress, setGraphRootAddress] = useState('');
  const [graphSelectedAddress, setGraphSelectedAddress] = useState<string | null>(null);
  const [graphSign, setGraphSign] = useState<TrustGraphSign>('both');
  const [identityProfiles, setIdentityProfiles] = useState<IdentityProfilesByAddress>({});
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingRatings, setPendingRatings] = useState<PendingRatingsByKey>({});
  const [query, setQuery] = useState('');
  const [receivedRatings, setReceivedRatings] = useState<AccountRating[] | undefined>(undefined);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [self, setSelf] = useState<SelfAccount | null>(null);
  const [serverGraph, setServerGraph] = useState<ServerTrustGraph | null>(null);
  const [statusFilter, setStatusFilter] = useState<TrustStatus | 'ALL'>('ALL');
  const [toast, setToast] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>('accounts');
  const [youRatedRatings, setYouRatedRatings] = useState<AccountRating[]>([]);

  const live = true;
  const loadTokenRef = useRef(0);
  const restoreListFocusRef = useRef(false);
  const navRef = useRef<HTMLElement>(null);
  const selfRef = useRef(self);
  const ratingActionAvailable = (data.bridge?.actions ?? []).includes('RATE_ACCOUNT');
  const serverDerivationSort = useMemo(() => getTrustDerivationServerSort(accountSort), [accountSort]);

  // t() reads the active catalog synchronously. Set it during render so a Home language message
  // updates visible copy in the same render, while the effect below still owns DOM attributes.
  setTranslationLanguage(displaySettings.language);

  useEffect(() => {
    selfRef.current = self;
  }, [self]);

  const refreshYouRated = useCallback(async (account: SelfAccount | null = selfRef.current) => {
    if (!account?.publicKey) {
      setYouRatedRatings([]);
      return;
    }

    try {
      setYouRatedRatings(await getAllRatings({ rater: account.publicKey }));
    } catch (loadError) {
      console.warn('Failed to load current-account ratings', loadError);
    }
  }, []);

  const refreshSelectedAccount = useCallback(async () => {
    try {
      const [bridge, account] = await Promise.all([getBridgeState(), resolveSelfAccount()]);
      setData((current) => ({ ...current, bridge }));
      setSelf(account);
      setPendingRatings({});
      setDetailReloadToken((token) => token + 1);
      await refreshYouRated(account);
    } catch (accountError) {
      console.warn('Failed to refresh selected account', accountError);
      setSelf(null);
      setYouRatedRatings([]);
      setPendingRatings({});
    }
  }, [refreshYouRated]);

  const loadData = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    const token = ++loadTokenRef.current;

    if (!silent) {
      setLoading(true);
      setError(null);
    }

    try {
      const [bridge, nodeStatus, summary, policy, derivationPage, changes] = await Promise.all([
        getBridgeState(),
        getNodeStatus(),
        getTrustSummary(),
        getTrustPolicy(),
        getTrustDerivationPage({
          category,
          limit: derivationLimit,
          live,
          ...serverDerivationSort,
        }),
        getTrustChanges({ limit: 100 }),
      ]);

      if (loadTokenRef.current !== token) {
        return;
      }

      setData({
        bridge,
        changes,
        derivations: derivationPage.derivations,
        nodeStatus,
        policy,
        ratings: [],
        summary,
      });
      setDerivationTotal(derivationPage.total);
    } catch (loadError) {
      if (loadTokenRef.current === token && !silent) {
        setError(loadError instanceof Error ? loadError.message : t('error.trustLoadFailed'));
      }
    } finally {
      if (loadTokenRef.current === token && !silent) {
        setLoading(false);
      }
    }
  }, [category, derivationLimit, serverDerivationSort]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!data.bridge?.isHomeBridge) {
      setSelf(null);
      setYouRatedRatings([]);
      return;
    }

    void refreshSelectedAccount();
  }, [data.bridge?.isHomeBridge, refreshSelectedAccount]);

  useEffect(() => {
    applyDisplaySettings(displaySettings);
  }, [displaySettings]);

  useEffect(() => {
    const readAccountFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      setSelectedAddress(params.get('account') ?? params.get('target'));
      const requestedView = params.get('view');

      if (requestedView === 'accounts' || requestedView === 'graph' || requestedView === 'changes') {
        setView(requestedView);
      } else {
        setView('accounts');
      }
    };

    readAccountFromUrl();
    window.addEventListener('popstate', readAccountFromUrl);

    return () => window.removeEventListener('popstate', readAccountFromUrl);
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source && event.source !== window.parent) {
        return;
      }

      setDisplaySettings((current) => getDisplaySettingsUpdateFromMessage(event.data, current) ?? current);

      if (isSelectedAccountChangedMessage(event.data)) {
        void refreshSelectedAccount();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [refreshSelectedAccount]);

  const openAccount = useCallback((address: string) => {
    if (!data.derivations.some((derivation) => derivation.accountAddress === address)) {
      setDerivationLimit(5_000);
    }
    setSelectedAddress(address);
    setIsFullscreen(false);
    setView('accounts');
    const url = new URL(window.location.href);
    url.searchParams.set('account', address);
    url.searchParams.set('view', 'accounts');
    url.searchParams.delete('target');
    window.history.pushState({}, '', url);
  }, [data.derivations]);

  const handleBack = useCallback(() => {
    restoreListFocusRef.current = true;
    setSelectedAddress(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('account');
    url.searchParams.delete('target');
    window.history.pushState({}, '', url);
  }, []);

  useEffect(() => {
    if (!selectedAddress && restoreListFocusRef.current) {
      restoreListFocusRef.current = false;
      navRef.current?.querySelector<HTMLButtonElement>('[aria-current="page"]')?.focus();
    }
  }, [selectedAddress]);

  const selectedDerivation = useMemo(
    () => data.derivations.find((derivation) => derivation.accountAddress === selectedAddress) ?? null,
    [data.derivations, selectedAddress],
  );

  useEffect(() => {
    if (
      selectedAddress &&
      !selectedDerivation &&
      !loading &&
      derivationLimit < 5_000 &&
      (data.derivations.length >= derivationLimit ||
        (derivationTotal !== null && data.derivations.length < derivationTotal))
    ) {
      setDerivationLimit(5_000);
    }
  }, [
    data.derivations.length,
    derivationLimit,
    derivationTotal,
    loading,
    selectedAddress,
    selectedDerivation,
  ]);

  useEffect(() => {
    const publicKey = selectedDerivation?.accountPublicKey;

    if (!publicKey) {
      setDetail({ explanation: null, loading: false, profile: null, publicKey: null });
      setReceivedRatings(undefined);
      return;
    }

    let cancelled = false;
    setDetail((current) => ({
      explanation: current.publicKey === publicKey ? current.explanation : null,
      loading: true,
      profile: current.publicKey === publicKey ? current.profile : null,
      publicKey,
    }));
    setReceivedRatings(undefined);

    Promise.all([
      getTrustProfile(publicKey),
      getTrustExplanation(publicKey, live),
      getAllRatings({ target: publicKey }),
    ])
      .then(([profile, explanation, ratings]) => {
        if (!cancelled) {
          setDetail({ explanation, loading: false, profile, publicKey });
          setReceivedRatings(ratings);
        }
      })
      .catch((detailError) => {
        console.warn('Failed to load account detail', detailError);
        if (!cancelled) {
          setDetail({ explanation: null, loading: false, profile: null, publicKey });
          setReceivedRatings([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [detailReloadToken, selectedDerivation?.accountPublicKey]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredDerivations = useMemo(() => {
    const statusFiltered =
      statusFilter === 'ALL'
        ? data.derivations
        : data.derivations.filter((derivation) => derivation.derivedTrustStatus === statusFilter);

    if (!normalizedQuery) {
      return statusFiltered;
    }

    const matchingAddresses = new Set(
      filterDerivations(statusFiltered, query).map((derivation) => derivation.accountAddress),
    );

    for (const derivation of statusFiltered) {
      if (identityProfiles[derivation.accountAddress]?.name?.toLowerCase().includes(normalizedQuery)) {
        matchingAddresses.add(derivation.accountAddress);
      }
    }

    return statusFiltered.filter((derivation) => matchingAddresses.has(derivation.accountAddress));
  }, [data.derivations, identityProfiles, normalizedQuery, query, statusFilter]);

  const youRatedByKey = useMemo<RatingValuesByAccountCategory>(() => {
    const byKey: RatingValuesByAccountCategory = {};

    for (const rating of youRatedRatings) {
      if (rating.rating !== 0) {
        byKey[pendingRatingKey(rating.category, rating.targetAddress)] = rating.rating;
      }
    }

    return byKey;
  }, [youRatedRatings]);

  const selectedYouRatedByCategory = useMemo(() => {
    if (!selectedDerivation) {
      return {};
    }

    return Object.fromEntries(
      TRUST_CATEGORIES.flatMap((role) => {
        const value = youRatedByKey[pendingRatingKey(role, selectedDerivation.accountAddress)];
        return value === undefined ? [] : [[role, value]];
      }),
    ) as Partial<Record<AccountRatingCategory, number>>;
  }, [selectedDerivation, youRatedByKey]);

  const selectedPendingByCategory = useMemo(() => {
    if (!selectedDerivation) {
      return {};
    }

    return Object.fromEntries(
      TRUST_CATEGORIES.flatMap((role) => {
        const value = pendingRatings[pendingRatingKey(role, selectedDerivation.accountAddress)]?.rating;
        return value === undefined ? [] : [[role, value]];
      }),
    ) as Partial<Record<AccountRatingCategory, number>>;
  }, [pendingRatings, selectedDerivation]);

  useEffect(() => {
    const addresses = new Set<string>();

    for (const derivation of data.derivations) {
      addresses.add(derivation.accountAddress);
    }
    for (const change of data.changes) {
      addresses.add(change.accountAddress);
    }
    for (const rating of receivedRatings ?? []) {
      addresses.add(rating.raterAddress);
      addresses.add(rating.targetAddress);
    }
    for (const node of serverGraph?.nodes ?? []) {
      addresses.add(node.address);
    }

    const missing = [...addresses].filter((address) => !identityProfiles[address]);

    if (missing.length === 0) {
      return;
    }

    let cancelled = false;
    void loadIdentityProfiles(missing, data.bridge?.actions ?? [])
      .then((profiles) => {
        if (!cancelled) {
          setIdentityProfiles((current) => {
            const next = { ...current };
            for (const profile of profiles) {
              next[profile.address] = profile;
            }
            return next;
          });
        }
      })
      .catch((identityError) => console.warn('Failed to resolve identities', identityError));

    return () => {
      cancelled = true;
    };
  }, [data.bridge?.actions, data.changes, data.derivations, identityProfiles, receivedRatings, serverGraph?.nodes]);

  useEffect(() => {
    if (view !== 'graph' || graphRootAddress || data.derivations.length === 0) {
      return;
    }

    const preferred = data.derivations.find((derivation) => derivation.accountAddress === self?.address);
    setGraphRootAddress(preferred?.accountAddress ?? data.derivations[0].accountAddress);
  }, [data.derivations, graphRootAddress, self?.address, view]);

  useEffect(() => {
    if (view !== 'graph' || !graphRootAddress) {
      return;
    }

    let cancelled = false;
    setGraphLoading(true);

    getTrustGraph({ category, depth: graphDepth, root: graphRootAddress })
      .then((graph) => {
        if (!cancelled) {
          setServerGraph(graph);
          setGraphSelectedAddress(graphRootAddress);
        }
      })
      .catch((graphError) => {
        console.warn('Failed to load trust network', graphError);
        if (!cancelled) {
          setServerGraph(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setGraphLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [category, graphDepth, graphRootAddress, view]);

  const graphSignature = useMemo(
    () =>
      JSON.stringify([
        category,
        graphDepth,
        graphRootAddress,
        serverGraph?.nodes.map((node) => [
          node.address,
          node.status,
          node.level,
          node.score,
          node.seedMember,
        ]),
        serverGraph?.edges.map((edge) => [
          edge.source,
          edge.target,
          edge.rating,
          edge.confidence,
        ]),
      ]),
    [category, graphDepth, graphRootAddress, serverGraph],
  );
  const visibleGraphCounts = useMemo(() => {
    const focusAddress = graphSelectedAddress ?? graphRootAddress;
    const edges = (serverGraph?.edges ?? []).filter((edge) => {
      if (edge.rating === 0 || (graphSign === 'positive' && edge.rating < 0) || (graphSign === 'negative' && edge.rating > 0)) {
        return false;
      }
      if (graphDirection === 'incoming') {
        return edge.target === focusAddress;
      }
      if (graphDirection === 'outgoing') {
        return edge.source === focusAddress;
      }
      return graphDepth === 1 ? edge.source === focusAddress || edge.target === focusAddress : true;
    });
    const addresses = new Set<string>(focusAddress ? [focusAddress] : []);

    for (const edge of edges) {
      addresses.add(edge.source);
      addresses.add(edge.target);
    }

    return { accounts: addresses.size, ratings: edges.length };
  }, [
    graphDepth,
    graphDirection,
    graphRootAddress,
    graphSelectedAddress,
    graphSign,
    serverGraph?.edges,
  ]);

  const handleRatingSubmitted = useCallback((entry: PendingRatingEntry) => {
    setPendingRatings((current) => ({
      ...current,
      [pendingRatingKey(entry.category, entry.targetAddress)]: entry,
    }));
    setToast(t('rating.submitted'));
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const entries = Object.entries(pendingRatings);

    if (entries.length === 0) {
      return;
    }

    let cancelled = false;
    let timer = 0;

    const poll = async () => {
      const confirmed: string[] = [];

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
              confirmed.push(key);
            }
          } catch {
            // A later poll will retry transient Core or bridge failures.
          }
        }),
      );

      if (cancelled) {
        return;
      }

      if (confirmed.length > 0) {
        setPendingRatings((current) => {
          const next = { ...current };
          for (const key of confirmed) {
            delete next[key];
          }
          return next;
        });
        setDetailReloadToken((token) => token + 1);
        await Promise.all([loadData({ silent: true }), refreshYouRated()]);
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
  }, [loadData, pendingRatings, refreshYouRated]);

  const changeAccountSort = useCallback((key: AccountSortKey) => {
    setAccountSort((current) => changeAccountSortState(current, key));
  }, []);

  const handleViewChange = (next: ViewMode) => {
    setView(next);
    setSelectedAddress(null);
    setIsFullscreen(false);
    const url = new URL(window.location.href);
    url.searchParams.set('view', next);
    url.searchParams.delete('account');
    url.searchParams.delete('target');
    window.history.pushState({}, '', url);
  };

  const openNodeDetail = (node: TrustGraphNode) => {
    openAccount(node.address);
  };

  const loadingPanel = (
    <div aria-busy="true" aria-live="polite" className="loading-panel" role="status">
      <div className="skeleton-block" />
      <div className="skeleton-block short" />
      <div className="skeleton-table" />
      <span className="sr-only">{t('app.loading')}</span>
    </div>
  );

  const showAccountDetail = selectedDerivation && !isFullscreen && view === 'accounts';

  return (
    <main className={`app-shell ${isFullscreen ? 'app-shell--fullscreen' : ''}`}>
      {!isFullscreen ? (
        <>
          <header className="app-header">
            <div className="app-header__identity">
              <span className="app-header__mark">
                <ShieldCheck aria-hidden="true" size={36} strokeWidth={2.7} />
              </span>
              <div>
                <div className="app-title-row">
                  <h1>{t('app.title')}</h1>
                  <span className="app-version">{APP_VERSION}</span>
                </div>
                <p className="app-subtitle">{t('app.subtitle')}</p>
              </div>
            </div>
            <div className="header-actions">
              <span className="runtime-pill">{formatRuntimeLabel(data.bridge?.ui)}</span>
              <NodeSyncPill nodeStatus={data.nodeStatus} />
              <button
                aria-label={t('action.refreshTrust')}
                className="icon-button"
                onClick={() => void loadData()}
                title={t('action.refreshTrust')}
                type="button"
              >
                <RefreshCw size={17} />
              </button>
            </div>
          </header>

          <nav aria-label={t('nav.sections')} className="section-nav" ref={navRef}>
            {([
              ['accounts', t('nav.accounts')],
              ['graph', t('nav.network')],
              ['changes', t('nav.changes')],
            ] as [ViewMode, string][]).map(([candidate, label]) => (
              <button
                aria-current={view === candidate ? 'page' : undefined}
                className={view === candidate ? 'active' : ''}
                key={candidate}
                onClick={() => handleViewChange(candidate)}
                type="button"
              >
                {label}
              </button>
            ))}
          </nav>
        </>
      ) : null}

      {error && !isFullscreen ? (
        <div className="error-banner" role="alert">
          <AlertTriangle size={18} />
          {error}
        </div>
      ) : null}

      {data.bridge && !ratingActionAvailable && !isFullscreen ? (
        <div className="info-banner" role="note">
          <Info size={18} />
          {t('readonly.note')}
        </div>
      ) : null}

      <section className={`workspace ${isFullscreen ? 'workspace--fullscreen' : ''}`}>
        {view === 'accounts' && !showAccountDetail && !isFullscreen ? (
          <>
            <TrustFlowGuide />
            <div className="accounts-toolbar">
              <label className="search-field search-field--open">
                <Search aria-hidden="true" size={16} />
                <span className="sr-only">{t('action.searchAccounts')}</span>
                <input
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('search.placeholder')}
                  type="search"
                  value={query}
                />
              </label>
              <label className="field-control">
                <span>{t('label.status')}</span>
                <select
                  onChange={(event) => setStatusFilter(event.target.value as TrustStatus | 'ALL')}
                  value={statusFilter}
                >
                  <option value="ALL">{t('label.allStatuses')}</option>
                  {TRUST_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {statusLabel(status)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </>
        ) : null}

        {view === 'graph' && !isFullscreen ? (
          <div className="network-toolbar">
            <label className="field-control field-control--wide">
              <span>{t('label.centerAccount')}</span>
              <select
                onChange={(event) => setGraphRootAddress(event.target.value)}
                value={graphRootAddress}
              >
                {data.derivations.map((derivation) => (
                  <option key={derivation.accountAddress} value={derivation.accountAddress}>
                    {identityProfiles[derivation.accountAddress]?.name ?? derivation.accountAddress}
                  </option>
                ))}
              </select>
            </label>
            <CategorySelect category={category} onChange={setCategory} />
            <label className="field-control">
              <span>{t('label.connections')}</span>
              <select
                onChange={(event) => setGraphDirection(event.target.value as TrustGraphDirection)}
                value={graphDirection}
              >
                <option value="both">{t('network.allDirect')}</option>
                <option value="incoming">{t('network.incoming')}</option>
                <option value="outgoing">{t('network.outgoing')}</option>
              </select>
            </label>
            <label className="field-control">
              <span>{t('label.rating')}</span>
              <select onChange={(event) => setGraphSign(event.target.value as TrustGraphSign)} value={graphSign}>
                <option value="both">{t('network.bothSigns')}</option>
                <option value="positive">{t('network.positiveOnly')}</option>
                <option value="negative">{t('network.negativeOnly')}</option>
              </select>
            </label>
            <label className="field-control">
              <span>{t('label.depth')}</span>
              <select onChange={(event) => setGraphDepth(Number(event.target.value) as 1 | 2)} value={graphDepth}>
                <option value={1}>{t('network.direct')}</option>
                <option value={2}>{t('network.twoSteps')}</option>
              </select>
            </label>
            <span className="network-counts">
              {t('network.counts', {
                accounts: visibleGraphCounts.accounts,
                ratings: visibleGraphCounts.ratings,
              })}
            </span>
            <FullscreenButton isFullscreen={isFullscreen} onToggle={() => setIsFullscreen(true)} />
          </div>
        ) : null}

        <div
          className={`main-panel ${isFullscreen ? 'main-panel--fullscreen' : ''} ${
            view === 'graph' ? 'main-panel--graph-view' : ''
          }`}
        >
          {isFullscreen ? (
            <div className="view-controls view-controls--over-graph">
              <div className="view-controls__selectors">
                <CategorySelect category={category} onChange={setCategory} />
              </div>
              <FullscreenButton isFullscreen onToggle={() => setIsFullscreen(false)} />
            </div>
          ) : null}

          {showAccountDetail ? (
            <AccountDetail
              category={category}
              detail={detail}
              key={`${selectedDerivation.accountAddress}:${self?.address ?? 'readonly'}`}
              live={live}
              onActiveCategoryChange={setCategory}
              onBack={handleBack}
              onOpenAccount={(address) => {
                openAccount(address);
              }}
              onRatingSubmitted={handleRatingSubmitted}
              pendingByCategory={selectedPendingByCategory}
              profile={identityProfiles[selectedDerivation.accountAddress]}
              profiles={identityProfiles}
              ratingActionAvailable={ratingActionAvailable}
              receivedRatings={receivedRatings}
              self={self}
              selectedDerivation={selectedDerivation}
              youRatedByCategory={selectedYouRatedByCategory}
            />
          ) : loading && view !== 'graph' ? (
            loadingPanel
          ) : view === 'accounts' ? (
            <>
              <AccountsTable
                category={category}
                derivations={filteredDerivations}
                live={live}
                loadedCount={data.derivations.length}
                onResetFilters={() => {
                  setQuery('');
                  setStatusFilter('ALL');
                }}
                onSelect={(derivation: TrustDerivation) => openAccount(derivation.accountAddress)}
                onSort={changeAccountSort}
                pendingByKey={pendingRatings}
                profiles={identityProfiles}
                query={query}
                selectedAddress={selectedAddress ?? undefined}
                sort={accountSort}
                statusFilter={statusFilter}
                totalCount={derivationTotal}
                youRatedByKey={youRatedByKey}
              />
              {(derivationTotal !== null
                ? data.derivations.length < derivationTotal
                : data.derivations.length >= derivationLimit) ? (
                <div className="load-more-row">
                  <button onClick={() => setDerivationLimit((current) => current + PAGE_SIZE)} type="button">
                    {t('action.loadMoreAccounts')}
                  </button>
                </div>
              ) : null}
            </>
          ) : view === 'graph' ? (
            <Suspense fallback={loadingPanel}>
              <TrustGraphView
                category={category}
                derivations={[]}
                direction={graphDirection}
                incidentOnly={graphDepth === 1}
                isExpanded={isFullscreen}
                isLoading={graphLoading}
                onClearSelection={() => setGraphSelectedAddress(null)}
                onOpenDetail={openNodeDetail}
                onSelect={(node) =>
                  setGraphSelectedAddress((current) => (current === node.address ? graphRootAddress : node.address))
                }
                profiles={identityProfiles}
                ratings={[]}
                selectedAddress={graphSelectedAddress ?? graphRootAddress}
                serverGraph={serverGraph ?? undefined}
                sign={graphSign}
                signature={graphSignature}
              />
            </Suspense>
          ) : (
            <ChangesTable
              changes={data.changes}
              onSelectAccount={(address) => {
                openAccount(address);
              }}
              profiles={identityProfiles}
            />
          )}
        </div>
      </section>

      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </main>
  );
}
