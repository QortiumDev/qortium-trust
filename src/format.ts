import type { AccountRatingCategory, TrustStatus } from './types';
import { t, type TranslationKey } from './i18n';

export const TRUST_STATUSES: TrustStatus[] = ['SUSPICIOUS', 'UNVERIFIED', 'BRONZE', 'SILVER', 'GOLD'];

export const TRUST_CATEGORIES: AccountRatingCategory[] = ['SUBJECT', 'PLAYER', 'TRAINER', 'MANAGER'];

// Display labels only. The wire/API values stay 'SUBJECT' | 'PLAYER' | 'TRAINER' | 'MANAGER';
// the Core API both accepts and returns those raw values, so we remap purely at render time.
const CATEGORY_LABELS: Record<AccountRatingCategory, TranslationKey> = {
  SUBJECT: 'category.minters.label',
  PLAYER: 'category.voters.label',
  TRAINER: 'category.guides.label',
  MANAGER: 'category.designers.label',
};

// Single source of truth for the wire-name -> public-name renaming (Stage B terminology
// consolidation, replacing the regex-based `publicTrustText()` that used to live in
// AccountDetail.tsx). Kept as plain uppercase English strings, not TranslationKeys: this only
// rewrites already-English server prose (Core's requirement descriptions), which stays English —
// a known limitation, not a translation gap this map is meant to fix.
const PUBLIC_CATEGORY_NAME: Record<AccountRatingCategory, string> = {
  SUBJECT: 'MINTER',
  PLAYER: 'VOTER',
  TRAINER: 'GUIDE',
  MANAGER: 'DESIGNER',
};

function titleCase(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

// Rewrites Core's internal category names (SUBJECT/PLAYER/TRAINER/MANAGER, in both ALL-CAPS and
// Title Case forms) to their public-facing names (Minter/Voter/Guide/Designer) inside server-authored
// prose such as trust-requirement descriptions. Core's prose is English-only; this function does not
// translate it, only renames the category — see the module comment above.
export function publicizeTrustText(value: string) {
  return (Object.entries(PUBLIC_CATEGORY_NAME) as [AccountRatingCategory, string][]).reduce(
    (result, [wireName, publicName]) =>
      result
        .replace(new RegExp(`\\b${wireName}\\b`, 'g'), publicName)
        .replace(
          new RegExp(`\\b${titleCase(wireName)}(?=\\s+(?:Gold|Silver|Bronze|level|threshold))`, 'g'),
          titleCase(publicName),
        ),
    value,
  );
}

// Friendly labels for the WHICH_UI runtime string the bridge reports. Home returns environment
// tokens ('QORTIUM_HOME_ELECTRON' on desktop, 'QORTIUM_HOME_ANDROID' on Android); collapse those to
// a single readable name, and surface anything unrecognized verbatim so new runtimes still show.
const RUNTIME_LABELS: Record<string, TranslationKey> = {
  BROWSER_DEV: 'runtime.browserDev',
  QORTIUM_HOME: 'runtime.qortiumHome',
  QORTIUM_HOME_ANDROID: 'runtime.qortiumHome',
  QORTIUM_HOME_ELECTRON: 'runtime.qortiumHome',
};

export function formatRuntimeLabel(ui: string | null | undefined) {
  if (!ui) {
    return t('app.loading');
  }

  const labelKey = RUNTIME_LABELS[ui.trim().toUpperCase()];

  return labelKey ? t(labelKey) : ui;
}

export function compactAddress(value: string | undefined, head = 7, tail = 5) {
  if (!value) {
    return t('value.unknown');
  }

  if (value.length <= head + tail + 3) {
    return value;
  }

  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

export function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '-';
  }

  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

export function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '-';
  }

  return `${formatNumber(value)}%`;
}

export function formatDate(value: number | null | undefined) {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function statusLabel(status: TrustStatus) {
  switch (status) {
    case 'BRONZE':
      return t('status.bronze');
    case 'GOLD':
      return t('status.gold');
    case 'SILVER':
      return t('status.silver');
    case 'SUSPICIOUS':
      return t('status.suspicious');
    case 'UNVERIFIED':
    default:
      return t('status.unverified');
  }
}

export function categoryLabel(category: AccountRatingCategory) {
  // Fall back to title-casing any unexpected wire value the API might return.
  const labelKey = CATEGORY_LABELS[category];

  return labelKey ? t(labelKey) : category.charAt(0) + category.slice(1).toLowerCase();
}

// One-line role descriptions surfaced under the category selector, in plain language.
const CATEGORY_DESCRIPTIONS: Record<AccountRatingCategory, TranslationKey> = {
  SUBJECT: 'category.minters.detail',
  PLAYER: 'category.voters.detail',
  TRAINER: 'category.guides.detail',
  MANAGER: 'category.designers.detail',
};

export function categoryDescription(category: AccountRatingCategory) {
  // Unknown wire values have no description; return '' so callers can render-or-skip cleanly.
  const descriptionKey = CATEGORY_DESCRIPTIONS[category];

  return descriptionKey ? t(descriptionKey) : '';
}

// Minter (SUBJECT) ratings use Yes/No wording ("is this a unique minting account?"); every other
// category uses Positive/Negative role wording. One place decides which applies so every rating
// display (option lists, current/pending rating lines, you-rated cells, ratings-received lists)
// stays consistent (#Stage B copy rules).
export function ratingVariantForCategory(category: AccountRatingCategory): 'minter' | 'role' {
  return category === 'SUBJECT' ? 'minter' : 'role';
}

// 1..4 confidence magnitude -> translation key. Reuses the existing rating-magnitude i18n keys
// (never duplicate parallel copies of Low/Medium/High/Very high).
const RATING_MAGNITUDE_KEYS: Record<1 | 2 | 3 | 4, TranslationKey> = {
  1: 'rating.magnitude.low',
  2: 'rating.magnitude.medium',
  3: 'rating.magnitude.high',
  4: 'rating.magnitude.veryHigh',
};

// Sign and magnitude are always presented separately (owner copy rule): never a combined
// "+3 - Positive (High)" string. Renders e.g. "Yes · High" (minter) or
// "Positive · High" (role). Callers must never pass 0 — a "not rated"/"cleared" value
// has its own copy (t('rating.notRated'), t('rating.option.remove'), etc).
export function ratingSignedLabel(value: number, variant: 'minter' | 'role') {
  const sign =
    value > 0
      ? t(variant === 'minter' ? 'value.yes' : 'status.positive')
      : t(variant === 'minter' ? 'value.no' : 'status.negative');
  const magnitude = Math.min(Math.max(Math.abs(value), 1), 4) as 1 | 2 | 3 | 4;

  return t('rating.value', { magnitude: t(RATING_MAGNITUDE_KEYS[magnitude]), sign });
}

// The role a rater must be trusted as for their rating in `category` to count at all (the
// evaluator layer one level up the trust ladder). MANAGER (Designer) ratings are the exception —
// evaluator weight there is the rater's own Designer influence pool, not a separate role, so callers
// asking about MANAGER should use the dedicated influence copy instead of this label.
const EVALUATOR_ROLE_KEYS: Partial<Record<AccountRatingCategory, TranslationKey>> = {
  SUBJECT: 'role.voter',
  PLAYER: 'role.guide',
  TRAINER: 'role.designer',
};

export function evaluatorRoleLabel(category: AccountRatingCategory): string | null {
  const key = EVALUATOR_ROLE_KEYS[category];

  return key ? t(key) : null;
}

// The singular role name a category itself grants (distinct from EVALUATOR_ROLE_KEYS above, which
// is the role *one level up* that decides whether a rating in this category counts). Used for the
// role rating flow's "Rate this account as a {role}:" question. SUBJECT (Minters) has no role rating
// flow — it is the Minter question — so it is intentionally absent here.
const ROLE_NAME_KEYS: Partial<Record<AccountRatingCategory, TranslationKey>> = {
  PLAYER: 'role.voter',
  TRAINER: 'role.guide',
  MANAGER: 'role.designer',
};

export function roleNameForCategory(category: AccountRatingCategory): string | null {
  const key = ROLE_NAME_KEYS[category];

  return key ? t(key) : null;
}

export function ratingTone(rating: number) {
  if (rating > 0) {
    return 'positive';
  }

  if (rating < 0) {
    return 'negative';
  }

  return 'neutral';
}

export function statusTone(status: TrustStatus) {
  switch (status) {
    case 'SUSPICIOUS':
      return 'negative';
    case 'GOLD':
      return 'gold';
    case 'SILVER':
      return 'silver';
    case 'BRONZE':
      return 'bronze';
    case 'UNVERIFIED':
    default:
      return 'neutral';
  }
}
