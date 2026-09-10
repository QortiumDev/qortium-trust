// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { DevelopersReference } from './DevelopersReference';
import { DIRECTORY_BOUNDS } from '../developerReference';
import type { BridgeState, TrustPolicy } from '../types';

const POLICY: TrustPolicy = {
  activeWeightCategory: 'SUBJECT',
  startingEnergy: 100,
  managerEnergyHops: 2,
  positiveMinBranchCount: 2,
  suspiciousMinRaterCount: 3,
  suspiciousMinBranchCount: 2,
  suspiciousMinRatingConfidence: 2,
  accountRatingChangeCooldownBlocks: 1440,
  statusVoteWeights: [
    { status: 'GOLD', voteWeightPercent: 100 },
    { status: 'SILVER', voteWeightPercent: 60 },
    { status: 'BRONZE', voteWeightPercent: 30 },
    { status: 'UNVERIFIED', voteWeightPercent: 0 },
    { status: 'SUSPICIOUS', voteWeightPercent: 0 },
  ],
  categoryPolicies: (['SUBJECT', 'PLAYER', 'TRAINER', 'MANAGER'] as const).map((category) => ({
    category,
    levels: [
      { level: 1, mappedTrustStatus: 'BRONZE', mappedTrustStatusValue: 2, mappedTrustWeightPercent: 30, threshold: 10, levelScoreCap: 50 },
      { level: 2, mappedTrustStatus: 'SILVER', mappedTrustStatusValue: 3, mappedTrustWeightPercent: 60, threshold: 20, levelScoreCap: 100 },
    ],
    suspiciousThreshold: -20,
    suspiciousLevelScoreCap: 10,
  })),
};

const BRIDGE: BridgeState = { actions: ['RATE_ACCOUNT', 'FETCH_NODE_API'], isHomeBridge: true, ui: 'QORTIUM_HOME' };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DevelopersReference', () => {
  it('is a fixed English/LTR root, independent of the app language', () => {
    render(
      <DevelopersReference bridge={BRIDGE} initialSection={null} onNavigateSection={vi.fn()} policy={POLICY} />,
    );

    const root = screen.getByRole('heading', { name: 'Developers reference' }).closest('section');
    expect(root?.getAttribute('lang')).toBe('en');
    expect(root?.getAttribute('dir')).toBe('ltr');
  });

  it('renders directory/activity bounds and the live policy from the real implementation constants, not hardcoded prose', () => {
    render(
      <DevelopersReference bridge={BRIDGE} initialSection={null} onNavigateSection={vi.fn()} policy={POLICY} />,
    );

    expect(screen.getByText(String(DIRECTORY_BOUNDS.pageSize))).toBeTruthy();
    expect(screen.getByText(DIRECTORY_BOUNDS.maxDerivationLimit.toLocaleString())).toBeTruthy();
    // Live policy values, read straight from the `policy` prop (not frozen thresholds).
    expect(screen.getByText(String(POLICY.accountRatingChangeCooldownBlocks))).toBeTruthy();
    expect(screen.getByText('100%')).toBeTruthy();
  });

  it('states honestly that live policy is unavailable, without fabricating numbers, when policy is null', () => {
    render(<DevelopersReference bridge={BRIDGE} initialSection={null} onNavigateSection={vi.fn()} policy={null} />);

    expect(screen.getByText(/live policy is unavailable/i)).toBeTruthy();
  });

  it('shows the live bridge actions and the browser-dev fallback list separately', () => {
    render(
      <DevelopersReference bridge={BRIDGE} initialSection={null} onNavigateSection={vi.fn()} policy={POLICY} />,
    );

    expect(screen.getByText(/Currently advertised \(live\):/).closest('p')?.textContent).toContain('RATE_ACCOUNT');
    expect(screen.getByText(/Browser-dev fallback/).closest('p')?.textContent).toContain('FETCH_NODE_API');
  });

  it('pushes a section anchor through onNavigateSection when a table-of-contents entry is clicked', () => {
    const onNavigateSection = vi.fn();
    render(
      <DevelopersReference bridge={BRIDGE} initialSection={null} onNavigateSection={onNavigateSection} policy={POLICY} />,
    );

    const toc = screen.getByRole('navigation', { name: 'Developers reference sections' });
    fireEvent.click(within(toc).getByRole('button', { name: 'Live policy & units' }));

    expect(onNavigateSection).toHaveBeenCalledExactlyOnceWith('policy');
  });

  it('copies an example via the sandbox-safe fallback when navigator.clipboard is unavailable, and announces success', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn() });
    const execCommand = vi.spyOn(document, 'execCommand').mockReturnValue(true);

    render(
      <DevelopersReference bridge={BRIDGE} initialSection={null} onNavigateSection={vi.fn()} policy={POLICY} />,
    );

    const [copyButton] = screen.getAllByRole('button', { name: /^Copy / });
    await act(async () => {
      fireEvent.click(copyButton);
      await Promise.resolve();
    });

    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(screen.getAllByRole('button', { name: /^Copied / }).length).toBeGreaterThan(0);
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toContain('copied');
  });

  it('announces failure via aria-live when both the async API and the fallback fail', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn() });
    vi.spyOn(document, 'execCommand').mockReturnValue(false);

    render(
      <DevelopersReference bridge={BRIDGE} initialSection={null} onNavigateSection={vi.fn()} policy={POLICY} />,
    );

    const [copyButton] = screen.getAllByRole('button', { name: /^Copy / });
    await act(async () => {
      fireEvent.click(copyButton);
      await Promise.resolve();
    });

    expect(screen.getAllByRole('button', { name: /^Copy failed / }).length).toBeGreaterThan(0);
    const liveRegions = Array.from(document.querySelectorAll('[aria-live="polite"]'));
    expect(liveRegions.some((region) => region.textContent?.includes('Copy failed'))).toBe(true);
  });
});
