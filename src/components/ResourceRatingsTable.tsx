import { Layers } from 'lucide-react';
import { formatNumber } from '../format';
import type { ResourceRatingSummary } from '../types';
import { EmptyState } from './Identity';
import { t } from '../i18n';

export function ResourceRatingsTable({ resources }: { resources: ResourceRatingSummary[] }) {
  if (resources.length === 0) {
    return <EmptyState icon={<Layers size={18} />} text={t('empty.resourceRatings')} />;
  }

  return (
    <div aria-label={t('nav.resources')} className="table-wrap" role="region" tabIndex={0}>
      <table>
        <thead>
          <tr>
            <th>{t('label.resource')}</th>
            <th>{t('label.service')}</th>
            <th>{t('label.count')}</th>
            <th>{t('label.average')}</th>
            <th>{t('label.weighted')}</th>
            <th>{t('label.weight')}</th>
          </tr>
        </thead>
        <tbody>
          {resources.map((resource) => (
            <tr key={`${resource.service}-${resource.name}-${resource.identifier}`}>
              <td>
                <span className="resource-name">{resource.name}</span>
                <span className="muted">{resource.identifier || t('label.default')}</span>
              </td>
              <td>{resource.service}</td>
              <td>{formatNumber(resource.ratingCount)}</td>
              <td>{formatNumber(resource.averageRating)}</td>
              <td>{formatNumber(resource.weightedAverageRating)}</td>
              <td>{formatNumber(resource.totalWeight)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
