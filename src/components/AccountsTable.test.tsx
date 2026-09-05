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
  mintingSeedMember: false,
};

describe('AccountsTable unified role directory (showAllRoles on)', () => {
  it('shows every public role and opens the account instead of mounting row rating controls', () => {
    const onSelect = vi.fn();

    const { container } = render(
      <AccountsTable
        category="SUBJECT"
        derivations={[derivation]}
        onSelect={onSelect}
        onSort={vi.fn()}
        profiles={{ Qtarget: { address: 'Qtarget', avatarSrc: null, name: 'Target' } }}
        showAllRoles
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
    // Decomposed sign+magnitude form (owner copy rule): role columns use Positive/Negative, the
    // Minters column uses Yes/No.
    expect(container.querySelector('[data-label="Designers"] .you-rated')?.textContent).toBe('Positive · Very high confidence');
    expect(container.querySelector('[data-label="Minters"] .you-rated')?.textContent).toBe('Yes · Low confidence');

    fireEvent.click(screen.getByRole('button', { name: /open target/i }));
    expect(onSelect).toHaveBeenCalledWith(derivation);
  });
});

describe('AccountsTable simplified Minters directory (showAllRoles off)', () => {
  it('shows only the Minters columns, ignoring the app category prop', () => {
    const onSelect = vi.fn();

    const { container } = render(
      <AccountsTable
        category="MANAGER"
        derivations={[derivation]}
        onSelect={onSelect}
        onSort={vi.fn()}
        profiles={{ Qtarget: { address: 'Qtarget', avatarSrc: null, name: 'Target' } }}
        showAllRoles={false}
        sort={[{ direction: 'asc', key: 'account' }]}
        youRatedByKey={{
          'MANAGER:Qtarget': 4,
          'SUBJECT:Qtarget': 1,
        }}
      />,
    );

    // Sortable headers wrap their label in a button with a sr-only sort-state suffix, so the
    // accessible name is "Account, not sorted" etc. — match the label as a prefix. The status column
    // header reads "Trust status" in both toggle states (#Stage B, task 6 consolidation).
    expect(screen.getByRole('columnheader', { name: /^Account,/ })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /^Trust status,/ })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /^Trust level,/ })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /^Blocks minted,/ })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /^You rated,/ })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: 'Designers' })).toBeNull();

    // SUBJECT (Minters) data, not the MANAGER category passed in `category` — index 0's mapped
    // status is Bronze/level 1, MANAGER (index 3) would be Silver/level 4 and rated +4.
    expect(container.querySelector('[data-label="Trust status"]')?.textContent).toBe('Bronze');
    expect(container.querySelector('[data-label="Trust level"]')?.textContent).toBe('1');
    expect(container.querySelector('[data-label="You rated"] .you-rated')?.textContent).toBe('Yes · Low confidence');
    expect(screen.queryByText('Positive · Very high confidence')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /open target/i }));
    expect(onSelect).toHaveBeenCalledWith(derivation);
  });
});

it('keeps all four roles and blocks minted visible when a role rating action is opened', () => {
  const onRate = vi.fn();
  const { container } = render(<AccountsTable category="SUBJECT" derivations={[derivation]} onSelect={vi.fn()} onSort={vi.fn()} onRate={onRate} ratingActionAvailable profiles={{}} showAllRoles sort={[{ key: 'account', direction: 'asc' }]} />);
  const roleCells = container.querySelectorAll('.account-role-cell');
  expect(roleCells).toHaveLength(4);
  expect(container.querySelector('.account-blocks-cell')?.textContent).toBe('42');
  fireEvent.click(roleCells[1].querySelector('button')!);
  expect(onRate).toHaveBeenCalledWith(derivation, 'TRAINER');
  expect(container.querySelectorAll('.account-role-cell')).toHaveLength(4);
});

it('sorts personal ratings using the same category-keyed values displayed in the cells', () => {
  const another = { ...derivation, accountAddress: 'Qanother' };
  const { container } = render(<AccountsTable category="SUBJECT" derivations={[derivation, another]} onSelect={vi.fn()} onSort={vi.fn()} profiles={{}} showAllRoles={false} sort={[{ key: 'youRated', direction: 'desc' }]} youRatedByKey={{ 'SUBJECT:Qtarget': 1, 'SUBJECT:Qanother': 4 }} />);
  expect(container.querySelector('tbody tr .identity-name')?.textContent).toBe('Qanother');
});
