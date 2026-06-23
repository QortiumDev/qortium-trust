// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RatingForm } from './RatingControls';
import {
  ensureAccountUnlocked,
  getRatingCooldown,
  getRatingPreview,
  resolveSelfAccount,
  submitRating,
} from '../trustApi';
import type { AccountRatingCooldown, SelfAccount } from '../types';

vi.mock('../trustApi', () => ({
  ensureAccountUnlocked: vi.fn(),
  getRatingCooldown: vi.fn(),
  getRatingPreview: vi.fn(),
  resolveSelfAccount: vi.fn(),
  submitRating: vi.fn(),
}));

const self: SelfAccount = { address: 'Qself', publicKey: 'selfPub', name: 'self', isUnlocked: true };

const noCooldown: AccountRatingCooldown = {
  targetPublicKey: 'targetPub',
  targetAddress: 'Qtarget',
  raterPublicKey: 'selfPub',
  raterAddress: 'Qself',
  category: 'SUBJECT',
  activeRating: null,
  cooldownBlocks: 0,
  latestRatingChangeHeight: null,
  currentHeight: 100,
  candidateChangeHeight: 100,
  earliestAllowedHeight: 100,
  blocksRemaining: 0,
  canChangeNow: true,
};

describe('RatingForm write path', () => {
  const getRatingCooldownMock = vi.mocked(getRatingCooldown);
  const getRatingPreviewMock = vi.mocked(getRatingPreview);
  const ensureAccountUnlockedMock = vi.mocked(ensureAccountUnlocked);
  const submitRatingMock = vi.mocked(submitRating);
  const resolveSelfAccountMock = vi.mocked(resolveSelfAccount);

  beforeEach(() => {
    getRatingCooldownMock.mockReset().mockResolvedValue(noCooldown);
    // Settled "valid" preview so the submit gate never trips on it.
    getRatingPreviewMock.mockReset().mockResolvedValue({ canSubmit: true } as never);
    ensureAccountUnlockedMock.mockReset().mockResolvedValue({ address: 'Qself', isUnlocked: true, name: 'self', publicKey: null });
    submitRatingMock.mockReset().mockResolvedValue({ signature: 'sig' } as never);
    resolveSelfAccountMock.mockReset();
  });

  it('submits the selected rating through the bridge and reports the optimistic pending entry', async () => {
    const onSubmitted = vi.fn();

    render(
      <RatingForm
        category="SUBJECT"
        onSubmitted={onSubmitted}
        pendingRating={undefined}
        ratingActionAvailable
        self={self}
        targetAddress="Qtarget"
        targetPublicKey="targetPub"
      />,
    );

    // Wait for the on-mount cooldown fetch to settle (the submit button is disabled while loading).
    await waitFor(() => expect(getRatingCooldownMock).toHaveBeenCalled());

    // Pick a real, changed rating (+1) so the unchanged gate clears, then submit.
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '1' } });

    const submit = screen.getByRole('button', { name: /submit rating/i }) as HTMLButtonElement;
    await waitFor(() => expect(submit.disabled).toBe(false));
    fireEvent.click(submit);

    await waitFor(() => expect(submitRatingMock).toHaveBeenCalledTimes(1));
    expect(submitRatingMock).toHaveBeenCalledWith({ category: 'SUBJECT', rating: 1, targetPublicKey: 'targetPub' });
    expect(onSubmitted).toHaveBeenCalledWith({
      category: 'SUBJECT',
      rating: 1,
      raterPublicKey: 'selfPub',
      targetAddress: 'Qtarget',
      targetPublicKey: 'targetPub',
    });
  });

  it('does not submit and surfaces an error when the account stays locked', async () => {
    const onSubmitted = vi.fn();
    ensureAccountUnlockedMock.mockResolvedValue({ address: 'Qself', isUnlocked: false, name: 'self', publicKey: null });

    render(
      <RatingForm
        category="SUBJECT"
        onSubmitted={onSubmitted}
        pendingRating={undefined}
        ratingActionAvailable
        self={self}
        targetAddress="Qtarget"
        targetPublicKey="targetPub"
      />,
    );

    await waitFor(() => expect(getRatingCooldownMock).toHaveBeenCalled());
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '1' } });

    const submit = screen.getByRole('button', { name: /submit rating/i }) as HTMLButtonElement;
    await waitFor(() => expect(submit.disabled).toBe(false));
    fireEvent.click(submit);

    await waitFor(() => expect(ensureAccountUnlockedMock).toHaveBeenCalled());
    expect(submitRatingMock).not.toHaveBeenCalled();
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it('blocks rating yourself without any bridge submit', () => {
    render(
      <RatingForm
        category="SUBJECT"
        onSubmitted={vi.fn()}
        pendingRating={undefined}
        ratingActionAvailable
        self={self}
        targetAddress="Qself"
        targetPublicKey="selfPub"
      />,
    );

    // canInteract is false for self-rating → the form renders the note, never the cooldown fetch.
    expect(getRatingCooldownMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});
