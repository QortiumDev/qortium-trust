import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Info,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { loadRecentDirectory, type RecentActivity } from './recentActivity';
import { changeAccountSortState, getTrustDerivationServerSort, RECENT_ACCOUNT_SORT } from './accountSort';
import { TrustStatusHelp } from './components/TrustStatusHelp';
import { RoleIcon } from './components/TrustIcons';
import { AccountsTable } from './components/AccountsTable';
import { AccountDetail } from './components/AccountDetail';
import { RatingDialog } from './components/RatingDialog';
import { TrustInfoLink } from './components/TrustInfoLink';
import { ChangesTable } from './components/ChangesTable';
import { NodeSyncPill } from './components/Identity';
import { applyDisplaySettings, getDisplaySettingsUpdateFromMessage, getInitialDisplaySettings } from './displaySettings';
import { filterDerivations } from './derivationFilter';
import {
  categoryLabel,
  formatNumber,
  statusLabel,
  TRUST_CATEGORIES,
  TRUST_STATUSES,
} from './format';
import { getIdentityLabel, loadIdentityProfiles } from './identityProfiles';
import { AvatarActionsProvider } from './components/Identity';
import { setTranslationLanguage, t, type TranslationKey } from './i18n';
import { getBridgeState } from './qdnRequest';
import { PENDING_CONFIRM_POLL_MS, PENDING_CONFIRM_TIMEOUT_MS, pendingRatingKey } from './ratingControl';
import { getTrustRouteUrl, readTrustRoute, trustHistoryDepth, type TrustRoute } from './trustRoute';
import {
  getInitialShowAllRoles,
  getInitialTrustFlowGuideCollapsed,
  persistShowAllRoles,
  persistTrustFlowGuideCollapsed,
} from './uiPreferences';
import {
  getAccountRatingsPage,
  getNodeStatus,
  getRatingCooldown,
  getTrustChanges,
  getTrustDerivationPage,
  getTrustExplanation,
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
  TrustStatus,
} from './types';
import type {
  AccountDetailState,
  AccountSortKey,
  AccountSortState,
  ExplorerState,
  PendingRatingEntry,
  PendingRatingsByKey,
  RatingValuesByAccountCategory,
  ViewMode,
} from './viewTypes';

const APP_VERSION = __APP_VERSION__;
const PAGE_SIZE = 250;
const RATING_PAGE_SIZE = 1000;

const DEFAULT_ACCOUNT_SORT = RECENT_ACCOUNT_SORT;

const EMPTY_EXPLORER_STATE: ExplorerState = {
  bridge: null,
  changes: [],
  derivations: [],
  nodeStatus: null,
  policy: null,
  ratings: [],
  summary: null,
};

// Minter-first ladder order (#Stage B, task 5): starts from the main screen (Minters) and builds
// outward to the more specialized roles, matching the D7 ladder copy — the reverse of the old
// authority-flows-down (Designers -> ... -> Minters) ordering.
const ROLE_FLOW: AccountRatingCategory[] = ['SUBJECT', 'PLAYER', 'TRAINER', 'MANAGER'];

// TrustFlowGuide's per-role ladder sentence. Minters gets its own dedicated copy (there is no
// "purpose" key for it in this context); Voters/Guides/Designers reuse the same `.purpose` copy
// shown on their RoleStandingCard/detail-role-workspace header, so the ladder story stays identical
// everywhere it appears.
const ROLE_FLOW_COPY_KEYS: Record<AccountRatingCategory, TranslationKey> = {
  SUBJECT: 'trustFlow.minters',
  PLAYER: 'category.voters.purpose',
  TRAINER: 'category.guides.purpose',
  MANAGER: 'category.designers.purpose',
};

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

// The trust-flow diagram used to also appear on the account detail page; it now lives only here
// (list screen), and is collapsible so returning users can shrink it out of the way (state persisted
// alongside the showAllRoles preference). Per-role copy is the D7 ladder (#Stage B, task 5).
function TrustFlowGuide({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const toggleLabel = collapsed ? t('trustFlow.expand') : t('trustFlow.collapse');

  return (
    <section className={`trust-flow-guide${collapsed ? " trust-flow-guide--collapsed" : ""}`} aria-labelledby="trust-flow-guide-title">
      <div>
        <div className="trust-flow-guide__title-row">
          <h2 id="trust-flow-guide-title">{t('trustFlow.title')}</h2>
          <button
            aria-expanded={!collapsed}
            aria-label={toggleLabel}
            className="trust-flow-guide__collapse-toggle"
            onClick={onToggleCollapsed}
            title={toggleLabel}
            type="button"
          >
            {collapsed ? <ChevronDown aria-hidden="true" size={16} /> : <ChevronUp aria-hidden="true" size={16} />}
          </button>
        </div>
        {collapsed ? null : <p>{t('trustFlow.intro')}</p>}
      </div>
      {collapsed ? null : (
        <ol>
          {ROLE_FLOW.map((role, index) => (
            <li key={role} data-role={role}>
              <strong><RoleIcon category={role} />{categoryLabel(role)}</strong>
              <span>{t(ROLE_FLOW_COPY_KEYS[role])}</span>
              {index < ROLE_FLOW.length - 1 ? <span aria-hidden="true">→</span> : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// Accessible checkbox styled as a switch (reuses the existing .live-toggle pattern). Placed in the
// section navigation; the app-wide category selector and the three non-Minters role surfaces are
// hidden until this is on (owner decision: Minters-first redesign, Stage A).
function ShowAllRolesToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className={`live-toggle${checked ? ' live-toggle--on' : ''}`}>
      <input
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      {t('toggle.showAllRoles')}
    </label>
  );
}

// Summarize the same loaded minting-group directory shown below, not excluded accounts.
function NetworkSummaryStrip({ derivations }: { derivations: TrustDerivation[] }) {
  const statusParts = TRUST_STATUSES.map(status => ({
    status, accountCount: derivations.filter(row => row.derivedTrustStatus === status).length,
  }))
    .filter(entry => entry.accountCount > 0)
    .sort((left, right) => right.accountCount - left.accountCount)
    .map(entry => t('summary.statusCount', { count: formatNumber(entry.accountCount), status: statusLabel(entry.status) }));
  const ratingCount = derivations.reduce((total, row) => {
    const counts = row.categories.find(category => category.category === 'SUBJECT')?.inboundRatings;
    return total + (counts?.positiveRatingCount ?? 0) + (counts?.negativeRatingCount ?? 0);
  }, 0);
  return <p className="network-summary-strip">{[t('summary.ratingsCount', { count: formatNumber(ratingCount) }), ...statusParts].join(' · ')}</p>;
}

export default function App() {
  const [recentActivity, setRecentActivity] = useState<RecentActivity | null>(null);
  const [activityUnavailable, setActivityUnavailable] = useState(false);
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
  const [identityProfiles, setIdentityProfiles] = useState<IdentityProfilesByAddress>({});
  const [loading, setLoading] = useState(true);
  const [pendingRatings, setPendingRatings] = useState<PendingRatingsByKey>({});
  const activeSubmissionsRef = useRef(new Set<string>());
  const currentRaterRef = useRef<string | null>(null);
  const [submissionErrors, setSubmissionErrors] = useState<Record<string, { entry: PendingRatingEntry; message: string }>>({});
  const [query, setQuery] = useState('');
  const [receivedRatings, setReceivedRatings] = useState<AccountRating[] | undefined>(undefined);
  const [focusRating, setFocusRating] = useState(false);
  const [ratingTarget, setRatingTarget] = useState<{ derivation: TrustDerivation; category: AccountRatingCategory } | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [self, setSelf] = useState<SelfAccount | null>(null);
  const [showAllRoles, setShowAllRolesState] = useState(getInitialShowAllRoles);
  const [statusFilter, setStatusFilter] = useState<TrustStatus | 'ALL'>('ALL');
  const [toast, setToast] = useState<string | null>(null);
  const [trustFlowGuideCollapsed, setTrustFlowGuideCollapsedState] = useState(getInitialTrustFlowGuideCollapsed);
  const [view, setView] = useState<ViewMode>('accounts');
  const [youRatedRatings, setYouRatedRatings] = useState<AccountRating[]>([]);

  const setShowAllRoles = useCallback((next: boolean) => {
    setShowAllRolesState(next);
    persistShowAllRoles(next);
  }, []);

  const setTrustFlowGuideCollapsed = useCallback((next: boolean) => {
    setTrustFlowGuideCollapsedState(next);
    persistTrustFlowGuideCollapsed(next);
  }, []);

  // Minters-first redesign (Stage A): while the toggle is off, the app is pinned to the SUBJECT
  // ("Minters") category — the app-wide CategorySelect is hidden (see the accounts toolbar below)
  // and any category picked before the toggle was switched off is discarded.
  useEffect(() => {
    if (!showAllRoles) {
      setCategory('SUBJECT');
    }
  }, [showAllRoles]);

  const loadTokenRef = useRef(0);
  const restoreListFocusRef = useRef(false);
  const navRef = useRef<HTMLElement>(null);
  const selfRef = useRef(self);
  const ratingActionAvailable = (data.bridge?.actions ?? []).includes('RATE_ACCOUNT');
  const wantsRecent = accountSort[0].key === 'latestRating';
  const visibleSort: AccountSortState = wantsRecent && activityUnavailable
    ? [{ key: 'account', direction: 'asc' }]
    : accountSort;
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

  // Tracks the address `self` last resolved to (independent of `self` itself) purely so pending
  // ratings are only wiped on a genuine rater change, never on the initial null → address resolution
  // or a same-account refresh.
  const previousSelfAddressRef = useRef<string | null>(null);

  const refreshSelectedAccount = useCallback(async () => {
    try {
      const [bridge, account] = await Promise.all([getBridgeState(), resolveSelfAccount()]);
      const previousAddress = previousSelfAddressRef.current;
      const nextAddress = account?.address ?? null;
      setData((current) => ({ ...current, bridge }));
      currentRaterRef.current = account?.publicKey ?? null;
      setSelf(account);
      // Only wipe pending ratings when the resolved rater actually changed from a previously known
      // address — not on the initial null → address resolution, and not on a same-account refresh.
      if (previousAddress !== null && previousAddress !== nextAddress) {
        setPendingRatings({});
      }
      previousSelfAddressRef.current = nextAddress;
      setDetailReloadToken((token) => token + 1);
      await refreshYouRated(account);
    } catch (accountError) {
      console.warn('Failed to refresh selected account', accountError);
      const previousAddress = previousSelfAddressRef.current;
      currentRaterRef.current = null;
      setSelf(null);
      setYouRatedRatings([]);
      if (previousAddress !== null) {
        setPendingRatings({});
      }
      previousSelfAddressRef.current = null;
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
          live: true,
          seedMember: true,
          ...serverDerivationSort,
        }),
        getTrustChanges({ limit: 100 }),
      ]);

      if (loadTokenRef.current !== token) {
        return;
      }

      let directory = derivationPage;
      if (wantsRecent) {
        try {
          if (nodeStatus.isSynchronizing || !nodeStatus.height) throw new Error('Node is not ready');
          const recent = await loadRecentDirectory(nodeStatus.height, derivationPage, derivationLimit, category);
          if (loadTokenRef.current !== token) return;
          directory = recent;
          setRecentActivity(recent.activity);
          setActivityUnavailable(false);
        } catch {
          if (loadTokenRef.current !== token) return;
          setRecentActivity(null);
          setActivityUnavailable(true);
        }
      }
      setData({
        bridge,
        changes,
        derivations: directory.derivations.filter(row => row.mintingSeedMember === true),
        nodeStatus,
        policy,
        ratings: [],
        summary,
      });
      setDerivationTotal(directory.total);
    } catch (loadError) {
      if (loadTokenRef.current === token && !silent) {
        setError(loadError instanceof Error ? loadError.message : t('error.trustLoadFailed'));
      }
    } finally {
      if (loadTokenRef.current === token && !silent) {
        setLoading(false);
      }
    }
  }, [category, derivationLimit, serverDerivationSort, wantsRecent]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!data.bridge?.isHomeBridge) {
      currentRaterRef.current = null;
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
    const readRouteFromUrl = () => {
      const route = readTrustRoute(window.location.href);
      setFocusRating(false);
      if (!route.account) restoreListFocusRef.current = true;
      setSelectedAddress(route.account);
      setView(route.view);
    };

    readRouteFromUrl();
    window.addEventListener('popstate', readRouteFromUrl);

    return () => window.removeEventListener('popstate', readRouteFromUrl);
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source && event.source !== window.parent) {
        return;
      }

      setDisplaySettings((current) => getDisplaySettingsUpdateFromMessage(event.data, current) ?? current);

      // Deliberately does NOT react to a selected-account-change message: the Trust app binds to
      // whichever account was loaded first and never reloads on an account switch (owner decision).
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const navigateToRoute = useCallback((route: TrustRoute) => {
    const current = readTrustRoute(window.location.href);
    if (current.account !== route.account || current.view !== route.view) {
      window.history.pushState(
        { trustNavigationDepth: trustHistoryDepth(window.history.state) + 1 },
        '',
        getTrustRouteUrl(window.location.href, route),
      );
    }
    setSelectedAddress(route.account);
    setView(route.view);
  }, []);

  const openAccount = useCallback((address: string, ratingCategory?: AccountRatingCategory) => {
    setFocusRating(ratingCategory !== undefined);
    if (ratingCategory) setCategory(ratingCategory);
    if (!data.derivations.some((derivation) => derivation.accountAddress === address)) {
      setDerivationLimit(5_000);
    }
    navigateToRoute({ account: address, view: 'accounts' });
  }, [data.derivations, navigateToRoute]);

  const handleBack = useCallback(() => {
    if (trustHistoryDepth(window.history.state) > 0) {
      window.history.back();
      return;
    }
    restoreListFocusRef.current = true;
    setFocusRating(false);
    window.history.replaceState(
      { ...window.history.state, trustNavigationDepth: 0 },
      '',
      getTrustRouteUrl(window.location.href, { account: null, view: 'accounts' }),
    );
    setSelectedAddress(null);
    setView('accounts');
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
      getTrustExplanation(publicKey, true),
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
  }, [data.bridge?.actions, data.changes, data.derivations, identityProfiles, receivedRatings]);

  const submissionKey = (entry: PendingRatingEntry) =>
    `${entry.raterPublicKey}:${pendingRatingKey(entry.category, entry.targetAddress)}`;

  const handleSubmissionStarted = useCallback((entry: PendingRatingEntry) => {
    const key = submissionKey(entry);
    if (activeSubmissionsRef.current.has(key)) return false;
    activeSubmissionsRef.current.add(key);
    setPendingRatings(current => ({ ...current, [pendingRatingKey(entry.category, entry.targetAddress)]: entry }));
    setSubmissionErrors(current => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    return true;
  }, []);

  const handleSubmissionFailed = useCallback((entry: PendingRatingEntry, message: string) => {
    activeSubmissionsRef.current.delete(submissionKey(entry));
    setPendingRatings(current => {
      const key = pendingRatingKey(entry.category, entry.targetAddress);
      if (current[key] !== entry) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    setSubmissionErrors(current => ({ ...current, [submissionKey(entry)]: { entry, message } }));
  }, []);

  const handleRatingSubmitted = useCallback((entry: PendingRatingEntry) => {
    activeSubmissionsRef.current.delete(submissionKey(entry));
    // A response can arrive after navigation or a selected-account change.
    if (currentRaterRef.current !== entry.raterPublicKey) return;
    setPendingRatings((current) => ({
      ...current,
      [pendingRatingKey(entry.category, entry.targetAddress)]: entry,
    }));
    setToast(t(entry.confirmationUnknown ? 'rating.broadcastUnknown' : 'rating.submitted'));
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Re-arms tracking for a timed-out entry: another PENDING_CONFIRM_TIMEOUT_MS window starting now.
  const handleRetryPending = useCallback((key: string) => {
    setPendingRatings((current) => {
      const entry = current[key];

      if (!entry) {
        return current;
      }

      return { ...current, [key]: { ...entry, submittedAt: Date.now(), timedOut: false } };
    });
  }, []);

  const handleDismissPending = useCallback((key: string) => {
    setPendingRatings((current) => {
      if (!(key in current)) {
        return current;
      }

      const next = { ...current };
      delete next[key];
      return next;
    });
  }, []);

  useEffect(() => {
    // Timed-out entries stay in `pendingRatings` for the Retry/Dismiss notice, but stop being polled
    // until the user retries them.
    const activeEntries = Object.entries(pendingRatings).filter(([, entry]) => !entry.timedOut && !entry.submitting);

    if (activeEntries.length === 0) {
      return;
    }

    let cancelled = false;
    let timer = 0;

    const poll = async () => {
      const confirmed: string[] = [];
      const timedOut: string[] = [];
      const now = Date.now();

      await Promise.all(
        activeEntries.map(async ([key, entry]) => {
          try {
            const cooldown = await getRatingCooldown({
              category: entry.category,
              rater: entry.raterPublicKey,
              target: entry.targetPublicKey,
            });
            const expected = entry.rating === 0 ? null : entry.rating;
            if (cooldown.activeRating === expected) {
              confirmed.push(key);
              return;
            }
          } catch {
            // A later poll will retry transient Core or bridge failures.
          }

          // Still unconfirmed (or the check itself failed) — give up polling this entry once it has
          // been pending for PENDING_CONFIRM_TIMEOUT_MS, surfacing a "not confirmed" state instead.
          if (now - entry.submittedAt >= PENDING_CONFIRM_TIMEOUT_MS) {
            timedOut.push(key);
          }
        }),
      );

      if (cancelled) {
        return;
      }

      if (confirmed.length > 0 || timedOut.length > 0) {
        setPendingRatings((current) => {
          const next = { ...current };
          for (const key of confirmed) {
            delete next[key];
          }
          for (const key of timedOut) {
            if (next[key]) {
              next[key] = { ...next[key], timedOut: true };
            }
          }
          return next;
        });
      }

      if (confirmed.length > 0) {
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
    if (key === 'latestRating' && wantsRecent && activityUnavailable) {
      setAccountSort(DEFAULT_ACCOUNT_SORT);
      void loadData();
      return;
    }
    setAccountSort((current) => changeAccountSortState(current, key));
  }, [activityUnavailable, loadData, wantsRecent]);

  const handleViewChange = (next: ViewMode) => {
    navigateToRoute({ account: null, view: next });
  };

  const loadingPanel = (
    <div aria-busy="true" aria-live="polite" className="loading-panel" role="status">
      <div className="skeleton-block" />
      <div className="skeleton-block short" />
      <div className="skeleton-table" />
      <span className="sr-only">{t('app.loading')}</span>
    </div>
  );

  const showAccountDetail = selectedDerivation && view === 'accounts';

  return (
    <AvatarActionsProvider actions={data.bridge?.actions}>
      <main className="app-shell">
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
              </div>
            </div>
            <div className="header-actions">
              <NodeSyncPill nodeStatus={data.nodeStatus} />
              <TrustInfoLink bridge={data.bridge} onError={setError} />
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
            <ShowAllRolesToggle checked={showAllRoles} onChange={setShowAllRoles} />
          </nav>

      {error ? (
        <div className="error-banner" role="alert">
          <AlertTriangle size={18} />
          {error}
        </div>
      ) : null}

      {data.bridge && !ratingActionAvailable ? (
        <div className="info-banner" role="note">
          <Info size={18} />
          {t('readonly.note')}
        </div>
      ) : null}

      {Object.entries(submissionErrors).map(([key, { entry, message }]) => (
        <div className="error-banner submission-error" role="alert" key={key}>
          <AlertTriangle aria-hidden="true" size={18} />
          <button type="button" onClick={() => openAccount(entry.targetAddress, entry.category)}>
            {getIdentityLabel(identityProfiles[entry.targetAddress], entry.targetAddress)} · {categoryLabel(entry.category)}
          </button>
          <span>{message}</span>
          <button type="button" onClick={() => setSubmissionErrors(current => {
            const next = { ...current }; delete next[key]; return next;
          })}>{t('action.dismiss')}</button>
        </div>
      ))}
      <section className="workspace">
        {view === 'accounts' && !showAccountDetail ? (
          <>
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
                      {/* Suspicious gets a plain functional note wherever statuses are listed/explained
                          (#Stage B, task 6) — inline text, not color-only (this list has no color). */}
                      {status === 'SUSPICIOUS'
                        ? `${statusLabel(status)} ${t('status.suspiciousNote')}`
                        : statusLabel(status)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-control account-sort-select">
                <span>{t('sort.label')}</span>
                <select value={visibleSort[0].key} onChange={event => changeAccountSort(event.target.value as AccountSortKey)}>
                  {([['latestRating', 'activity.sort'], ['account', 'label.account'], ['status', 'label.trustStatus'], ['blocksMinted', 'label.blocksMinted'], ['level', 'label.trustLevel'], ['score', 'label.score'], ['ratings', 'label.ratings'], ['youRated', 'label.youRated'], ['voteWeight', 'label.voteWeight'], ['seed', 'label.seed']] as [AccountSortKey, TranslationKey][]).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}
                </select>
              </label>
              <button className="sort-direction icon-button" title={t(visibleSort[0].direction === 'asc' ? 'sort.ascending' : 'sort.descending')} aria-label={t(visibleSort[0].direction === 'asc' ? 'sort.ascending' : 'sort.descending')} onClick={() => changeAccountSort(visibleSort[0].key)} type="button">{visibleSort[0].direction === 'asc' ? '↑' : '↓'}</button>
              {showAllRoles ? <CategorySelect category={category} onChange={setCategory} /> : null}
            </div>
            <div className="directory-help">
              <TrustStatusHelp policy={data.policy} />
              <TrustFlowGuide collapsed={trustFlowGuideCollapsed} onToggleCollapsed={() => setTrustFlowGuideCollapsed(!trustFlowGuideCollapsed)} />
            </div>
          </>
        ) : null}

        <div className="main-panel">
          {showAccountDetail ? (
            <AccountDetail
              category={category}
              focusRating={focusRating}
              detail={detail}
              key={`${selectedDerivation.accountAddress}:${self?.address ?? 'readonly'}`}
              onActiveCategoryChange={setCategory}
              onBack={handleBack}
              onDismissPending={handleDismissPending}
              onOpenAccount={(address) => {
                openAccount(address);
              }}
              onSubmissionStarted={handleSubmissionStarted}
              onSubmissionFailed={handleSubmissionFailed}
              onRatingSubmitted={handleRatingSubmitted}
              onRetryPending={handleRetryPending}
              pendingRatings={pendingRatings}
              policy={data.policy}
              profile={identityProfiles[selectedDerivation.accountAddress]}
              profiles={identityProfiles}
              ratingActionAvailable={ratingActionAvailable}
              receivedRatings={receivedRatings}
              self={self}
              selectedDerivation={selectedDerivation}
              showAllRoles={showAllRoles}
              youRatedByKey={youRatedByKey}
            />
          ) : loading ? (
            loadingPanel
          ) : view === 'accounts' ? (
            <>
              {wantsRecent && activityUnavailable ? <p className="activity-unavailable" role="status">{t('activity.unavailable')}</p> : null}
              <NetworkSummaryStrip derivations={data.derivations} />
              <AccountsTable
                activity={recentActivity}
                category={category}
                derivations={filteredDerivations}
                loadedCount={data.derivations.length}
                onResetFilters={() => {
                  setQuery('');
                  setStatusFilter('ALL');
                }}
                onSelect={(derivation: TrustDerivation) => openAccount(derivation.accountAddress)}
                onSort={changeAccountSort}
                onRate={(derivation, role) => setRatingTarget({ derivation, category: role })}
                pendingByKey={pendingRatings}
                profiles={identityProfiles}
                query={query}
                selectedAddress={selectedAddress ?? undefined}
                showAllRoles={showAllRoles}
                sort={visibleSort}
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
          ) : (
            <ChangesTable
              changes={data.changes}
              onSelectAccount={(address) => {
                openAccount(address);
              }}
              profiles={identityProfiles}
              showAllRoles={showAllRoles}
            />
          )}
        </div>
      </section>

      {ratingTarget ? (
        <RatingDialog
          key={`${ratingTarget.derivation.accountPublicKey}:${ratingTarget.category}:${self?.address ?? 'readonly'}`}
          category={ratingTarget.category}
          derivation={ratingTarget.derivation}
          profile={identityProfiles[ratingTarget.derivation.accountAddress]}
          onClose={() => setRatingTarget(null)}
          onSubmissionStarted={handleSubmissionStarted}
          onSubmissionFailed={handleSubmissionFailed}
          onSubmitted={handleRatingSubmitted}
          onDismissPending={handleDismissPending}
          onRetryPending={handleRetryPending}
          pendingRating={pendingRatings[pendingRatingKey(ratingTarget.category, ratingTarget.derivation.accountAddress)]?.rating}
          pendingRatings={pendingRatings}
          ratingActionAvailable={ratingActionAvailable}
          self={self}
        />
      ) : null}
      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
      </main>
    </AvatarActionsProvider>
  );
}
