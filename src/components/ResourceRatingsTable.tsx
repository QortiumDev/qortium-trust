import { Layers } from 'lucide-react';
import { formatNumber } from '../format';
import type { ResourceRatingSummary } from '../types';
import { EmptyState } from './Identity';

export function ResourceRatingsTable({ resources }: { resources: ResourceRatingSummary[] }) {
  if (resources.length === 0) {
    return <EmptyState icon={<Layers size={18} />} text="No resource ratings are recorded yet." />;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Resource</th>
            <th>Service</th>
            <th>Count</th>
            <th>Average</th>
            <th>Weighted</th>
            <th>Total weight</th>
          </tr>
        </thead>
        <tbody>
          {resources.map((resource) => (
            <tr key={`${resource.service}-${resource.name}-${resource.identifier}`}>
              <td>
                <span className="resource-name">{resource.name}</span>
                <span className="muted">{resource.identifier || 'default'}</span>
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
