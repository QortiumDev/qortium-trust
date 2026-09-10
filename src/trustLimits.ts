// Single source of truth for the directory/activity/rating-history bounds the app itself enforces,
// shared by App.tsx, recentActivity.ts, and the Developers reference (developerReference.ts) so the
// reference documents the real constants instead of a hand-typed, driftable copy of them.
export const PAGE_SIZE = 250;
export const RATING_PAGE_SIZE = 1000;
export const MAX_DERIVATION_LIMIT = 5_000;
export const MAX_RATINGS_SCAN = 20_000;
// Growing scan prefixes readRecentActivity() re-reads until a short response proves exhaustion.
export const ACTIVITY_SCAN_PREFIXES = [1_000, 4_000, 8_000];
