// Namespaced localStorage-backed UI preferences. There is no existing storage module in this app
// (display settings come from the QDN host via postMessage/query params, not localStorage), so this
// introduces the app's first localStorage usage — kept small and defensive since the app can run
// inside a sandboxed iframe where storage access may throw.
const SHOW_ALL_ROLES_KEY = 'qortium-trust.showAllRoles';
const TRUST_FLOW_GUIDE_COLLAPSED_KEY = 'qortium-trust.trustFlowGuideCollapsed';

function readStoredBoolean(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);

    return raw === null ? fallback : raw === 'true';
  } catch {
    return fallback;
  }
}

function writeStoredBoolean(key: string, value: boolean) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Ignore storage failures (private browsing, sandboxed iframe, quota) — the in-memory state
    // still works for the current session, it just won't persist across reloads.
  }
}

// Minters-first redesign (Stage A): the app now defaults to the SUBJECT-only ("Minters") surface.
// Voters/Guides/Designers move behind this toggle, off by default.
export function getInitialShowAllRoles(): boolean {
  return readStoredBoolean(SHOW_ALL_ROLES_KEY, false);
}

export function persistShowAllRoles(value: boolean): void {
  writeStoredBoolean(SHOW_ALL_ROLES_KEY, value);
}

export function getInitialTrustFlowGuideCollapsed(): boolean {
  return readStoredBoolean(TRUST_FLOW_GUIDE_COLLAPSED_KEY, false);
}

export function persistTrustFlowGuideCollapsed(value: boolean): void {
  writeStoredBoolean(TRUST_FLOW_GUIDE_COLLAPSED_KEY, value);
}
