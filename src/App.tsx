import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Info,
  Maximize2,
  Minimize2,
  ShieldCheck,
} from 'lucide-react';
import { filterDerivations } from './derivationFilter';
import type { TrustGraphNode } from './graphModel';
import { loadIdentityProfiles } from './identityProfiles';
import { getBridgeState } from './qdnRequest';
import {
  getAccountRatings,
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
import {
  applyDisplaySettings,
  getDisplaySettingsUpdateFromMessage,
  getInitialDisplaySettings,
} from './displaySettings';
import {
  categoryLabel,
  TRUST_CATEGORIES,
} from './format';
import type {
  AccountRating,
  AccountRatingCategory,
  IdentityProfilesByAddress,
  SelfAccount,
  TrustDerivation,
} from './types';
import type {
  AccountDetailState,
  AccountSortKey,
  AccountSortState,
  ExplorerState,
  PendingRatingEntry,
  PendingRatingsByKey,
  RatingsByAddress,
  ViewMode,
} from './viewTypes';
import { changeAccountSortState, getTrustDerivationServerSort } from './accountSort';
import { PENDING_CONFIRM_POLL_MS, pendingRatingKey } from './ratingControl';
import { t, type TranslationKey } from './i18n';
import { AccountsTable } from './components/AccountsTable';
import { ChangesTable } from './components/ChangesTable';
import { AccountDetail } from './components/AccountDetail';

// Lazily loaded so d3-force + the graph simulation land in a separate chunk the default Accounts
// view never downloads (bundle-001).
const TrustGraphView = lazy(() => import('./components/TrustGraphView'));
const APP_VERSION = __APP_VERSION__;

// Default view: the accounts you have rated highest first, then most blocks minted.
const DEFAULT_ACCOUNT_SORT: AccountSortState = [
  { direction: 'desc', key: 'youRated' },
  { direction: 'desc', key: 'blocksMinted' },
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

function CategorySelect({
  category,
  onChange,
}: {
  category: AccountRatingCategory;
  onChange: (category: AccountRatingCategory) => void;
}) {
  return (
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
  );
}

const VIEW_OPTIONS: { labelKey: TranslationKey; value: ViewMode }[] = [
  { labelKey: 'nav.graph', value: 'graph' },
  { labelKey: 'nav.accounts', value: 'accounts' },
  { labelKey: 'nav.changes', value: 'changes' },
];

// The explorer view dropdown is paired with the trust-category dropdown in the graph overlay.
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
      aria-label={t('label.explorerView')}
      onChange={(event) => onChange(event.target.value as ViewMode)}
      ref={selectRef}
      value={view}
    >
      {VIEW_OPTIONS.map((candidate) => (
        <option key={candidate.value} value={candidate.value}>
          {t(candidate.labelKey)}
        </option>
      ))}
    </select>
  );
}

function FullscreenButton({
  isFullscreen,
  onToggle,
}: {
  isFullscreen: boolean;
  onToggle: () => void;
}) {
  const label = isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen';

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

export default function App() {
  const [accountSort, setAccountSort] = useState<AccountSortState>(DEFAULT_ACCOUNT_SORT);
  const [category, setCategory] = useState<AccountRatingCategory>('SUBJECT');
  const [data, setData] = useState<ExplorerState>(EMPTY_EXPLORER_STATE);
  // Total accounts in the active category (from the listing's X-Total-Count header); null when the
  // count is unknown (browser-dev fallback). Drives the "showing first N of M" hint on the table.
  const [derivationTotal, setDerivationTotal] = useState<number | null>(null);
  // Transient confirmation shown after a rating is broadcast (UX-006); auto-clears.
  const [toast, setToast] = useState<string | null>(null);
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Keep live derivations as the internal default so level/block/vote-weight fields stay populated.
  const live = true;
  const [loading, setLoading] = useState(true);
  const [openRateAddress, setOpenRateAddress] = useState<string | null>(null);
  const [pendingRatings, setPendingRatings] = useState<PendingRatingsByKey>({});
  const [query, setQuery] = useState('');
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [self, setSelf] = useState<SelfAccount | null>(null);
  const [view, setView] = useState<ViewMode>('graph');
  const viewSelectRef = useRef<HTMLSelectElement>(null);
  // Set when leaving the detail takeover so we restore focus to the view selector once the list
  // re-mounts (the AccountDetail Back button it lived on has been unmounted).
  const restoreListFocusRef = useRef(false);

  const ratingActionAvailable = (data.bridge?.actions ?? []).includes('RATE_ACCOUNT');

  // Monotonic token shared by every loadData/confirmation refresh. A slow earlier load can resolve
  // after a newer one (e.g. category switch mid-flight); only the latest invocation commits state.
  const loadTokenRef = useRef(0);
  // The rater-scoped ratings map ("You rated") is fetched independently of the capped global edge
  // fetch (#2) so it stays complete past the 1000-edge cap. Keyed by self address + category epoch.
  const [youRatedRatings, setYouRatedRatings] = useState<AccountRating[]>([]);
  const serverDerivationSort = useMemo(() => getTrustDerivationServerSort(accountSort), [accountSort]);

  const loadData = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    const token = ++loadTokenRef.current;
    const isLatest = () => loadTokenRef.current === token;

    if (!silent) {
      setLoading(true);
    }
    // Only a foreground load owns the error banner; a background poll must not clear a banner the
    // user is reading (#4). Persistent failures still resurface on the next foreground load.
    if (!silent) {
      setError(null);
    }

    try {
      const [bridge, nodeStatus, summary, policy, derivationPage, ratings, changes] = await Promise.all([
        getBridgeState(),
        getNodeStatus(),
        getTrustSummary(),
        getTrustPolicy(),
        getTrustDerivationPage({ category, limit: 250, live, ...serverDerivationSort }),
        getAccountRatings({ category, limit: 1000 }),
        getTrustChanges({ category, limit: 25 }),
      ]);

      if (!isLatest()) {
        return;
      }

      setData({
        bridge,
        changes,
        derivations: derivationPage.derivations,
        nodeStatus,
        policy,
        ratings,
        summary,
      });
      setDerivationTotal(derivationPage.total);
    } catch (loadError) {
      if (isLatest() && !silent) {
        setError(loadError instanceof Error ? loadError.message : t('error.trustLoadFailed'));
      } else if (silent) {
        // Swallowed so a transient poll failure can't clobber the banner; surfaced on next foreground load.
        console.warn('Silent Trust refresh failed', loadError);
      }
    } finally {
      if (isLatest() && !silent) {
        setLoading(false);
      }
    }
  }, [category, serverDerivationSort]);

  // Refetch only the slices a new rating changes — the category derivations and ratings — and merge
  // them into state so the other arrays (changes/summary/policy) keep stable references (#12),
  // avoiding a full reload and downstream re-derivation per confirmation.
  const refreshRatingSlices = useCallback(async (refreshCategory: AccountRatingCategory = category) => {
    const token = ++loadTokenRef.current;

    const [derivationPage, ratings] = await Promise.all([
      getTrustDerivationPage({ category: refreshCategory, limit: 250, live, ...serverDerivationSort }),
      getAccountRatings({ category: refreshCategory, limit: 1000 }),
    ]);

    if (loadTokenRef.current !== token) {
      return;
    }

    setData((current) => ({ ...current, derivations: derivationPage.derivations, ratings }));
    setDerivationTotal(derivationPage.total);
  }, [category, serverDerivationSort]);

  // Rater-scoped fetch of the current user's own ratings (#2): independent of the capped edge fetch
  // so the "You rated" column / default sort / pending-clear stay correct past 1000 active ratings.
  const refreshYouRated = useCallback(async () => {
    const publicKey = self?.publicKey;
    const raterAddress = self?.address;

    if (!publicKey || !raterAddress) {
      setYouRatedRatings([]);
      return;
    }

    try {
      const ratings = await getAccountRatings({ category, rater: publicKey });
      setYouRatedRatings(ratings);
    } catch (youRatedError) {
      console.warn('Failed to load your ratings', youRatedError);
    }
  }, [category, self?.address, self?.publicKey]);

  useEffect(() => {
    void refreshYouRated();
  }, [refreshYouRated]);

  // Latest slice-refresh + self/category, read by the confirmation poll (keyed only on pendingRatings)
  // so it merges fresh slices without resetting the poll timer on every category/account switch.
  const refreshRatingSlicesRef = useRef(refreshRatingSlices);
  useEffect(() => {
    refreshRatingSlicesRef.current = refreshRatingSlices;
  }, [refreshRatingSlices]);

  const selfRef = useRef(self);
  useEffect(() => {
    selfRef.current = self;
  }, [self]);

  const categoryRef = useRef(category);
  useEffect(() => {
    categoryRef.current = category;
  }, [category]);

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

  // Deep link (#23): Home forwards its query string onto the iframe URL, so an `account`/`target`
  // param (a base58 address) lands here on mount. Open that account's detail takeover once.
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const deepLinkAddress = params.get('account') ?? params.get('target');

    if (deepLinkAddress) {
      setSelectedAddress(deepLinkAddress);
    }
  }, []);

  useEffect(() => {
    applyDisplaySettings(displaySettings);
  }, [displaySettings]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Only honour display-setting messages from the embedding Home frame (#31). When standalone
      // (BROWSER_DEV) window.parent === window, so same-window posts still pass; cross-frame posts
      // from other embedded apps are ignored. The parser already whitelists values, so this is
      // defence-in-depth matching Home's origin model.
      if (event.source && event.source !== window.parent) {
        return;
      }

      setDisplaySettings((current) => getDisplaySettingsUpdateFromMessage(event.data, current) ?? current);
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

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
    setAccountSort((current) => changeAccountSortState(current, key));
  }, []);

  const normalizedQuery = query.trim().toLowerCase();

  const filteredDerivations = useMemo(() => {
    // Empty-query short-circuit (#13): data.derivations is already unique by address, so skip the
    // Map de-dupe + identityProfiles dependency. This keeps profile batches from invalidating the
    // list and the downstream graph memo.
    if (!normalizedQuery) {
      return data.derivations;
    }

    const searched = filterDerivations(data.derivations, query).concat(
      data.derivations.filter((derivation) => {
        const profile = identityProfiles[derivation.accountAddress];
        return profile?.name?.toLowerCase().includes(normalizedQuery);
      }),
    );
    const uniqueSearched = [...new Map(searched.map((derivation) => [derivation.accountAddress, derivation])).values()];

    return uniqueSearched;
  }, [data.derivations, identityProfiles, normalizedQuery, query]);

  // Derive from the unfiltered list so the full-width detail survives search/status-filter changes
  // and search close. The table row highlight and graph still key off filteredDerivations.
  const selectedDerivation = useMemo(
    () => data.derivations.find((derivation) => derivation.accountAddress === selectedAddress) ?? null,
    [data.derivations, selectedAddress],
  );

  // Addresses whose detail can be opened — i.e. those present in the loaded category list, since the
  // detail takeover is driven by selectedDerivation. Lets Changes rows drill in only when it'll work.
  const selectableAddresses = useMemo(
    () => new Set(data.derivations.map((derivation) => derivation.accountAddress)),
    [data.derivations],
  );

  // Stable signature of every input the graph sim renders from — the category, plus each node's
  // visual fields (status/level/score/seed) and each edge's (rater/target/rating/confidence) — but
  // never identityProfiles. Memoizing TrustGraphView's model build on this string stops identity
  // batches / silent polls from re-running the 320-tick sim, while still rebuilding when a live
  // toggle or re-derivation changes a node's status/level/score that addresses alone wouldn't catch
  // (perf-001, #6).
  const graphSignature = useMemo(
    () =>
      JSON.stringify([
        category,
        filteredDerivations.map((derivation) => {
          const categoryData = derivation.categories.find((candidate) => candidate.category === category);

          return [
            derivation.accountAddress,
            derivation.derivedTrustStatus,
            derivation.mintingSeedMember,
            categoryData?.level ?? 0,
            categoryData?.score ?? 0,
          ];
        }),
        data.ratings
          .filter((rating) => rating.rating !== 0)
          .map((rating) => [
            rating.raterAddress,
            rating.targetAddress,
            rating.rating,
            rating.ratingConfidence,
          ]),
      ]),
    [category, data.ratings, filteredDerivations],
  );

  // Shared skeleton for the foreground load and the lazy graph-chunk Suspense fallback, so a
  // graph-view switch shows the same placeholder whether data or the chunk is still arriving.
  const loadingPanel = (
    <div aria-busy="true" aria-live="polite" className="loading-panel" role="status">
      <div className="skeleton-block" />
      <div className="skeleton-block short" />
      <div className="skeleton-table" />
      <span className="sr-only">{t('app.loading')}</span>
    </div>
  );

  // What the current user has rated each account in the selected category. Built from the dedicated
  // rater-scoped fetch (#2) so it stays complete past the global 1000-edge cap. Drives the "You rated"
  // column, the default sort, and the confirmation-poll pending-clear.
  const youRatedByAddress = useMemo<RatingsByAddress>(() => {
    if (!self) {
      return {};
    }

    const byAddress: RatingsByAddress = {};

    for (const rating of youRatedRatings) {
      if (rating.raterAddress !== self.address || rating.category !== category) {
        continue;
      }

      // 0 means "no active rating" — skip it so it never renders as a "0" badge or leaks into the
      // sort key / pending map (#20).
      if (rating.rating === 0) {
        continue;
      }

      byAddress[rating.targetAddress] = rating.rating;
    }

    return byAddress;
  }, [category, self, youRatedRatings]);

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

    // One batched RESOLVE_IDENTITIES call when Home supports it, else bounded-concurrency per-address
    // resolution — never the unbounded fan-out this used to do (perf-002).
    void loadIdentityProfiles(missingAddresses, actions)
      .then((profiles) => {
        if (cancelled) {
          return;
        }

        setIdentityProfiles((current) => {
          const next = { ...current };

          for (const profile of profiles) {
            next[profile.address] = profile;
          }

          return next;
        });
      })
      .catch((identityError) => {
        console.warn('Failed to resolve identities', identityError);
      });

    return () => {
      cancelled = true;
    };
  }, [data.bridge?.actions, data.changes, data.derivations, data.ratings, identityProfiles]);

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

    Promise.all([getTrustProfile(publicKey), getTrustExplanation(publicKey, live)])
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
  }, [detailReloadToken, live, selectedDerivation?.accountPublicKey]);

  const handleRatingSubmitted = useCallback((entry: PendingRatingEntry) => {
    setPendingRatings((current) => ({
      ...current,
      [pendingRatingKey(entry.category, entry.targetAddress)]: entry,
    }));
    // onSubmitted only fires after Home accepts the broadcast, so this is a reliable success cue
    // beyond the per-row pending spinner (UX-006).
    setToast(t('rating.submitted'));
  }, []);

  // Auto-dismiss the success toast; re-armed each time a new toast is set.
  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => setToast(null), 4000);

    return () => window.clearTimeout(timer);
  }, [toast]);

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
      // Pause while the tab is backgrounded: browsers throttle background timers anyway, and there's
      // no UI to update, so skip the cooldown round-trips. The visibilitychange listener resumes the
      // loop (immediately re-polling) when the tab is shown again (poll-001).
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }

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
        // Refresh the changed slices (derivations + ratings) and the rater-scoped "You rated" map, then
        // drop each optimistic pending entry only once its confirmed value is actually present in the
        // reloaded data (#3). Refetching just the slices keeps unrelated arrays stable (#12), and the
        // rater-scoped map (#2) is the reliable source past the global edge cap. If a confirmed value
        // isn't visible yet, keep the optimistic value and re-verify on the next poll.
        const confirmedCategories = new Set<AccountRatingCategory>();

        for (const key of confirmedKeys) {
          const entry = pendingRatings[key];

          if (entry) {
            confirmedCategories.add(entry.category);
          }
        }

        const activeCategory = categoryRef.current;
        const refreshVisibleCategory = confirmedCategories.has(activeCategory);

        if (refreshVisibleCategory) {
          setDetailReloadToken((token) => token + 1);
        }

        const confirmedYouRatedByCategory = new Map<AccountRatingCategory, AccountRating[]>();
        await Promise.all([
          refreshVisibleCategory ? refreshRatingSlicesRef.current(activeCategory) : Promise.resolve(),
          (async () => {
            const publicKey = selfRef.current?.publicKey;

            if (!publicKey) {
              return;
            }

            try {
              await Promise.all(
                [...confirmedCategories].map(async (confirmedCategory) => {
                  const ratings = await getAccountRatings({ category: confirmedCategory, rater: publicKey });
                  confirmedYouRatedByCategory.set(confirmedCategory, ratings);
                }),
              );

              const activeCategoryRatings = confirmedYouRatedByCategory.get(categoryRef.current);

              if (activeCategoryRatings) {
                setYouRatedRatings(activeCategoryRatings);
              }
            } catch (youRatedError) {
              console.warn('Failed to refresh your ratings during confirmation', youRatedError);
            }
          })(),
        ]);

        if (cancelled) {
          return;
        }

        const selfAddress = selfRef.current?.address ?? null;
        const ratingPresent = (entry: PendingRatingEntry) => {
          const confirmedYouRated = confirmedYouRatedByCategory.get(entry.category) ?? [];
          // 0 means "rating cleared" — confirmed when no active rating remains for that target.
          const active = confirmedYouRated.find(
            (rating) =>
              rating.raterAddress === selfAddress &&
              rating.category === entry.category &&
              rating.targetAddress === entry.targetAddress &&
              rating.rating !== 0,
          );

          if (entry.rating === 0) {
            return !active;
          }

          return active?.rating === entry.rating;
        };

        setPendingRatings((current) => {
          const next = { ...current };

          for (const key of confirmedKeys) {
            // Only clear if the value still matches (user may have re-rated while we polled) AND the
            // confirmed rating is actually present in the reloaded data; otherwise keep optimistic.
            if (next[key] && next[key].rating === pendingRatings[key].rating && ratingPresent(next[key])) {
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

    // When the tab returns to the foreground, poll right away rather than waiting out a full interval
    // that may have been throttled or skipped while hidden.
    const handleVisibility = () => {
      if (!cancelled && document.visibilityState === 'visible') {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => void poll(), 0);
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
    }

    timer = window.setTimeout(() => void poll(), PENDING_CONFIRM_POLL_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);

      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
    };
  }, [pendingRatings]);

  const selectDerivation = (derivation: TrustDerivation) => {
    setSelectedAddress(derivation.accountAddress);
  };

  const selectNode = (node: TrustGraphNode) => {
    setSelectedAddress((current) => (current === node.address ? null : node.address));
  };

  const clearGraphSelection = () => {
    setSelectedAddress(null);
  };

  const openNodeDetail = (node: TrustGraphNode) => {
    setIsFullscreen(false);
    setView('accounts');
    setSelectedAddress(node.address);
  };

  const showAccountDetail = selectedDerivation && !isFullscreen && view !== 'graph';

  return (
    <main className={`app-shell ${isFullscreen ? 'app-shell--fullscreen' : ''}`}>
      {!isFullscreen ? (
      <header className="app-header">
        <div className="app-header__identity">
          <span className="app-header__mark">
            <ShieldCheck aria-hidden="true" size={36} strokeWidth={2.7} />
          </span>
          <h1>Trust {APP_VERSION}</h1>
        </div>
      </header>
      ) : null}

      {error && !isFullscreen ? (
        <div className="error-banner" role="alert">
          <AlertTriangle size={18} />
          {error}
        </div>
      ) : null}

      {data.bridge && !ratingActionAvailable && !isFullscreen ? (
        // Read-only context (opened outside Home, or RATE_ACCOUNT unavailable): explain why rating is
        // disabled rather than leaving the disabled controls unexplained (UX-001). Gated on a resolved
        // bridge so it doesn't flash during the initial load.
        <div className="info-banner" role="note">
          <Info size={18} />
          {t('readonly.note')}
        </div>
      ) : null}

      <section className={`workspace ${isFullscreen ? 'workspace--fullscreen' : ''}`}>
        <div
          className={`main-panel ${isFullscreen ? 'main-panel--fullscreen' : ''} ${
            view === 'graph' ? 'main-panel--graph-view' : ''
          }`}
        >
          <div className={`view-controls ${view === 'graph' ? 'view-controls--over-graph' : ''}`}>
            <div className="view-controls__selectors">
              <ViewSelect onChange={handleViewChange} selectRef={viewSelectRef} view={view} />
              <CategorySelect category={category} onChange={setCategory} />
            </div>
            <FullscreenButton
              isFullscreen={isFullscreen}
              onToggle={() => setIsFullscreen((current) => !current)}
            />
          </div>
          {showAccountDetail ? (
            <AccountDetail
              category={category}
              detail={detail}
              live={live}
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
              {loading && view === 'graph' ? (
                <Suspense fallback={loadingPanel}>
                  <TrustGraphView
                    category={category}
                    derivations={filteredDerivations}
                    isLoading
                    isExpanded={isFullscreen}
                    onClearSelection={clearGraphSelection}
                    onOpenDetail={openNodeDetail}
                    onSelect={selectNode}
                    profiles={identityProfiles}
                    ratings={data.ratings}
                    selectedAddress={selectedAddress ?? undefined}
                    signature={graphSignature}
                  />
                </Suspense>
              ) : loading ? (
                loadingPanel
              ) : view === 'accounts' ? (
                <AccountsTable
                  category={category}
                  derivations={filteredDerivations}
                  live={live}
                  loadedCount={data.derivations.length}
                  onRate={setOpenRateAddress}
                  onRatingSubmitted={handleRatingSubmitted}
                  onResetFilters={() => {
                    setQuery('');
                  }}
                  onSelect={selectDerivation}
                  onSort={changeAccountSort}
                  openRateAddress={openRateAddress}
                  pendingByAddress={pendingByAddress}
                  profiles={identityProfiles}
                  query={query}
                  ratingActionAvailable={ratingActionAvailable}
                  self={self}
                  selectedAddress={selectedAddress ?? undefined}
                  sort={accountSort}
                  statusFilter="ALL"
                  totalCount={derivationTotal}
                  youRatedByAddress={youRatedByAddress}
                />
              ) : view === 'graph' ? (
                <Suspense fallback={loadingPanel}>
                  <TrustGraphView
                    category={category}
                    derivations={filteredDerivations}
                    isExpanded={isFullscreen}
                    onClearSelection={clearGraphSelection}
                    onOpenDetail={openNodeDetail}
                    onSelect={selectNode}
                    profiles={identityProfiles}
                    ratings={data.ratings}
                    selectedAddress={selectedAddress ?? undefined}
                    signature={graphSignature}
                  />
                </Suspense>
              ) : (
                <ChangesTable
                  changes={data.changes}
                  onSelectAccount={setSelectedAddress}
                  profiles={identityProfiles}
                  selectableAddresses={selectableAddresses}
                />
              )}
            </>
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
