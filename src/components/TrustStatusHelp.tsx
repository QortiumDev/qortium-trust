import { formatNumber } from '../format';
import { t } from '../i18n';
import type { TrustPolicy, TrustStatus } from '../types';
import { StatusBadge } from './Identity';

export function TrustStatusHelp({ policy }: { policy: TrustPolicy | null }) {
  const percentFor = (status: TrustStatus) => policy?.statusVoteWeights?.find(entry => entry.status === status)?.voteWeightPercent;
  return (
    <details className="trust-status-help">
      <summary>{t('label.trustStatus')}</summary>
      <div className="trust-status-help__body">
        <p>{t('detail.voteWeightExplainer', {
          bronze: formatNumber(percentFor('BRONZE')),
          silver: formatNumber(percentFor('SILVER')),
          gold: formatNumber(percentFor('GOLD')),
        })}</p>
        <div className="trust-status-help__badges">
          {(['GOLD', 'SILVER', 'BRONZE'] as const).map(status => (
            <span key={status}><StatusBadge status={status} /> {formatNumber(percentFor(status))}%</span>
          ))}
        </div>
        <p><StatusBadge status="UNVERIFIED" /> {t('status.unverifiedMeaning')}</p>
        <p><StatusBadge status="SUSPICIOUS" /> {t('status.suspiciousNote')}</p>
      </div>
    </details>
  );
}
