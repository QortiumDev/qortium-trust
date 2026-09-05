import type { MouseEvent } from 'react';
import { Info } from 'lucide-react';
import { t } from '../i18n';
import { getNodeApiUrl, qdnRequest } from '../qdnRequest';
import type { BridgeState } from '../types';

const WIKI_PATH = '/APP/Qortium-Unified-Community/Community-Portal/wiki/article/wk-c2d1006c55434054ae79979112e09637';
export const TRUST_WIKI_ADDRESS = `qdn:/${WIKI_PATH}`;

export function trustWikiBrowserHref(location: Pick<Location, 'origin' | 'pathname'>, context?: unknown) {
  const prefix = context === 'render' || location.pathname.startsWith('/render/') ? '/render' : '';
  return `${location.origin}${prefix}${WIKI_PATH}`;
}

export function TrustInfoLink({ bridge, onError }: { bridge?: BridgeState | null; onError: (message: string) => void }) {
  // The gateway also supplies window.qdnRequest, so use the advertised action
  // rather than bridge presence to distinguish Home from a browser gateway.
  const opensHomeTab = !!bridge?.actions.includes('OPEN_NEW_TAB');
  const href = opensHomeTab
    ? TRUST_WIKI_ADDRESS
    : bridge?.ui === 'BROWSER_DEV'
      ? `${getNodeApiUrl()}/render${WIKI_PATH}`
      : trustWikiBrowserHref(window.location, window._qdnContext);

  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    // Core injects a document-level legacy handler that intercepts qdn:// and
    // absolute HTTP(S) links, ignoring target=_blank. Keep this link's behavior
    // local: Home's explicit tab action, or the browser's native anchor default.
    event.stopPropagation();
    if (!opensHomeTab || (event.button !== 0 && event.button !== 1)) return;
    event.preventDefault();
    void qdnRequest({ action: 'OPEN_NEW_TAB', address: TRUST_WIKI_ADDRESS }).catch(error => {
      onError(error instanceof Error ? error.message : String(error));
    });
  };

  return (
    <a className="icon-button" aria-label={t('action.trustInfo')} title={t('action.trustInfo')}
      href={href} target="_blank" rel="noopener noreferrer" onClick={open} onAuxClick={open}>
      <Info aria-hidden="true" size={17} />
    </a>
  );
}
