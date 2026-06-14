import type { AccountRatingCategory, TrustStatus } from './types';

export const TRUST_STATUSES: TrustStatus[] = ['SUSPICIOUS', 'UNVERIFIED', 'BRONZE', 'SILVER', 'GOLD'];

export const TRUST_CATEGORIES: AccountRatingCategory[] = ['SUBJECT', 'PLAYER', 'TRAINER', 'MANAGER'];

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
  return category.charAt(0) + category.slice(1).toLowerCase();
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
