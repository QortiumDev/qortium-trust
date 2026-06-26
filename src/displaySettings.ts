import { setTranslationLanguage } from './i18n';

export const ACCENT_OPTIONS = ['green', 'blue', 'orange', 'purple', 'red', 'teal', 'cyan', 'pink', 'yellow'] as const;
export const LANGUAGE_VALUES = [
  'ar',
  'de',
  'el',
  'en',
  'es',
  'et',
  'fi',
  'fr',
  'he',
  'hi',
  'hu',
  'it',
  'ja',
  'ko',
  'nb',
  'nl',
  'pl',
  'pt',
  'ro',
  'ru',
  'sv',
  'zh-CN',
  'zh-TW',
] as const;
export const TEXT_SIZE_VALUES = ['extra-small', 'small', 'medium', 'large', 'extra-large', 'huge'] as const;
export const UI_STYLE_VALUES = ['classic', 'modern'] as const;

export type QdnTheme = 'dark' | 'light';
export type QdnAccent = typeof ACCENT_OPTIONS[number];
export type QdnLanguage = typeof LANGUAGE_VALUES[number];
export type QdnTextSize = typeof TEXT_SIZE_VALUES[number];
export type QdnUiStyle = typeof UI_STYLE_VALUES[number];

export type QdnDisplaySettings = {
  accent: QdnAccent;
  language: QdnLanguage;
  textSize: QdnTextSize;
  theme: QdnTheme;
  uiStyle: QdnUiStyle;
};

type QdnHostWindow = Window & {
  _qdnAccent?: unknown;
  _qdnLang?: unknown;
  _qdnLanguage?: unknown;
  _qdnTextSize?: unknown;
  _qdnTheme?: unknown;
  _qdnUiStyle?: unknown;
  _qdnUIStyle?: unknown;
};

const DEFAULT_DISPLAY_SETTINGS: QdnDisplaySettings = {
  accent: 'green',
  language: 'en',
  textSize: 'medium',
  theme: 'light',
  uiStyle: 'classic',
};

const RTL_LANGUAGES = new Set<QdnLanguage>(['ar', 'he']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

export function normalizeTheme(value: unknown): QdnTheme | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  return normalized === 'dark' || normalized === 'light' ? normalized : null;
}

export function normalizeAccent(value: unknown): QdnAccent | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  return ACCENT_OPTIONS.includes(normalized as QdnAccent) ? normalized as QdnAccent : null;
}

export function normalizeLanguage(value: unknown): QdnLanguage | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  const normalized = trimmed.toLowerCase();

  if (normalized === 'zh-cn' || normalized === 'zh-hans') {
    return 'zh-CN';
  }

  if (normalized === 'zh-tw' || normalized === 'zh-hant') {
    return 'zh-TW';
  }

  if (normalized === 'no') {
    return 'nb';
  }

  return LANGUAGE_VALUES.find((language) => language.toLowerCase() === normalized) ?? null;
}

export function normalizeTextSize(value: unknown): QdnTextSize | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  return TEXT_SIZE_VALUES.includes(normalized as QdnTextSize) ? normalized as QdnTextSize : null;
}

export function normalizeUiStyle(value: unknown): QdnUiStyle | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  return UI_STYLE_VALUES.includes(normalized as QdnUiStyle) ? normalized as QdnUiStyle : null;
}

export function getInitialDisplaySettings(): QdnDisplaySettings {
  const hostWindow = typeof window === 'undefined' ? null : window as QdnHostWindow;
  const query = typeof window === 'undefined' ? null : new URLSearchParams(window.location?.search ?? '');

  return {
    accent: normalizeAccent(query?.get('accent') ?? query?.get('qdnAccent') ?? hostWindow?._qdnAccent) ??
      DEFAULT_DISPLAY_SETTINGS.accent,
    language: normalizeLanguage(
      query?.get('language') ??
      query?.get('lang') ??
      query?.get('qdnLanguage') ??
      query?.get('qdnLang') ??
      hostWindow?._qdnLanguage ??
      hostWindow?._qdnLang,
    ) ?? DEFAULT_DISPLAY_SETTINGS.language,
    textSize: normalizeTextSize(query?.get('textSize') ?? query?.get('text-size') ?? query?.get('qdnTextSize')) ??
      normalizeTextSize(hostWindow?._qdnTextSize) ??
      DEFAULT_DISPLAY_SETTINGS.textSize,
    theme: normalizeTheme(query?.get('theme') ?? query?.get('qdnTheme') ?? hostWindow?._qdnTheme) ??
      DEFAULT_DISPLAY_SETTINGS.theme,
    uiStyle: normalizeUiStyle(
      query?.get('uiStyle') ??
      query?.get('ui-style') ??
      query?.get('qdnUiStyle') ??
      query?.get('qdnUIStyle') ??
      hostWindow?._qdnUiStyle ??
      hostWindow?._qdnUIStyle,
    ) ?? DEFAULT_DISPLAY_SETTINGS.uiStyle,
  };
}

export function applyDisplaySettings(settings: QdnDisplaySettings) {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;

  setTranslationLanguage(settings.language);

  root.dataset.accent = settings.accent;
  root.dataset.language = settings.language;
  root.dataset.textSize = settings.textSize;
  root.dataset.theme = settings.theme;
  root.dataset.ui = settings.uiStyle;
  root.dir = RTL_LANGUAGES.has(settings.language) ? 'rtl' : 'ltr';
  root.lang = settings.language;
  root.style.colorScheme = settings.theme;
}

export function getDisplaySettingsUpdateFromMessage(
  data: unknown,
  current: QdnDisplaySettings,
): QdnDisplaySettings | null {
  if (!isRecord(data) || typeof data.action !== 'string') {
    return null;
  }

  if ('requestedHandler' in data && data.requestedHandler !== 'UI') {
    return null;
  }

  switch (data.action) {
    case 'THEME_CHANGED': {
      const theme = normalizeTheme(data.theme ?? data.qdnTheme);

      return theme ? { ...current, theme } : null;
    }

    case 'ACCENT_CHANGED': {
      const accent = normalizeAccent(data.accent ?? data.qdnAccent);

      return accent ? { ...current, accent } : null;
    }

    case 'LANGUAGE_CHANGED': {
      const language = normalizeLanguage(data.language ?? data.lang ?? data.qdnLanguage ?? data.qdnLang);

      return language ? { ...current, language } : null;
    }

    case 'TEXT_SIZE_CHANGED': {
      const textSize = normalizeTextSize(data.textSize ?? data.qdnTextSize);

      return textSize ? { ...current, textSize } : null;
    }

    case 'UI_STYLE_CHANGED': {
      const uiStyle = normalizeUiStyle(data.uiStyle ?? data.ui ?? data.qdnUiStyle ?? data.qdnUIStyle);

      return uiStyle ? { ...current, uiStyle } : null;
    }

    case 'DISPLAY_SETTINGS_CHANGED': {
      const next: QdnDisplaySettings = { ...current };
      let changed = false;
      const accent = normalizeAccent(data.accent ?? data.qdnAccent);
      const language = normalizeLanguage(data.language ?? data.lang ?? data.qdnLanguage ?? data.qdnLang);
      const textSize = normalizeTextSize(data.textSize ?? data.qdnTextSize);
      const theme = normalizeTheme(data.theme ?? data.qdnTheme);
      const uiStyle = normalizeUiStyle(data.uiStyle ?? data.ui ?? data.qdnUiStyle ?? data.qdnUIStyle);

      if (accent) {
        next.accent = accent;
        changed = true;
      }

      if (language) {
        next.language = language;
        changed = true;
      }

      if (textSize) {
        next.textSize = textSize;
        changed = true;
      }

      if (theme) {
        next.theme = theme;
        changed = true;
      }

      if (uiStyle) {
        next.uiStyle = uiStyle;
        changed = true;
      }

      return changed ? next : null;
    }

    default:
      return null;
  }
}
