// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ChangesTable } from './ChangesTable';
import type { TrustStatusChange } from '../types';

const change = (address: string): TrustStatusChange => ({
  accountPublicKey: `${address}-pub`,
  accountAddress: address,
  category: 'SUBJECT',
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
    render(<ChangesTable changes={[change('Qinlist')]} profiles={{}} selectableAddresses={new Set(['Qinlist'])} />);

    expect(screen.getAllByRole('row').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /open qinlist/i })).toHaveProperty('disabled', true);
  });
});
