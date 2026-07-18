// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyDisplaySettings,
  getDisplaySettingsUpdateFromMessage,
  getInitialDisplaySettings,
  normalizeAccent,
  normalizeLanguage,
  normalizeTextSize,
  normalizeTheme,
  normalizeUiStyle,
  type QdnDisplaySettings,
} from './displaySettings';
import { getTranslationLanguage, setTranslationLanguage } from './i18n';

const current: QdnDisplaySettings = {
  accent: 'green',
  language: 'en',
  textSize: 'medium',
  theme: 'light',
  uiStyle: 'classic',
};

describe('QDN display settings helpers', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-accent');
    document.documentElement.removeAttribute('data-language');
    document.documentElement.removeAttribute('data-text-size');
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-ui');
    document.documentElement.removeAttribute('dir');
    document.documentElement.removeAttribute('lang');
    document.documentElement.style.colorScheme = '';
    setTranslationLanguage('en');
    vi.unstubAllGlobals();
  });

  it('normalizes supported display values', () => {
    expect(normalizeTheme('DARK')).toBe('dark');
    expect(normalizeTheme(' light ')).toBe('light');
    expect(normalizeAccent('BLUE')).toBe('blue');
    expect(normalizeAccent(' teal ')).toBe('teal');
    expect(normalizeLanguage('HE')).toBe('he');
    expect(normalizeLanguage('zh-cn')).toBe('zh-CN');
    expect(normalizeLanguage('zh-Hant')).toBe('zh-TW');
    expect(normalizeLanguage('no')).toBe('nb');
    expect(normalizeTextSize('EXTRA-LARGE')).toBe('extra-large');
    expect(normalizeTextSize(' huge ')).toBe('huge');
    expect(normalizeUiStyle('MODERN')).toBe('modern');
    expect(normalizeUiStyle(' classic ')).toBe('classic');
    expect(normalizeUiStyle('FUN')).toBe('fun');
  });

  it('rejects unsupported display values', () => {
    expect(normalizeTheme('system')).toBeNull();
    expect(normalizeTheme('sepia')).toBeNull();
    expect(normalizeAccent('neon')).toBeNull();
    expect(normalizeLanguage('klingon')).toBeNull();
    expect(normalizeLanguage('system')).toBeNull();
    expect(normalizeTextSize('extra-huge')).toBeNull();
    expect(normalizeUiStyle('retro')).toBeNull();
  });

  it('reads initial QDN globals from Core/Home', () => {
    vi.stubGlobal('window', {
      _qdnAccent: 'blue',
      _qdnLanguage: 'he',
      _qdnTextSize: 'large',
      _qdnTheme: 'dark',
      _qdnUiStyle: 'modern',
    });

    expect(getInitialDisplaySettings()).toEqual({
      accent: 'blue',
      language: 'he',
      textSize: 'large',
      theme: 'dark',
      uiStyle: 'modern',
    });
  });

  it('prefers Core/Home query params over global values', () => {
    vi.stubGlobal('window', {
      _qdnAccent: 'yellow',
      _qdnLanguage: 'he',
      _qdnTextSize: 'small',
      _qdnTheme: 'light',
      _qdnUiStyle: 'classic',
      location: {
        search: '?qdnTheme=dark&qdnAccent=red&qdnLanguage=zh-CN&qdnTextSize=huge&uiStyle=modern',
      },
    });

    expect(getInitialDisplaySettings()).toEqual({
      accent: 'red',
      language: 'zh-CN',
      textSize: 'huge',
      theme: 'dark',
      uiStyle: 'modern',
    });
  });

  it('defaults unsupported or absent uiStyle to classic', () => {
    vi.stubGlobal('window', {
      _qdnUIStyle: 'banana',
      location: {
        search: '?uiStyle=banana',
      },
    });

    expect(getInitialDisplaySettings().uiStyle).toBe('classic');
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
    expect(getDisplaySettingsUpdateFromMessage({ action: 'LANGUAGE_CHANGED', qdnLanguage: 'ar' }, current)).toEqual({
      ...current,
      language: 'ar',
    });
    expect(getDisplaySettingsUpdateFromMessage({ action: 'TEXT_SIZE_CHANGED', qdnTextSize: 'extra-large' }, current)).toEqual({
      ...current,
      textSize: 'extra-large',
    });
    expect(getDisplaySettingsUpdateFromMessage({ action: 'UI_STYLE_CHANGED', requestedHandler: 'UI', uiStyle: 'modern' }, current)).toEqual({
      ...current,
      uiStyle: 'modern',
    });
  });

  it('updates bundled display settings from Home messages', () => {
    expect(
      getDisplaySettingsUpdateFromMessage(
        {
          action: 'DISPLAY_SETTINGS_CHANGED',
          accent: 'teal',
          language: 'he',
          textSize: 'large',
          theme: 'dark',
          uiStyle: 'modern',
        },
        current,
      ),
    ).toEqual({
      accent: 'teal',
      language: 'he',
      textSize: 'large',
      theme: 'dark',
      uiStyle: 'modern',
    });
    expect(getDisplaySettingsUpdateFromMessage({ action: 'DISPLAY_SETTINGS_CHANGED', theme: 'system' }, current)).toBeNull();
  });

  it('applies language to the document and i18n runtime', () => {
    applyDisplaySettings({
      accent: 'purple',
      language: 'ar',
      textSize: 'huge',
      theme: 'dark',
      uiStyle: 'modern',
    });

    expect(document.documentElement.dataset.accent).toBe('purple');
    expect(document.documentElement.dataset.language).toBe('ar');
    expect(document.documentElement.dataset.textSize).toBe('huge');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.dataset.ui).toBe('modern');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(getTranslationLanguage()).toBe('ar');
  });

  it('ignores invalid and unknown messages', () => {
    expect(getDisplaySettingsUpdateFromMessage({ action: 'THEME_CHANGED', theme: 'system' }, current)).toBeNull();
    expect(getDisplaySettingsUpdateFromMessage({ action: 'ACCENT_CHANGED', accent: 'neon' }, current)).toBeNull();
    expect(getDisplaySettingsUpdateFromMessage({ action: 'LANGUAGE_CHANGED', language: 'system' }, current)).toBeNull();
    expect(getDisplaySettingsUpdateFromMessage({ action: 'TEXT_SIZE_CHANGED', textSize: 'tiny' }, current)).toBeNull();
    expect(getDisplaySettingsUpdateFromMessage({ action: 'UI_STYLE_CHANGED', uiStyle: 'banana' }, current)).toBeNull();
    expect(getDisplaySettingsUpdateFromMessage({ action: 'UI_STYLE_CHANGED', requestedHandler: 'OTHER', uiStyle: 'modern' }, current)).toBeNull();
    expect(getDisplaySettingsUpdateFromMessage({ action: 'UNKNOWN' }, current)).toBeNull();
  });
});
