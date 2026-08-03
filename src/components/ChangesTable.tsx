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
  showAllRoles,
}: {
  changes: TrustStatusChange[];
  // Opens the account's detail when its row is activated. Only wired for accounts present in the
  // loaded category list (selectableAddresses) — detail is driven by that list, so a row for an
  // account outside it would be a no-op and is left non-interactive instead (UX-003).
  onSelectAccount?: (address: string) => void;
  profiles: IdentityProfilesByAddress;
  selectableAddresses?: Set<string>;
  // Minters-first redesign (Stage A): off shows only SUBJECT (Minters) changes with the Category
  // column hidden; on shows every category's changes as before.
  showAllRoles: boolean;
}) {
  const visibleChanges = showAllRoles ? changes : changes.filter((change) => change.category === 'SUBJECT');

  if (visibleChanges.length === 0) {
    return <EmptyState icon={<ArrowDownUp size={18} />} text={t('empty.changes')} />;
  }

  return (
    <div aria-label={t('nav.changes')} className="table-wrap" role="region" tabIndex={0}>
      <table className="changes-table">
        <thead>
          <tr>
            <th>{t('label.account')}</th>
            {showAllRoles ? <th>{t('label.category')}</th> : null}
            <th>{t('label.before')}</th>
            <th>{t('label.new')}</th>
            <th>{t('label.score')}</th>
            <th>{t('label.height')}</th>
            <th>{t('label.time')}</th>
          </tr>
        </thead>
        <tbody>
          {visibleChanges.map((change) => {
            const profile = profiles[change.accountAddress];
            const selectable =
              !!onSelectAccount &&
              (selectableAddresses ? selectableAddresses.has(change.accountAddress) : true);

            return (
              <tr
                className={selectable ? 'account-row' : undefined}
                key={`${change.accountAddress}-${change.category}-${change.snapshotHeight}`}
                onClick={selectable ? () => onSelectAccount?.(change.accountAddress) : undefined}
              >
                <td data-label={t('label.account')}>
                  <button
                    aria-label={t('action.openAccount', { name: profile?.name ?? change.accountAddress })}
                    className="identity-cell identity-link"
                    disabled={!selectable}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectAccount?.(change.accountAddress);
                    }}
                    type="button"
                  >
                    <MemoIdentityAvatar address={change.accountAddress} profile={profile} size="small" />
                    <IdentityLabel address={change.accountAddress} profile={profile} />
                  </button>
                </td>
                {showAllRoles ? <td data-label={t('label.category')}>{categoryLabel(change.category)}</td> : null}
                <td data-label={t('label.before')}>
                  <MemoStatusBadge status={change.previousTrustStatus} />
                </td>
                <td data-label={t('label.new')}>
                  <MemoStatusBadge status={change.newTrustStatus} />
                </td>
                <td data-label={t('label.score')}>
                  {formatNumber(change.previousScore)}
                  {' -> '}
                  {formatNumber(change.newScore)}
                </td>
                <td data-label={t('label.height')}>{formatNumber(change.snapshotHeight)}</td>
                <td data-label={t('label.time')}>{formatDate(change.snapshotTimestamp)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
