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
  live: true,
  mintingSeedMember: false,
  snapshotHeight: 100,
  snapshotTimestamp: 1_700_000_000_000,
};

describe('AccountDetail role workspace', () => {
  it('shows the community trust path, all roles, copy controls, and one active editor', () => {
    const onActiveCategoryChange = vi.fn();

    render(
      <AccountDetail
        category="SUBJECT"
        detail={{ explanation: null, loading: false, profile: null, publicKey: 'target-public-key' }}
        live
        onActiveCategoryChange={onActiveCategoryChange}
        onBack={vi.fn()}
        onRatingSubmitted={vi.fn()}
        profile={{ address: 'Qtarget', avatarSrc: null, name: 'Target' }}
        profiles={{}}
        ratingActionAvailable={false}
        self={null}
        selectedDerivation={selectedDerivation}
        youRatedByCategory={{ MANAGER: 4, SUBJECT: 1 }}
      />,
    );

    expect(screen.getByText('How trust moves through the community')).toBeTruthy();
    expect(screen.getAllByText('Designers shape how trust flows.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Minters').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Voters').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Guides').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Designers').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Rate this account')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /copy address/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /copy public key/i })).toBeTruthy();
    expect(screen.queryByText(/^Manager$/)).toBeNull();
    expect(screen.queryByText(/^Subject$/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Designers/ }));
    expect(onActiveCategoryChange).toHaveBeenCalledWith('MANAGER');
    expect(screen.getAllByText('Rate this account')).toHaveLength(1);
  });
});
