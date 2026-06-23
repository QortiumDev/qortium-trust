import type { ReactNode } from 'react';
import {
  getAvatarFallbackCharacter,
  getIdentityLabel,
} from '../identityProfiles';
import { compactAddress, formatNumber, formatPercent, statusLabel, statusTone } from '../format';
import type { IdentityProfile, NodeStatus, TrustStatus } from '../types';
import type { IdentityProps } from '../viewTypes';
import { t } from '../i18n';

export function IdentityAvatar({
  address,
  profile,
  size = 'normal',
}: IdentityProps & { size?: 'small' | 'normal' | 'large' }) {
  const label = getIdentityLabel(profile, address);

  if (profile?.avatarSrc) {
    return <img alt="" className={`identity-avatar identity-avatar-${size}`} src={profile.avatarSrc} title={label} />;
  }

  return (
    <span aria-hidden="true" className={`identity-avatar identity-avatar-${size} identity-avatar-fallback`}>
      {getAvatarFallbackCharacter(profile?.name, address)}
    </span>
  );
}

export function IdentityLabel({ address, profile }: IdentityProps) {
  const label = getIdentityLabel(profile, address);

  return (
    <span className="identity-label">
      <span className="identity-name">{label}</span>
      {label !== address ? <span className="mono identity-address">{compactAddress(address, 10, 7)}</span> : null}
    </span>
  );
}

export function compactIdentityGraphLabel(profile: IdentityProfile | undefined, address: string) {
  const label = getIdentityLabel(profile, address);

  if (label === address) {
    return compactAddress(address, 5, 4);
  }

  return label.length > 14 ? `${label.slice(0, 13)}...` : label;
}

export function StatusBadge({ status }: { status: TrustStatus }) {
  return <span className={`badge badge-${statusTone(status)}`}>{statusLabel(status)}</span>;
}

export function NodeSyncPill({ nodeStatus }: { nodeStatus: NodeStatus | null }) {
  const synced = !!nodeStatus && !nodeStatus.isSynchronizing;
  const label = !nodeStatus
    ? t('node.connecting')
    : nodeStatus.isSynchronizing
      ? t('node.syncing', { percent: formatPercent(nodeStatus.syncPercent) })
      : t('node.synced');
  const title =
    nodeStatus?.height !== undefined ? t('node.blockHeight', { height: formatNumber(nodeStatus.height) }) : t('node.status');

  return (
    <span className={`node-pill ${synced ? 'node-pill--ok' : 'node-pill--busy'}`} title={title}>
      <span aria-hidden="true" className="node-pill__dot" />
      {label}
    </span>
  );
}

export function EmptyState({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="empty-state">
      {icon}
      <span>{text}</span>
    </div>
  );
}
