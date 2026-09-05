import { useEffect, useId, useRef, useState, type ComponentProps } from 'react';
import { X } from 'lucide-react';
import { categoryLabel } from '../format';
import { getIdentityLabel } from '../identityProfiles';
import { t } from '../i18n';
import type { IdentityProfile, TrustDerivation } from '../types';
import { IdentityAvatar } from './Identity';
import { RoleIcon } from './TrustIcons';
import { RatingForm } from './RatingControls';

type RatingDialogProps = Omit<ComponentProps<typeof RatingForm>, 'targetAddress' | 'targetPublicKey' | 'onSubmittingChange'> & {
  derivation: TrustDerivation;
  profile?: IdentityProfile;
  onClose: () => void;
};

export function RatingDialog({ derivation, profile, onClose, ...ratingProps }: RatingDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const titleId = useId();
  const roleId = useId();

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current!;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  return (
    <dialog
      aria-labelledby={`${titleId} ${roleId}`}
      className="rating-dialog"
      data-role={ratingProps.category}
      onCancel={(event) => { event.preventDefault(); if (!submitting) onClose(); }}
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.target === event.currentTarget && !submitting &&
          (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) onClose();
      }}
      ref={dialogRef}
    >
      <header className="rating-dialog__header">
        <div className="rating-dialog__identity">
          <IdentityAvatar address={derivation.accountAddress} profile={profile} />
          <div>
            <h2 id={titleId}>{getIdentityLabel(profile, derivation.accountAddress)}</h2>
            <p className="rating-dialog__role" id={roleId}><RoleIcon category={ratingProps.category} />{categoryLabel(ratingProps.category)}</p>
          </div>
        </div>
        <button aria-label={t('action.dismiss')} className="icon-button" disabled={submitting} onClick={onClose} type="button"><X aria-hidden="true" size={18} /></button>
      </header>
      <RatingForm
        {...ratingProps}
        onSubmittingChange={setSubmitting}
        targetAddress={derivation.accountAddress}
        targetPublicKey={derivation.accountPublicKey}
      />
    </dialog>
  );
}
