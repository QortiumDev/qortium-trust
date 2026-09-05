// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AccountDetail } from './AccountDetail';
import type { AccountRatingCategory, AccountTrustExplanation, RatingCounts, TrustCategoryExplanation, TrustDerivation, TrustStatus } from '../types';

vi.mock('../browserAvatar', () => ({ fetchBrowserAvatar: vi.fn().mockResolvedValue({ kind: 'unavailable' }) }));

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
    expect(screen.getByText('Detailed requirements are unavailable for this account.')).toBeTruthy();
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


describe('Standing evidence', () => {
  it.each([
    [3, 'GOLD', 'SUBJECT', 3, 4],
    [4, 'GOLD', 'SUBJECT', 4, undefined],
    [2, 'SILVER', 'SUBJECT', 2, 3],
    [3, 'GOLD', 'PLAYER', 3, undefined],
    [0, 'UNVERIFIED', 'SUBJECT', 1, undefined],
    [-1, 'SUSPICIOUS', 'SUBJECT', undefined, undefined],
  ] as const)('explains level %s %s %s before any higher level', (level, status, category, displayed, higher) => {
    const maxLevel = category === 'SUBJECT' ? 4 : 3;
    const explanationCategory: TrustCategoryExplanation = {
      ...selectedDerivation.categories[0], category, level, mappedTrustStatus: status as TrustStatus,
      mappedTrustWeightPercent: 100, inboundRatings: counts(),
      configuredLevels: Array.from({ length: maxLevel }, (_, index) => ({ level: index + 1, threshold: 100, levelScoreCap: 100 })),
      positiveMinBranchCount: 2, suspiciousThreshold: -100, suspiciousLevelScoreCap: 100,
      suspiciousMinRaterCount: 2, suspiciousMinBranchCount: 2, suspiciousMinRatingConfidence: 2,
      requirements: [
        { name: 'positive.raw-score', description: 'Nonnegative score', actual: '100', required: '0', passed: level >= 0 },
        { name: 'suspicious.score', description: 'Suspicious score condition', actual: '-100', required: '-100', passed: level < 0 },
        ...Array.from({ length: maxLevel }, (_, index) => ({
          name: `level.${index + 1}.support`, description: `Support for level ${index + 1}`,
          actual: index < level ? '2' : '0', required: '2', passed: index < level,
        })),
      ],
      topPositiveImpacts: [], topNegativeImpacts: [],
    };
    const explanation: AccountTrustExplanation = {
      targetAddress: 'Qtarget', targetPublicKey: 'target-public-key', trustStatus: status,
      trustStatusValue: 4, trustWeightPercent: 100, activeWeightCategory: category,
      mintingSeedMember: true, categories: [explanationCategory],
    };
    const { container } = render(<AccountDetail category={category}
      detail={{ explanation, loading: false, profile: null, publicKey: 'target-public-key' }}
      onBack={vi.fn()} onRatingSubmitted={vi.fn()} profiles={{}} ratingActionAvailable={false}
      self={null} selectedDerivation={selectedDerivation} showAllRoles youRatedByKey={{}} />);
    const disclosure = container.querySelector<HTMLDetailsElement>('.role-requirements')!;
    expect(disclosure.open).toBe(false);
    fireEvent.click(screen.getByText('Why this standing?'));
    const currentEvidence = disclosure.querySelector(':scope > .requirement-list')!;
    if (displayed !== undefined) {
      expect(currentEvidence.textContent).toContain(`Support for level ${displayed}`);
      if (higher) expect(currentEvidence.textContent).not.toContain(`Support for level ${higher}`);
    } else {
      expect(currentEvidence.textContent).toContain('Suspicious score condition');
      expect(currentEvidence.querySelector('.requirement--passed')).toBeNull();
    }
    const next = disclosure.querySelector<HTMLDetailsElement>('.role-higher-requirements');
    if (higher) {
      expect(next?.open).toBe(false);
      expect(next?.querySelector('summary')?.textContent).toBe(`Higher trust level: ${higher}`);
      expect(next?.textContent).toContain(`Support for level ${higher}`);
    } else expect(next).toBeNull();
    expect(disclosure.textContent?.includes('Gold is the highest Minter status')).toBe(category === 'SUBJECT' && status === 'GOLD');
    expect(disclosure.textContent).not.toContain('next standing');
  });
});
