import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import trustIconUrl from './assets/qortium-trust-protoicon-black-transparent.png';
import { createTrustGraphModel, filterDerivations, type TrustGraphNode } from './graphModel';
import { loadIdentityProfile } from './identityProfiles';
import { getBridgeState } from './qdnRequest';
import { resolveQdnAssetUrl } from './qdnAsset';
import {
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
} from './trustApi';
import {
  applyDisplaySettings,
  getDisplaySettingsUpdateFromMessage,
  getInitialDisplaySettings,
} from './displaySettings';
import {
  categoryDescription,
  categoryLabel,
  formatDate,
  formatNumber,
  formatRuntimeLabel,
  statusLabel,
  TRUST_CATEGORIES,
  TRUST_STATUSES,
} from './format';
import type {
  AccountRating,
  AccountRatingCategory,
  IdentityProfilesByAddress,
  SelfAccount,
  TrustDerivation,
  TrustPolicy,
  TrustStatus,
  TrustSummary,
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
import { NodeSyncPill } from './components/Identity';
import { TrustGraph } from './components/TrustGraph';
import { AccountsTable } from './components/AccountsTable';
import { ChangesTable } from './components/ChangesTable';
import { ResourceRatingsTable } from './components/ResourceRatingsTable';
import { AccountDetail } from './components/AccountDetail';

type QdnRenderWindow = Window &
  typeof globalThis & {
    _qdnContext?: unknown;
    _qdnIdentifier?: unknown;
  };

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
  resources: [],
  summary: null,
};

function getQdnAssetUrl(assetUrl: string) {
  if (typeof window === 'undefined') {
    return assetUrl;
  }

  const qdnWindow = window as QdnRenderWindow;

  return resolveQdnAssetUrl(assetUrl, {
    context: qdnWindow._qdnContext,
    identifier: qdnWindow._qdnIdentifier,
    origin: window.location.origin,
    pathname: window.location.pathname,
    search: window.location.search,
  });
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
    <div className="segmented-control" aria-label={t('label.trustCategory')}>
      {TRUST_CATEGORIES.map((candidate) => (
        <button
          aria-pressed={candidate === category}
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

const VIEW_OPTIONS: { labelKey: TranslationKey; value: ViewMode }[] = [
  { labelKey: 'nav.accounts', value: 'accounts' },
  { labelKey: 'nav.graph', value: 'graph' },
  { labelKey: 'nav.changes', value: 'changes' },
  { labelKey: 'nav.resources', value: 'resources' },
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

function PolicyFooter({ policy, summary }: { policy: TrustPolicy | null; summary: TrustSummary | null }) {
  if (!policy && !summary) {
    return null;
  }

  return (
    <footer className="policy-footer">
      <span>{t('label.activeWeight')}: {categoryLabel(summary?.activeWeightCategory ?? policy?.activeWeightCategory ?? 'SUBJECT')}</span>
      <span>{t('label.ratingCooldown')}: {formatNumber(policy?.accountRatingChangeCooldownBlocks)} {t('label.blocks')}</span>
      <span>{t('label.positiveBranches')}: {formatNumber(policy?.positiveMinBranchCount)}</span>
      <span>{t('label.suspiciousRaters')}: {formatNumber(policy?.suspiciousMinRaterCount)}</span>
      <span>{t('label.snapshot')}: {formatDate(summary?.snapshotTimestamp)}</span>
    </footer>
  );
}

export default function App() {
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
  // Default to live derivations so the Level/Blocks/vote-weight columns carry real minting data off
  // each row (#9) — snapshot rows return 0 for those. Toggling Live off shows the on-chain snapshot.
  const [live, setLive] = useState(true);
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
      const [bridge, nodeStatus, summary, policy, derivations, ratings, changes, resources] = await Promise.all([
        getBridgeState(),
        getNodeStatus(),
        getTrustSummary(),
        getTrustPolicy(),
        getTrustDerivation({ category, limit: 250, live, ...serverDerivationSort }),
        getAccountRatings({ category, limit: 1000 }),
        getTrustChanges({ category, limit: 25 }),
        getResourceRatings({ limit: 25, reverse: true }),
      ]);

      if (!isLatest()) {
        return;
      }

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
  }, [category, live, serverDerivationSort]);

  // Refetch only the slices a new rating changes — the category derivations and ratings — and merge
  // them into state so the other arrays (changes/resources/summary/policy) keep stable references
  // (#12), avoiding a full 8-call reload and downstream re-derivation per confirmation.
  const refreshRatingSlices = useCallback(async (refreshCategory: AccountRatingCategory = category) => {
    const token = ++loadTokenRef.current;

    const [derivations, ratings] = await Promise.all([
      getTrustDerivation({ category: refreshCategory, limit: 250, live, ...serverDerivationSort }),
      getAccountRatings({ category: refreshCategory, limit: 1000 }),
    ]);

    if (loadTokenRef.current !== token) {
      return;
    }

    setData((current) => ({ ...current, derivations, ratings }));
  }, [category, live, serverDerivationSort]);

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
    setAccountSort((current) => changeAccountSortState(current, key));
  }, []);

  const normalizedQuery = query.trim().toLowerCase();

  const filteredDerivations = useMemo(() => {
    // Empty-query short-circuit (#13): data.derivations is already unique by address, so apply only
    // the status filter and skip the Map de-dupe + identityProfiles dependency. This keeps profile
    // batches from invalidating the list (and the downstream graph memo).
    if (!normalizedQuery) {
      if (statusFilter === 'ALL') {
        return data.derivations;
      }

      return data.derivations.filter((derivation) => derivation.derivedTrustStatus === statusFilter);
    }

    const searched = filterDerivations(data.derivations, query).concat(
      data.derivations.filter((derivation) => {
        const profile = identityProfiles[derivation.accountAddress];
        return profile?.name?.toLowerCase().includes(normalizedQuery);
      }),
    );
    const uniqueSearched = [...new Map(searched.map((derivation) => [derivation.accountAddress, derivation])).values()];

    if (statusFilter === 'ALL') {
      return uniqueSearched;
    }

    return uniqueSearched.filter((derivation) => derivation.derivedTrustStatus === statusFilter);
  }, [data.derivations, identityProfiles, normalizedQuery, query, statusFilter]);

  // Derive from the unfiltered list so the full-width detail survives search/status-filter changes
  // and search close. The table row highlight and graph still key off filteredDerivations.
  const selectedDerivation = useMemo(
    () => data.derivations.find((derivation) => derivation.accountAddress === selectedAddress) ?? null,
    [data.derivations, selectedAddress],
  );

  // Stable signature of the inputs to the (expensive, 320-tick) graph sim: it depends only on the
  // displayed addresses, the rating edges, and the category — never on identityProfiles. Memoizing on
  // this string instead of array identity stops identity-profile batches / silent polls from re-running
  // the sim when nothing graph-relevant changed (#6).
  const graphSignature = useMemo(
    () =>
      JSON.stringify([
        category,
        filteredDerivations.map((derivation) => derivation.accountAddress),
        data.ratings.map((rating) => [rating.raterAddress, rating.targetAddress, rating.rating]),
      ]),
    [category, data.ratings, filteredDerivations],
  );

  const graph = useMemo(
    // Only build the graph model when the graph view is active; an empty graph otherwise so the sim
    // never runs on the Accounts/Changes/Resources views (#6).
    () => (view === 'graph' ? createTrustGraphModel(filteredDerivations, data.ratings, category) : createTrustGraphModel([], [], category)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gated on graphSignature (stable input
    // signature) + view rather than the array identities folded into the signature.
    [view, graphSignature],
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
            aria-label={searchOpen ? t('search.hideAccounts') : t('action.searchAccounts')}
            className={`icon-button ${searchOpen ? 'icon-button--active' : ''}`}
            onClick={toggleSearch}
            ref={searchToggleRef}
            title={t('action.searchAccounts')}
            type="button"
          >
            <Search size={18} />
          </button>
          <span className="runtime-pill">{formatRuntimeLabel(data.bridge?.ui)}</span>
          <button aria-label={t('action.refresh')} className="icon-button" disabled={loading} onClick={() => void loadData()} title={t('action.refresh')} type="button">
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
                aria-label={t('search.placeholder')}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    toggleSearch();
                  }
                }}
                placeholder={t('search.placeholder')}
                ref={searchInputRef}
                value={query}
              />
              <button aria-label={t('action.closeSearch')} className="search-field__close" onClick={toggleSearch} type="button">
                <X size={15} />
              </button>
            </div>
          ) : null}
          <ViewSelect onChange={handleViewChange} selectRef={viewSelectRef} view={view} />
          <label
            className={`live-toggle ${live ? 'live-toggle--on' : ''}`}
            title={t('toggle.liveTitle')}
          >
            <input checked={live} onChange={(event) => setLive(event.target.checked)} type="checkbox" />
            <span>{t('label.live')}</span>
          </label>
          <select
            aria-label={t('label.trustStatus')}
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
        </div>
      </section>

      {error ? (
        <div className="error-banner" role="alert">
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
                <TrustGraph
                  graph={graph}
                  isLoading
                  onSelect={selectNode}
                  profiles={identityProfiles}
                  selectedAddress={selectedAddress ?? undefined}
                />
              ) : loading ? (
                <div aria-busy="true" aria-live="polite" className="loading-panel" role="status">
                  <div className="skeleton-block" />
                  <div className="skeleton-block short" />
                  <div className="skeleton-table" />
                  <span className="sr-only">{t('app.loading')}</span>
                </div>
              ) : view === 'accounts' ? (
                <AccountsTable
                  category={category}
                  derivations={filteredDerivations}
                  live={live}
                  onRate={setOpenRateAddress}
                  onRatingSubmitted={handleRatingSubmitted}
                  onResetFilters={() => {
                    setQuery('');
                    setStatusFilter('ALL');
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
                  statusFilter={statusFilter}
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
