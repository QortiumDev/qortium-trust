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
  it('activates only rows whose account is in the loaded list (click + Enter)', () => {
    const onSelectAccount = vi.fn();

    render(
      <ChangesTable
        changes={[change('Qinlist'), change('Qoutside')]}
        onSelectAccount={onSelectAccount}
        profiles={{}}
        selectableAddresses={new Set(['Qinlist'])}
      />,
    );

    const rows = screen.getAllByRole('row').filter((row) => row.tagName === 'TR' && row.hasAttribute('tabindex'));
    // Only the in-list account row is interactive (tabindex set).
    expect(rows).toHaveLength(1);

    fireEvent.click(rows[0]);
    expect(onSelectAccount).toHaveBeenCalledWith('Qinlist');

    fireEvent.keyDown(rows[0], { key: 'Enter' });
    expect(onSelectAccount).toHaveBeenCalledTimes(2);
  });

  it('renders no interactive rows when no drill-in handler is provided', () => {
    render(<ChangesTable changes={[change('Qinlist')]} profiles={{}} selectableAddresses={new Set(['Qinlist'])} />);

    // The table still renders (header + body rows) but none are keyboard-activatable.
    expect(screen.getAllByRole('row').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('row').some((row) => row.hasAttribute('tabindex'))).toBe(false);
  });
});
