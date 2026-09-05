import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { fetchAccountAvatar, getPendingRetryCount } from '../avatarClient';
import {
  getAvatarFallbackCharacter,
  getIdentityLabel,
} from '../identityProfiles';
import { compactAddress, formatNumber, formatPercent, statusLabel, statusTone } from '../format';
import type { IdentityProfile, NodeStatus, QdnAction, TrustStatus } from '../types';
import type { IdentityProps } from '../viewTypes';
import { t } from '../i18n';
import { TrustShield } from './TrustIcons';

const AvatarActionsContext = createContext<QdnAction[] | undefined>(undefined);

export function AvatarActionsProvider({ actions, children }: { actions?: QdnAction[]; children: ReactNode }) {
  return <AvatarActionsContext.Provider value={actions}>{children}</AvatarActionsContext.Provider>;
}

function useVisibleAccountAvatar(address: string) {
  const actions = useContext(AvatarActionsContext);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let objectUrl: string | null = null;
    let attempts = 0;

    const load = async () => {
      const result = await fetchAccountAvatar(address, actions);

      if (cancelled) {
        return;
      }

      if (result.kind === 'pending' && attempts < getPendingRetryCount()) {
        attempts += 1;
        timer = window.setTimeout(() => void load(), result.retryAfterSeconds * 1000);
        return;
      }

      if (result.kind === 'ready') {
        // Copy into a browser-owned ArrayBuffer view before Blob construction. The bridge parser
        // accepts generic typed-array backing buffers, while DOM BlobPart intentionally requires
        // an ordinary ArrayBuffer view.
        const blobBytes = new Uint8Array(result.bytes.byteLength);
        blobBytes.set(result.bytes);
        objectUrl = URL.createObjectURL(new Blob([blobBytes], { type: result.contentType }));
        setAvatarUrl(objectUrl);
      } else {
        setAvatarUrl(null);
      }
    };

    setAvatarUrl(null);
    void load();

    return () => {
      cancelled = true;
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [actions, address]);

  return avatarUrl;
}

export function IdentityAvatar({
  address,
  profile,
  size = 'normal',
}: IdentityProps & { size?: 'small' | 'normal' | 'large' }) {
  const label = getIdentityLabel(profile, address);
  const avatarSrc = useVisibleAccountAvatar(address);
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);

  if (avatarSrc && avatarSrc !== brokenSrc) {
    return (
      <img
        alt=""
        className={`identity-avatar identity-avatar-${size}`}
        onError={() => setBrokenSrc(avatarSrc)}
        src={avatarSrc}
        title={label}
      />
    );
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
      <span className="identity-name" dir="auto">{label}</span>
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
  return <span className={`badge badge-${statusTone(status)}`}><TrustShield status={status} /><span>{statusLabel(status)}</span></span>;
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
