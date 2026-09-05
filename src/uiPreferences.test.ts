// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import {
  getInitialShowAllRoles,
  getInitialTrustFlowGuideCollapsed,
  persistShowAllRoles,
  persistTrustFlowGuideCollapsed,
} from './uiPreferences';

describe('UI preferences (localStorage-backed)', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('defaults showAllRoles to off when nothing is stored', () => {
    expect(getInitialShowAllRoles()).toBe(false);
  });

  it('persists showAllRoles across reads', () => {
    persistShowAllRoles(true);
    expect(getInitialShowAllRoles()).toBe(true);
    expect(window.localStorage.getItem('qortium-trust.showAllRoles')).toBe('true');

    persistShowAllRoles(false);
    expect(getInitialShowAllRoles()).toBe(false);
  });

  it('defaults the trust flow guide to collapsed and persists its collapsed state', () => {
    expect(getInitialTrustFlowGuideCollapsed()).toBe(true);

    persistTrustFlowGuideCollapsed(true);
    expect(getInitialTrustFlowGuideCollapsed()).toBe(true);
    expect(window.localStorage.getItem('qortium-trust.trustFlowGuideCollapsed')).toBe('true');
  });

  it('falls back to the default when localStorage access throws', () => {
    const original = window.localStorage.getItem;
    window.localStorage.getItem = () => {
      throw new Error('blocked');
    };

    try {
      expect(getInitialShowAllRoles()).toBe(false);
    } finally {
      window.localStorage.getItem = original;
    }
  });
});
