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
  SUBJECT: 'category.minters.description',
  PLAYER: 'category.voters.description',
  TRAINER: 'category.guides.description',
  MANAGER: 'category.designers.description',
};

export function categoryDescription(category: AccountRatingCategory) {
  // Unknown wire values have no description; return '' so callers can render-or-skip cleanly.
  const descriptionKey = CATEGORY_DESCRIPTIONS[category];

  return descriptionKey ? t(descriptionKey) : '';
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
