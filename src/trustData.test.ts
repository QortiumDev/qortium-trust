import { describe, expect, it } from 'vitest';
import {
  TRUST_CATEGORY_ORDER,
  createTrustCategoryMap,
  indexCurrentUserRatings,
  mapTrustCategories,
} from './trustData';
import type { AccountRating, AccountRatingCategory } from './types';

function rating(
  targetAddress: string,
  targetPublicKey: string,
  category: AccountRatingCategory,
  value: number,
): AccountRating {
  return {
    targetAddress,
    targetPublicKey,
    raterAddress: 'Qrater',
    raterPublicKey: 'raterPub',
    category,
    rating: value,
    ratingDirection: value > 0 ? 'POSITIVE' : 'NEGATIVE',
    ratingConfidence: Math.abs(value),
  };
}

describe('trust category mapping', () => {
  it('uses the stable public workflow order from Minters through Designers', () => {
    expect(TRUST_CATEGORY_ORDER).toEqual(['SUBJECT', 'PLAYER', 'TRAINER', 'MANAGER']);
  });

  it('creates values for all four categories', () => {
    expect(createTrustCategoryMap((category) => category.toLowerCase())).toEqual({
      SUBJECT: 'subject',
      PLAYER: 'player',
      TRAINER: 'trainer',
      MANAGER: 'manager',
    });
  });

  it('maps unordered Core arrays without borrowing values for missing categories', () => {
    const mapped = mapTrustCategories([
      { category: 'MANAGER' as const, score: 40 },
      { category: 'SUBJECT' as const, score: 10 },
    ]);

    expect(mapped).toEqual({
      SUBJECT: { category: 'SUBJECT', score: 10 },
      PLAYER: null,
      TRAINER: null,
      MANAGER: { category: 'MANAGER', score: 40 },
    });
  });
});

describe('current user rating index', () => {
  it('groups every category under one target and supports address or public-key lookup', () => {
    const subject = rating('Qtarget', 'targetPub', 'SUBJECT', 4);
    const manager = rating('Qtarget', 'targetPub', 'MANAGER', 2);
    const index = indexCurrentUserRatings([manager, subject]);

    expect(index.byTargetAddress.Qtarget).toBe(index.byTargetPublicKey.targetPub);
    expect(index.byTargetAddress.Qtarget.ratings).toEqual({
      SUBJECT: subject,
      PLAYER: null,
      TRAINER: null,
      MANAGER: manager,
    });
  });

  it('keeps targets separate and lets the final duplicate edge win', () => {
    const oldSubject = rating('Qone', 'pubOne', 'SUBJECT', 1);
    const newSubject = rating('Qone', 'pubOne', 'SUBJECT', 3);
    const other = rating('Qtwo', 'pubTwo', 'PLAYER', -2);
    const index = indexCurrentUserRatings([oldSubject, other, newSubject]);

    expect(index.byTargetAddress.Qone.ratings.SUBJECT).toBe(newSubject);
    expect(index.byTargetAddress.Qtwo.ratings.PLAYER).toBe(other);
    expect(Object.keys(index.byTargetAddress)).toEqual(['Qone', 'Qtwo']);
  });
});
