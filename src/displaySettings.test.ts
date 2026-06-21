import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getDisplaySettingsUpdateFromMessage,
  getInitialDisplaySettings,
  normalizeAccent,
  normalizeTextSize,
  normalizeTheme,
  type QdnDisplaySettings,
} from './displaySettings';

const current: QdnDisplaySettings = {
  accent: 'green',
  textSize: 'medium',
  theme: 'light',
};

describe('QDN display settings helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('normalizes supported theme and accent values', () => {
    expect(normalizeTheme('DARK')).toBe('dark');
    expect(normalizeTheme(' light ')).toBe('light');
    expect(normalizeAccent('BLUE')).toBe('blue');
    expect(normalizeAccent(' teal ')).toBe('teal');
    expect(normalizeTextSize('EXTRA-LARGE')).toBe('extra-large');
    expect(normalizeTextSize(' huge ')).toBe('huge');
  });

  it('rejects unsupported theme and accent values', () => {
    expect(normalizeTheme('system')).toBeNull();
    expect(normalizeTheme('sepia')).toBeNull();
    expect(normalizeAccent('neon')).toBeNull();
    expect(normalizeTextSize('extra-huge')).toBeNull();
  });

  it('reads initial QDN globals from Core/Home', () => {
    vi.stubGlobal('window', {
      _qdnAccent: 'blue',
      _qdnTextSize: 'large',
      _qdnTheme: 'dark',
    });

    expect(getInitialDisplaySettings()).toEqual({
      accent: 'blue',
      textSize: 'large',
      theme: 'dark',
    });
  });

  it('prefers Core/Home query params over global values', () => {
    vi.stubGlobal('window', {
      _qdnAccent: 'yellow',
      _qdnTextSize: 'small',
      _qdnTheme: 'light',
      location: {
        search: '?qdnTheme=dark&qdnAccent=red&qdnTextSize=huge',
      },
    });

    expect(getInitialDisplaySettings()).toEqual({
      accent: 'red',
      textSize: 'huge',
      theme: 'dark',
    });
  });

  it('updates individual settings from Home messages', () => {
    expect(getDisplaySettingsUpdateFromMessage({ action: 'THEME_CHANGED', qdnTheme: 'dark' }, current)).toEqual({
      ...current,
      theme: 'dark',
    });
    expect(getDisplaySettingsUpdateFromMessage({ action: 'ACCENT_CHANGED', qdnAccent: 'blue' }, current)).toEqual({
      ...current,
      accent: 'blue',
    });
    expect(getDisplaySettingsUpdateFromMessage({ action: 'TEXT_SIZE_CHANGED', qdnTextSize: 'extra-large' }, current)).toEqual({
      ...current,
      textSize: 'extra-large',
    });
  });

  it('ignores invalid and unknown messages', () => {
    // Home delivers discrete *_CHANGED events only; there is no combined DISPLAY_SETTINGS_CHANGED.
    expect(getDisplaySettingsUpdateFromMessage({ action: 'DISPLAY_SETTINGS_CHANGED', theme: 'dark' }, current)).toBeNull();
    expect(getDisplaySettingsUpdateFromMessage({ action: 'THEME_CHANGED', theme: 'system' }, current)).toBeNull();
    expect(getDisplaySettingsUpdateFromMessage({ action: 'ACCENT_CHANGED', accent: 'neon' }, current)).toBeNull();
    expect(getDisplaySettingsUpdateFromMessage({ action: 'TEXT_SIZE_CHANGED', textSize: 'tiny' }, current)).toBeNull();
    expect(getDisplaySettingsUpdateFromMessage({ action: 'UNKNOWN' }, current)).toBeNull();
  });
});
