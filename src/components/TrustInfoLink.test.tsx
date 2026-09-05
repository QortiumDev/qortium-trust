// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { qdnRequest } from '../qdnRequest';
import { TRUST_WIKI_ADDRESS, TrustInfoLink, trustWikiBrowserHref } from './TrustInfoLink';

vi.mock('../qdnRequest', () => ({ qdnRequest: vi.fn(), getNodeApiUrl: () => 'http://127.0.0.1:24891' }));
const path = '/APP/Qortium-Unified-Community/Community-Portal/wiki/article/wk-c2d1006c55434054ae79979112e09637';
afterEach(() => { cleanup(); vi.resetAllMocks(); delete window._qdnContext; });

describe('Trust wiki navigation', () => {
  it.each(['https://qdn.qortium.app', 'https://community.qortium.app', 'https://another-gateway.example:8443'])(
    'uses the current gateway origin for copied links: %s', origin => {
      expect(trustWikiBrowserHref(new URL(origin + '/APP/Trust/Trust/'), 'gateway')).toBe(origin + path);
    },
  );

  it('retains the local Core render route', () => {
    expect(trustWikiBrowserHref(new URL('http://127.0.0.1:24891/render/APP/Trust/Trust/')))
      .toBe('http://127.0.0.1:24891/render' + path);
  });

  it.each(['click', 'auxclick'] as const)('opens a Home tab once via the advertised bridge on %s', async eventType => {
    vi.mocked(qdnRequest).mockResolvedValue(true);
    const legacyHandler = vi.fn((event: Event) => event.preventDefault());
    document.addEventListener(eventType, legacyHandler);
    try {
      render(<TrustInfoLink bridge={{ actions: ['OPEN_NEW_TAB'], isHomeBridge: true, ui: 'QORTIUM_HOME' }} onError={vi.fn()} />);
      const anchor = screen.getByRole('link', { name: 'About Trust' });
      expect(anchor.getAttribute('href')).toBe(TRUST_WIKI_ADDRESS);
      const event = new MouseEvent(eventType, { bubbles: true, cancelable: true, button: eventType === 'click' ? 0 : 1 });
      await act(async () => { fireEvent(anchor.querySelector('svg')!, event); });
      expect(event.defaultPrevented).toBe(true);
      expect(legacyHandler).not.toHaveBeenCalled();
      expect(qdnRequest).toHaveBeenCalledExactlyOnceWith({ action: 'OPEN_NEW_TAB', address: TRUST_WIKI_ADDRESS });
    } finally { document.removeEventListener(eventType, legacyHandler); }
  });

  it('keeps the gateway native new-tab action and bypasses the injected link blocker', () => {
    window._qdnContext = 'gateway';
    const legacyHandler = vi.fn((event: Event) => event.preventDefault());
    document.addEventListener('click', legacyHandler);
    try {
      render(<TrustInfoLink bridge={{ actions: ['FETCH_NODE_API'], isHomeBridge: true, ui: 'QORTIUM_GATEWAY' }} onError={vi.fn()} />);
      const anchor = screen.getByRole('link', { name: 'About Trust' }) as HTMLAnchorElement;
      expect(anchor.href).toBe(window.location.origin + path);
      expect(anchor.target).toBe('_blank');
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      fireEvent(anchor, event);
      expect(event.defaultPrevented).toBe(false);
      expect(legacyHandler).not.toHaveBeenCalled();
      expect(qdnRequest).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('click', legacyHandler);
    }
  });

  it('surfaces a Home navigation rejection', async () => {
    vi.mocked(qdnRequest).mockRejectedValue(new Error('Home could not open the tab'));
    const onError = vi.fn();
    render(<TrustInfoLink bridge={{ actions: ['OPEN_NEW_TAB'], isHomeBridge: true, ui: 'QORTIUM_HOME' }} onError={onError} />);
    await act(async () => { fireEvent.click(screen.getByRole('link')); });
    expect(onError).toHaveBeenCalledWith('Home could not open the tab');
  });
});
