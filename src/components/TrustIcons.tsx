import { useId } from 'react';
import type { AccountRatingCategory, TrustStatus } from '../types';

export function RoleIcon({ category }: { category: AccountRatingCategory }) {
  return (
    <span aria-hidden="true" className="role-medallion" data-role={category}>
      <svg className="role-icon" fill="none" viewBox="0 0 32 32" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {category === 'SUBJECT' ? <>
          <path d="M4 19h24l-5 4h-6v3h5v2H9v-2h4v-3H8Z" fill="currentColor" fillOpacity=".8" />
          <path d="m13 6 5-4 6 7-5 4Z" fill="currentColor" fillOpacity=".85" />
          <path d="m18 12-6 6m8-14 3-2 4 5-3 2M6 11l2 2m-4 3h3" strokeWidth="2" />
        </> : category === 'PLAYER' ? <>
          <circle cx="16" cy="8" r="4" fill="currentColor" fillOpacity=".75" />
          <circle cx="6" cy="12" r="3" fill="currentColor" fillOpacity=".4" />
          <circle cx="26" cy="12" r="3" fill="currentColor" fillOpacity=".4" />
          <path d="M2 25v-4a4 4 0 0 1 7-3m21 7v-4a4 4 0 0 0-7-3M10 16a8 8 0 0 1 12 0" />
          <circle cx="16" cy="23" r="7" fill="var(--role-icon-surface)" />
          <path d="m12 23 3 3 5-6" strokeWidth="2.5" />
        </> : category === 'TRAINER' ? <>
          <circle cx="16" cy="4" r="2.5" />
          <circle cx="16" cy="18" r="12" />
          <path d="M16 9v2m0 14v2M7 18h2m14 0h2m-16-7 1 1m12 12 1 1" />
          <path d="m22 12-4 8-8 4 4-8Z" fill="currentColor" fillOpacity=".75" />
          <circle cx="16" cy="18" r="1.5" fill="var(--role-icon-surface)" stroke="none" />
        </> : <>
          <path d="M22 4H3v25h23V17M7 9h10M7 14h8M7 19h5M7 24h5m-2-17v4m3 1v4" />
          <path d="m14 25 2-6L26 7l4 4-11 12Z" fill="currentColor" fillOpacity=".5" />
          <path d="m24 9 4 4m-12 6 3 4m-5 2 5-2" />
        </>}
      </svg>
    </span>
  );
}

// Shape carries meaning independently of color: Gold star/leaves, Silver leaves,
// Bronze plain, Unverified ?, Suspicious !. StatusBadge supplies readable text.
export function TrustShield({ status }: { status: TrustStatus }) {
  const finish = useId();
  return (
    <svg aria-hidden="true" className="trust-shield" fill="none" viewBox="0 0 40 44">
      <defs>
        <linearGradient id={finish} x1="6" y1="4" x2="34" y2="39" gradientUnits="userSpaceOnUse">
          <stop stopColor="currentColor" stopOpacity=".65" />
          <stop offset=".35" stopColor="currentColor" stopOpacity=".18" />
          <stop offset=".6" stopColor="currentColor" stopOpacity=".35" />
          <stop offset="1" stopColor="currentColor" stopOpacity=".08" />
        </linearGradient>
      </defs>
      {status === 'GOLD' || status === 'SILVER' ? (
        <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6">
          <path d="M3 19c-1 12 4 20 13 22M37 19c1 12-4 20-13 22" />
          <path d="m3 22 4 4-4 1m1 3 5 2-4 2m3 2 5 1-2 3m26-18-4 4 4 1m-1 3-5 2 4 2m-3 2-5 1 2 3" />
        </g>
      ) : null}
      <path d="M20 3 33 8v12c0 8-6 14-13 18C13 34 7 28 7 20V8Z" fill={`url(#${finish})`} stroke="currentColor" strokeWidth="1.8" />
      <path d="m10 10 10-4 10 4v10c0 6-4 11-10 15-6-4-10-9-10-15Z" stroke="currentColor" strokeOpacity=".5" strokeWidth=".8" />
      <path d="m8 9 12-5 12 5" stroke="white" strokeOpacity=".55" strokeWidth="1" />
      {status === 'GOLD' ? <path d="m20 12 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2-4.5-4.4 6.2-.9Z" fill="currentColor" stroke="currentColor" strokeWidth=".6" /> : null}
      {status === 'UNVERIFIED' ? <path d="M15 16a5 5 0 1 1 8 4c-2 1-3 2-3 5m0 4v1" stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" /> : null}
      {status === 'SUSPICIOUS' ? <path d="M20 13v11m0 5v1" stroke="currentColor" strokeLinecap="round" strokeWidth="3" /> : null}
    </svg>
  );
}
