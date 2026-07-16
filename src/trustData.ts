import type {
  AccountRating,
  AccountRatingCategory,
  TrustCategory,
  TrustDerivation,
} from './types';

export const TRUST_CATEGORY_ORDER = ['SUBJECT', 'PLAYER', 'TRAINER', 'MANAGER'] as const satisfies readonly AccountRatingCategory[];

export type TrustCategoryMap<T> = Record<AccountRatingCategory, T>;

export function createTrustCategoryMap<T>(
  getValue: (category: AccountRatingCategory) => T,
): TrustCategoryMap<T> {
  return {
    SUBJECT: getValue('SUBJECT'),
    PLAYER: getValue('PLAYER'),
    TRAINER: getValue('TRAINER'),
    MANAGER: getValue('MANAGER'),
  };
}

/**
 * Normalizes Core's category arrays into a fixed four-category record. A null value makes a
 * missing category explicit instead of silently shifting columns or borrowing another category.
 */
export function mapTrustCategories<T extends { category: AccountRatingCategory }>(
  categories: readonly T[],
): TrustCategoryMap<T | null> {
  const mapped = createTrustCategoryMap<T | null>(() => null);

  for (const category of categories) {
    mapped[category.category] = category;
  }

  return mapped;
}

export function mapDerivationCategories(derivation: TrustDerivation): TrustCategoryMap<TrustCategory | null> {
  return mapTrustCategories(derivation.categories);
}

export type CurrentUserTargetRatings = {
  targetAddress: string;
  targetPublicKey: string;
  ratings: TrustCategoryMap<AccountRating | null>;
};

export type CurrentUserRatingIndex = {
  byTargetAddress: Record<string, CurrentUserTargetRatings>;
  byTargetPublicKey: Record<string, CurrentUserTargetRatings>;
};

/**
 * Indexes an already-rater-filtered Core response across every category. Core exposes one active
 * edge per rater/target/category; if duplicate data is supplied, the last item wins.
 */
export function indexCurrentUserRatings(ratings: readonly AccountRating[]): CurrentUserRatingIndex {
  const byTargetAddress: Record<string, CurrentUserTargetRatings> = {};
  const byTargetPublicKey: Record<string, CurrentUserTargetRatings> = {};

  for (const rating of ratings) {
    let target = byTargetAddress[rating.targetAddress] ?? byTargetPublicKey[rating.targetPublicKey];

    if (!target) {
      target = {
        targetAddress: rating.targetAddress,
        targetPublicKey: rating.targetPublicKey,
        ratings: createTrustCategoryMap<AccountRating | null>(() => null),
      };
    }

    target.ratings[rating.category] = rating;
    byTargetAddress[rating.targetAddress] = target;
    byTargetPublicKey[rating.targetPublicKey] = target;
  }

  return { byTargetAddress, byTargetPublicKey };
}
