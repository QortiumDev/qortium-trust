import type { AccountRatingCategory, TrustStatus } from './types';

export const TRUST_STATUSES: TrustStatus[] = ['SUSPICIOUS', 'UNVERIFIED', 'BRONZE', 'SILVER', 'GOLD'];

export const TRUST_CATEGORIES: AccountRatingCategory[] = ['SUBJECT', 'PLAYER', 'TRAINER', 'MANAGER'];

// Display labels only. The wire/API values stay 'SUBJECT' | 'PLAYER' | 'TRAINER' | 'MANAGER';
// the Core API both accepts and returns those raw values, so we remap purely at render time.
const CATEGORY_LABELS: Record<AccountRatingCategory, string> = {
  SUBJECT: 'Minters',
  PLAYER: 'Voters',
  TRAINER: 'Guides',
  MANAGER: 'Designers',
};

// Friendly labels for the WHICH_UI runtime string the bridge reports. Home returns environment
// tokens ('QORTIUM_HOME_ELECTRON' on desktop, 'QORTIUM_HOME_ANDROID' on Android); collapse those to
// a single readable name, and surface anything unrecognized verbatim so new runtimes still show.
const RUNTIME_LABELS: Record<string, string> = {
  BROWSER_DEV: 'Browser dev',
  QORTIUM_HOME: 'Qortium Home',
  QORTIUM_HOME_ANDROID: 'Qortium Home',
  QORTIUM_HOME_ELECTRON: 'Qortium Home',
};

export function formatRuntimeLabel(ui: string | null | undefined) {
  if (!ui) {
    return 'Loading';
  }

  return RUNTIME_LABELS[ui.trim().toUpperCase()] ?? ui;
}

export function compactAddress(value: string | undefined, head = 7, tail = 5) {
  if (!value) {
    return 'Unknown';
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
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export function categoryLabel(category: AccountRatingCategory) {
  // Fall back to title-casing any unexpected wire value the API might return.
  return CATEGORY_LABELS[category] ?? category.charAt(0) + category.slice(1).toLowerCase();
}

// One-line role descriptions surfaced under the category selector, in plain language.
const CATEGORY_DESCRIPTIONS: Record<AccountRatingCategory, string> = {
  SUBJECT: 'Whether you trust this account to be a block minter.',
  PLAYER: 'Whether you trust this account to rate other accounts in the trust network.',
  TRAINER:
    'Whether you trust this account to understand the trust network well enough to explain it to others.',
  MANAGER:
    'Whether you trust this account to understand the trust network well enough to help vote on governance decisions.',
};

export function categoryDescription(category: AccountRatingCategory) {
  // Unknown wire values have no description; return '' so callers can render-or-skip cleanly.
  return CATEGORY_DESCRIPTIONS[category] ?? '';
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
