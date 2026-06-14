export const ACCENT_OPTIONS = ['green', 'blue', 'orange', 'purple', 'red', 'teal', 'cyan', 'pink', 'yellow'] as const;
export const TEXT_SIZE_VALUES = ['extra-small', 'small', 'medium', 'large', 'extra-large', 'huge'] as const;

export type QdnTheme = 'dark' | 'light';
export type QdnAccent = typeof ACCENT_OPTIONS[number];
export type QdnTextSize = typeof TEXT_SIZE_VALUES[number];

export type QdnDisplaySettings = {
  accent: QdnAccent;
  textSize: QdnTextSize;
  theme: QdnTheme;
};

type QdnHostWindow = Window & {
  _qdnAccent?: unknown;
  _qdnTextSize?: unknown;
  _qdnTheme?: unknown;
};

const DEFAULT_DISPLAY_SETTINGS: QdnDisplaySettings = {
  accent: 'green',
  textSize: 'medium',
  theme: 'light',
};

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

export function normalizeTextSize(value: unknown): QdnTextSize | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  return TEXT_SIZE_VALUES.includes(normalized as QdnTextSize) ? normalized as QdnTextSize : null;
}

export function getInitialDisplaySettings(): QdnDisplaySettings {
  const hostWindow = typeof window === 'undefined' ? null : window as QdnHostWindow;
  const query = typeof window === 'undefined' ? null : new URLSearchParams(window.location?.search ?? '');

  return {
    accent: normalizeAccent(query?.get('accent') ?? query?.get('qdnAccent') ?? hostWindow?._qdnAccent) ??
      DEFAULT_DISPLAY_SETTINGS.accent,
    textSize: normalizeTextSize(query?.get('textSize') ?? query?.get('text-size') ?? query?.get('qdnTextSize')) ??
      normalizeTextSize(hostWindow?._qdnTextSize) ??
      DEFAULT_DISPLAY_SETTINGS.textSize,
    theme: normalizeTheme(query?.get('theme') ?? query?.get('qdnTheme') ?? hostWindow?._qdnTheme) ??
      DEFAULT_DISPLAY_SETTINGS.theme,
  };
}

export function applyDisplaySettings(settings: QdnDisplaySettings) {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;

  root.dataset.accent = settings.accent;
  root.dataset.textSize = settings.textSize;
  root.dataset.theme = settings.theme;
  root.style.colorScheme = settings.theme;
}

export function getDisplaySettingsUpdateFromMessage(
  data: unknown,
  current: QdnDisplaySettings,
): QdnDisplaySettings | null {
  if (!isRecord(data) || typeof data.action !== 'string') {
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

    case 'TEXT_SIZE_CHANGED': {
      const textSize = normalizeTextSize(data.textSize ?? data.qdnTextSize);

      return textSize ? { ...current, textSize } : null;
    }

    case 'DISPLAY_SETTINGS_CHANGED': {
      const accent = normalizeAccent(data.accent ?? data.qdnAccent) ?? current.accent;
      const textSize = normalizeTextSize(data.textSize ?? data.qdnTextSize) ?? current.textSize;
      const theme = normalizeTheme(data.theme ?? data.qdnTheme) ?? current.theme;

      return { accent, textSize, theme };
    }

    default:
      return null;
  }
}
