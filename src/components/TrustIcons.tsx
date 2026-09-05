import { Anvil, Compass, NotebookPen, UsersRound } from 'lucide-react';
import type { AccountRatingCategory, TrustStatus } from '../types';

export function RoleIcon({ category }: { category: AccountRatingCategory }) {
  const Icon = { SUBJECT: Anvil, PLAYER: UsersRound, TRAINER: Compass, MANAGER: NotebookPen }[category];
  return <Icon aria-hidden="true" className="role-icon" size={19} strokeWidth={1.7} />;
}

// Shared silhouettes remain distinguishable without color: star + leaves, leaves, plain,
// question mark and exclamation mark. StatusBadge supplies the translated accessible text.
export function TrustShield({ status }: { status: TrustStatus }) {
  return (
    <svg aria-hidden="true" className="trust-shield" fill="none" viewBox="0 0 40 44">
      {status === 'GOLD' || status === 'SILVER' ? (
        <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">
          <path d="M3 19c-1 12 4 20 13 22M37 19c1 12-4 20-13 22" />
          <path d="m3 24 5 3-4 2m1 3 6 1-3 3m29-12-5 3 4 2m-1 3-6 1 3 3" />
        </g>
      ) : null}
      <path d="M20 3 33 8v12c0 8-6 14-13 18C13 34 7 28 7 20V8Z" fill="currentColor" fillOpacity=".08" stroke="currentColor" strokeWidth="1.8" />
      {status === 'GOLD' ? <path d="m20 12 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2-4.5-4.4 6.2-.9Z" fill="currentColor" /> : null}
      {status === 'UNVERIFIED' ? <path d="M15 16a5 5 0 1 1 8 4c-2 1-3 2-3 5m0 4v1" stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" /> : null}
      {status === 'SUSPICIOUS' ? <path d="M20 13v11m0 5v1" stroke="currentColor" strokeLinecap="round" strokeWidth="3" /> : null}
    </svg>
  );
}
