// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ChangesTable } from './ChangesTable';
import type { TrustStatusChange } from '../types';

const change = (address: string, category: TrustStatusChange['category'] = 'SUBJECT'): TrustStatusChange => ({
  accountPublicKey: `${address}-pub`,
  accountAddress: address,
  category,
  previousLevel: 1,
  newLevel: 2,
  previousTrustStatus: 'UNVERIFIED',
  newTrustStatus: 'BRONZE',
  previousScore: 10,
  newScore: 20,
  previousSnapshotHeight: 90,
  snapshotHeight: 100,
  snapshotTimestamp: 1_700_000_000_000,
});

describe('ChangesTable drill-in', () => {
  it('activates only account-name buttons whose account is in the loaded list', () => {
    const onSelectAccount = vi.fn();

    render(
      <ChangesTable
        changes={[change('Qinlist'), change('Qoutside')]}
        onSelectAccount={onSelectAccount}
        profiles={{}}
        selectableAddresses={new Set(['Qinlist'])}
        showAllRoles
      />,
    );

    const inList = screen.getByRole('button', { name: /open qinlist/i });
    const outside = screen.getByRole('button', { name: /open qoutside/i });
    expect(inList).not.toHaveProperty('disabled', true);
    expect(outside).toHaveProperty('disabled', true);

    fireEvent.click(inList);
    expect(onSelectAccount).toHaveBeenCalledWith('Qinlist');
  });

  it('disables account-name buttons when no drill-in handler is provided', () => {
    render(
      <ChangesTable
        changes={[change('Qinlist')]}
        profiles={{}}
        selectableAddresses={new Set(['Qinlist'])}
        showAllRoles
      />,
    );

    expect(screen.getAllByRole('row').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /open qinlist/i })).toHaveProperty('disabled', true);
  });
});

describe('ChangesTable Minters-first filtering (showAllRoles off)', () => {
  it('shows only SUBJECT changes and hides the Category column', () => {
    render(
      <ChangesTable
        changes={[change('Qminter', 'SUBJECT'), change('Qmanager', 'MANAGER')]}
        onSelectAccount={vi.fn()}
        profiles={{}}
        showAllRoles={false}
      />,
    );

    expect(screen.getByRole('button', { name: /open qminter/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /open qmanager/i })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Category' })).toBeNull();
  });

  it('shows the empty state when every change is filtered out', () => {
    render(
      <ChangesTable
        changes={[change('Qmanager', 'MANAGER')]}
        onSelectAccount={vi.fn()}
        profiles={{}}
        showAllRoles={false}
      />,
    );

    expect(screen.getByText('No changes yet.')).toBeTruthy();
  });
});
