import { memo } from 'react';
import { ArrowDownUp } from 'lucide-react';
import { categoryLabel, formatDate, formatNumber } from '../format';
import type { IdentityProfilesByAddress, TrustStatusChange } from '../types';
import { EmptyState, IdentityAvatar, IdentityLabel, StatusBadge } from './Identity';
import { t } from '../i18n';

// #14: IdentityAvatar / StatusBadge are defined in Identity.tsx (another lane). Memoize them at this
// render boundary so unchanged rows skip re-render when the table re-renders.
const MemoIdentityAvatar = memo(IdentityAvatar);
const MemoStatusBadge = memo(StatusBadge);

export function ChangesTable({
  changes,
  onSelectAccount,
  profiles,
  selectableAddresses,
}: {
  changes: TrustStatusChange[];
  // Opens the account's detail when its row is activated. Only wired for accounts present in the
  // loaded category list (selectableAddresses) — detail is driven by that list, so a row for an
  // account outside it would be a no-op and is left non-interactive instead (UX-003).
  onSelectAccount?: (address: string) => void;
  profiles: IdentityProfilesByAddress;
  selectableAddresses?: Set<string>;
}) {
  if (changes.length === 0) {
    return <EmptyState icon={<ArrowDownUp size={18} />} text={t('empty.changes')} />;
  }

  return (
    <div aria-label={t('nav.changes')} className="table-wrap" role="region" tabIndex={0}>
      <table>
        <thead>
          <tr>
            <th>{t('label.account')}</th>
            <th>{t('label.category')}</th>
            <th>{t('label.before')}</th>
            <th>{t('label.new')}</th>
            <th>{t('label.score')}</th>
            <th>{t('label.height')}</th>
            <th>{t('label.time')}</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((change) => {
            const profile = profiles[change.accountAddress];
            const selectable = !!onSelectAccount && (selectableAddresses?.has(change.accountAddress) ?? false);

            return (
              <tr
                className={selectable ? 'account-row' : undefined}
                key={`${change.accountAddress}-${change.category}-${change.snapshotHeight}`}
                onClick={selectable ? () => onSelectAccount?.(change.accountAddress) : undefined}
                onKeyDown={
                  selectable
                    ? (event) => {
                        if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                          event.preventDefault();
                          onSelectAccount?.(change.accountAddress);
                        }
                      }
                    : undefined
                }
                tabIndex={selectable ? 0 : undefined}
              >
                <td>
                  <div className="identity-cell">
                    <MemoIdentityAvatar address={change.accountAddress} profile={profile} size="small" />
                    <IdentityLabel address={change.accountAddress} profile={profile} />
                  </div>
                </td>
                <td>{categoryLabel(change.category)}</td>
                <td>
                  <MemoStatusBadge status={change.previousTrustStatus} />
                </td>
                <td>
                  <MemoStatusBadge status={change.newTrustStatus} />
                </td>
                <td>
                  {formatNumber(change.previousScore)}
                  {' -> '}
                  {formatNumber(change.newScore)}
                </td>
                <td>{formatNumber(change.snapshotHeight)}</td>
                <td>{formatDate(change.snapshotTimestamp)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
