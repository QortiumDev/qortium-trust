// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AccountDetail } from './AccountDetail';
import type { AccountRatingCategory, RatingCounts, TrustDerivation } from '../types';

const counts = (): RatingCounts => ({
  positiveLowCount: 0,
  positiveMediumCount: 0,
  positiveHighCount: 0,
  positiveVeryHighCount: 0,
  negativeLowCount: 0,
  negativeMediumCount: 0,
  negativeHighCount: 0,
  negativeVeryHighCount: 0,
  positiveRatingCount: 1,
  negativeRatingCount: 0,
  totalRatingCount: 1,
});

const roles: AccountRatingCategory[] = ['SUBJECT', 'PLAYER', 'TRAINER', 'MANAGER'];
const selectedDerivation: TrustDerivation = {
  accountAddress: 'Qtarget',
  accountPublicKey: 'target-public-key',
  blocksMinted: 42,
  categories: roles.map((category, index) => ({
    category,
    inboundRatings: counts(),
    level: index + 1,
    levelScore: index + 1,
    levelScoreCap: 100,
    mappedTrustStatus: 'SILVER',
    mappedTrustStatusValue: 3,
    mappedTrustWeightPercent: 50,
    score: (index + 1) * 10,
  })),
  derivedTrustStatus: 'SILVER',
  derivedTrustStatusValue: 3,
  derivedTrustWeightPercent: 50,
  mintingSeedMember: false,
};

describe('AccountDetail role workspace (showAllRoles on)', () => {
  it('shows all roles, copy controls, and one active editor — no duplicated trust-flow diagram', () => {
    const onActiveCategoryChange = vi.fn();

    render(
      <AccountDetail
        category="SUBJECT"
        detail={{ explanation: null, loading: false, profile: null, publicKey: 'target-public-key' }}
        onActiveCategoryChange={onActiveCategoryChange}
        onBack={vi.fn()}
        onRatingSubmitted={vi.fn()}
        profile={{ address: 'Qtarget', avatarSrc: null, name: 'Target' }}
        profiles={{}}
        ratingActionAvailable={false}
        self={null}
        selectedDerivation={selectedDerivation}
        showAllRoles
        youRatedByKey={{ 'MANAGER:Qtarget': 4, 'SUBJECT:Qtarget': 1 }}
      />,
    );

    // The trust-flow diagram now lives only on the list screen (TrustFlowGuide), not here.
    expect(screen.queryByText('How trust moves through the community')).toBeNull();
    expect(screen.getAllByText('Minters').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Voters').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Guides').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Designers').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Rate this account')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /copy address/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /copy public key/i })).toBeTruthy();
    expect(screen.queryByText(/^Manager$/)).toBeNull();
    expect(screen.queryByText(/^Subject$/)).toBeNull();

    // Anchored to the start: the Guides card's own ladder copy now also mentions "Designers"
    // ("...Designers decide that."), so an unanchored match is ambiguous.
    fireEvent.click(screen.getByRole('button', { name: /^Designers/ }));
    expect(onActiveCategoryChange).toHaveBeenCalledWith('MANAGER');
    expect(screen.getAllByText('Rate this account')).toHaveLength(1);
  });
});

describe('AccountDetail Minters-only workspace (showAllRoles off)', () => {
  it('shows only the SUBJECT role card and workspace, and no trust-flow diagram', () => {
    render(
      <AccountDetail
        category="SUBJECT"
        detail={{ explanation: null, loading: false, profile: null, publicKey: 'target-public-key' }}
        onBack={vi.fn()}
        onRatingSubmitted={vi.fn()}
        profile={{ address: 'Qtarget', avatarSrc: null, name: 'Target' }}
        profiles={{}}
        ratingActionAvailable={false}
        self={null}
        selectedDerivation={selectedDerivation}
        showAllRoles={false}
        youRatedByKey={{ 'SUBJECT:Qtarget': 1 }}
      />,
    );

    expect(screen.queryByText('How trust moves through the community')).toBeNull();
    expect(screen.queryByRole('button', { name: /Designers/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Voters/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Guides/ })).toBeNull();
    expect(screen.getAllByText('Minters').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Rate this account')).toHaveLength(1);
  });
});
