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

describe('RatingForm write path (two-step Minter chooser)', () => {
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

  it('submits Yes + Low (+1) through the bridge and reports the optimistic pending entry', async () => {
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

    // Wait for the on-mount cooldown fetch to settle (the chooser is disabled while loading).
    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Yes' }) as HTMLButtonElement).disabled).toBe(false),
    );

    // Q1: "Is this a unique minting account?" -> Yes, then Q2: confidence -> Low (= +1).
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Low' }));

    const submit = screen.getByRole('button', { name: /submit rating/i }) as HTMLButtonElement;
    await waitFor(() => expect(submit.disabled).toBe(false));
    fireEvent.click(submit);

    await waitFor(() => expect(submitRatingMock).toHaveBeenCalledTimes(1));
    expect(submitRatingMock).toHaveBeenCalledWith({ category: 'SUBJECT', rating: 1, targetPublicKey: 'targetPub' });
    expect(onSubmitted).toHaveBeenCalledWith({
      category: 'SUBJECT',
      rating: 1,
      raterPublicKey: 'selfPub',
      submittedAt: expect.any(Number),
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

    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Yes' }) as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Low' }));

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
    expect(screen.queryByRole('button', { name: 'Yes' })).toBeNull();
  });

  it('submits No + Clear as a Clear-my-rating (0) once an active rating exists', async () => {
    getRatingCooldownMock.mockResolvedValue({ ...noCooldown, activeRating: 2 });
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

    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Clear my rating' }) as HTMLButtonElement).disabled).toBe(false),
    );

    // An active rating exists, so "Clear my rating" is offered alongside Yes/No/Not sure yet.
    fireEvent.click(screen.getByRole('button', { name: 'Clear my rating' }));

    const submit = screen.getByRole('button', { name: /remove rating/i }) as HTMLButtonElement;
    await waitFor(() => expect(submit.disabled).toBe(false));
    fireEvent.click(submit);

    await waitFor(() => expect(submitRatingMock).toHaveBeenCalledTimes(1));
    expect(submitRatingMock).toHaveBeenCalledWith({ category: 'SUBJECT', rating: 0, targetPublicKey: 'targetPub' });
  });

  it('"Not sure yet" collapses the flow and submits nothing', async () => {
    render(
      <RatingForm
        category="SUBJECT"
        onSubmitted={vi.fn()}
        pendingRating={undefined}
        ratingActionAvailable
        self={self}
        targetAddress="Qtarget"
        targetPublicKey="targetPub"
      />,
    );

    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Not sure yet' }) as HTMLButtonElement).disabled).toBe(false),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Not sure yet' }));

    // No confidence step appears, and the submit button stays disabled (nothing resolved to submit).
    expect(screen.queryByRole('button', { name: 'Low' })).toBeNull();
    const submit = screen.getByRole('button', { name: /remove rating|submit rating/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(submit);
    expect(submitRatingMock).not.toHaveBeenCalled();
  });

  it('shows the 4x negative-count warning on the No path only', async () => {
    render(
      <RatingForm
        category="SUBJECT"
        onSubmitted={vi.fn()}
        pendingRating={undefined}
        ratingActionAvailable
        self={self}
        targetAddress="Qtarget"
        targetPublicKey="targetPub"
      />,
    );

    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Yes' }) as HTMLButtonElement).disabled).toBe(false),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    expect(screen.queryByText(/negative ratings count 4×/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'No' }));
    expect(screen.getByText(/negative ratings count 4×/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    expect(screen.queryByText(/negative ratings count 4×/i)).toBeNull();
  });

  it('renders "Your rating counts for {impact}" from the previewed category impact for the current rater', async () => {
    getRatingPreviewMock.mockResolvedValue({
      canSubmit: true,
      previewSelectedCategory: { impacts: [{ raterAddress: 'Qself', impact: 40 }] },
    } as never);

    render(
      <RatingForm
        category="SUBJECT"
        onSubmitted={vi.fn()}
        pendingRating={undefined}
        ratingActionAvailable
        self={self}
        targetAddress="Qtarget"
        targetPublicKey="targetPub"
      />,
    );

    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Yes' }) as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    fireEvent.click(screen.getByRole('button', { name: 'High' }));

    await waitFor(() => expect(screen.getByText(/your rating counts for 40/i)).toBeTruthy());
  });

  it('renders the "not yet trusted" note when the preview finds no impact for this rater', async () => {
    getRatingPreviewMock.mockResolvedValue({
      canSubmit: true,
      previewSelectedCategory: { impacts: [] },
    } as never);

    render(
      <RatingForm
        category="SUBJECT"
        onSubmitted={vi.fn()}
        pendingRating={undefined}
        ratingActionAvailable
        self={self}
        targetAddress="Qtarget"
        targetPublicKey="targetPub"
      />,
    );

    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Yes' }) as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    fireEvent.click(screen.getByRole('button', { name: 'High' }));

    await waitFor(() =>
      expect(screen.getByText(/doesn.t count.*trusted as a voter/i)).toBeTruthy(),
    );
  });
});

describe('RatingForm write path (two-step role chooser)', () => {
  const getRatingCooldownMock = vi.mocked(getRatingCooldown);
  const getRatingPreviewMock = vi.mocked(getRatingPreview);
  const ensureAccountUnlockedMock = vi.mocked(ensureAccountUnlocked);
  const submitRatingMock = vi.mocked(submitRating);

  beforeEach(() => {
    getRatingCooldownMock.mockReset().mockResolvedValue({ ...noCooldown, category: 'PLAYER' });
    getRatingPreviewMock.mockReset().mockResolvedValue({ canSubmit: true } as never);
    ensureAccountUnlockedMock.mockReset().mockResolvedValue({ address: 'Qself', isUnlocked: true, name: 'self', publicKey: null });
    submitRatingMock.mockReset().mockResolvedValue({ signature: 'sig' } as never);
  });

  it('uses Positive/Negative wording and "Rate this account as a Voter:" for a PLAYER rating', async () => {
    render(
      <RatingForm
        category="PLAYER"
        onSubmitted={vi.fn()}
        pendingRating={undefined}
        ratingActionAvailable
        self={self}
        targetAddress="Qtarget"
        targetPublicKey="targetPub"
      />,
    );

    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Positive' }) as HTMLButtonElement).disabled).toBe(false),
    );

    expect(screen.getByText(/rate this account as a voter/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Positive' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Negative' })).toBeTruthy();
    // Minter-only copy must not leak into the role flow.
    expect(screen.queryByRole('button', { name: 'Yes' })).toBeNull();
    expect(screen.queryByText(/negative ratings count 4×/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Negative' }));
    fireEvent.click(screen.getByRole('button', { name: 'Medium' }));

    const submit = screen.getByRole('button', { name: /submit rating/i }) as HTMLButtonElement;
    await waitFor(() => expect(submit.disabled).toBe(false));
    fireEvent.click(submit);

    await waitFor(() => expect(submitRatingMock).toHaveBeenCalledTimes(1));
    expect(submitRatingMock).toHaveBeenCalledWith({ category: 'PLAYER', rating: -2, targetPublicKey: 'targetPub' });
  });

  it('shows the Designer influence note only for a MANAGER rating', async () => {
    getRatingCooldownMock.mockResolvedValue({ ...noCooldown, category: 'MANAGER' });

    const { rerender } = render(
      <RatingForm
        category="PLAYER"
        onSubmitted={vi.fn()}
        pendingRating={undefined}
        ratingActionAvailable
        self={self}
        targetAddress="Qtarget"
        targetPublicKey="targetPub"
      />,
    );

    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Positive' }) as HTMLButtonElement).disabled).toBe(false),
    );
    expect(screen.queryByText(/limited pool of influence/i)).toBeNull();

    rerender(
      <RatingForm
        category="MANAGER"
        onSubmitted={vi.fn()}
        pendingRating={undefined}
        ratingActionAvailable
        self={self}
        targetAddress="Qtarget"
        targetPublicKey="targetPub"
      />,
    );

    expect(screen.getByText(/limited pool of influence/i)).toBeTruthy();
  });
});
