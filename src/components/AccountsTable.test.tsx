// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AccountsTable } from './AccountsTable';
import type { AccountRatingCategory, RatingCounts, TrustDerivation } from '../types';

const counts = (positive: number, negative: number): RatingCounts => ({
  positiveLowCount: 0,
  positiveMediumCount: 0,
  positiveHighCount: 0,
  positiveVeryHighCount: 0,
  negativeLowCount: 0,
  negativeMediumCount: 0,
  negativeHighCount: 0,
  negativeVeryHighCount: 0,
  positiveRatingCount: positive,
  negativeRatingCount: negative,
  totalRatingCount: positive + negative,
});

const categories: AccountRatingCategory[] = ['SUBJECT', 'PLAYER', 'TRAINER', 'MANAGER'];
const derivation: TrustDerivation = {
  accountAddress: 'Qtarget',
  accountPublicKey: 'target-public-key',
  blocksMinted: 42,
  categories: categories.map((category, index) => ({
    category,
    inboundRatings: counts(index + 1, index),
    level: index + 1,
    levelScore: (index + 1) * 10,
    levelScoreCap: 100,
    mappedTrustStatus: index > 1 ? 'SILVER' : 'BRONZE',
    mappedTrustStatusValue: index > 1 ? 3 : 2,
    mappedTrustWeightPercent: index > 1 ? 50 : 25,
    score: (index + 1) * 100,
  })),
  derivedTrustStatus: 'SILVER',
  derivedTrustStatusValue: 3,
  derivedTrustWeightPercent: 50,
  live: true,
  mintingSeedMember: false,
  snapshotHeight: 100,
  snapshotTimestamp: 1_700_000_000_000,
};

describe('AccountsTable unified role directory', () => {
  it('shows every public role and opens the account instead of mounting row rating controls', () => {
    const onSelect = vi.fn();

    const { container } = render(
      <AccountsTable
        category="SUBJECT"
        derivations={[derivation]}
        live
        onSelect={onSelect}
        onSort={vi.fn()}
        profiles={{ Qtarget: { address: 'Qtarget', avatarSrc: null, name: 'Target' } }}
        sort={[{ direction: 'asc', key: 'account' }]}
        youRatedByKey={{
          'MANAGER:Qtarget': 4,
          'TRAINER:Qtarget': 3,
          'PLAYER:Qtarget': 2,
          'SUBJECT:Qtarget': 1,
        }}
      />,
    );

    expect(screen.getByRole('columnheader', { name: 'Designers' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Guides' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Voters' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Minters' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Rate$/i })).toBeNull();
    expect(container.querySelector('[data-label="Designers"] .you-rated')?.textContent).toBe('+4');
    expect(container.querySelector('[data-label="Minters"] .you-rated')?.textContent).toBe('+1');

    fireEvent.click(screen.getByRole('button', { name: /open target/i }));
    expect(onSelect).toHaveBeenCalledWith(derivation);
  });
});
