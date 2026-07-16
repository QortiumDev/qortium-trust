import type { QdnLanguage } from '../displaySettings';
import { en, type TranslationKey } from './locales/en';
import { ar, he } from './locales/translations/rtl';
import { ja, ko, zhCN, zhTW } from './locales/translations/cjk';
import {
  de,
  el,
  es,
  et,
  fi,
  fr,
  hi,
  hu,
  it,
  nb,
  nl,
  pl,
  pt,
  ro,
  ru,
  sv,
} from './locales/translations/euro';

export type { TranslationKey };

export type TranslationParams = Record<string, string | number>;

const CATALOGS: Partial<Record<QdnLanguage, Partial<Record<TranslationKey, string>>>> = {
  en,
  ar,
  de,
  el,
  es,
  et,
  fi,
  fr,
  he,
  hi,
  hu,
  it,
  ja,
  ko,
  nb,
  nl,
  pl,
  pt,
  ro,
  ru,
  sv,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
};

let currentLanguage: QdnLanguage = 'en';

export function setTranslationLanguage(language: QdnLanguage) {
  currentLanguage = language;
}

export function getTranslationLanguage(): QdnLanguage {
  return currentLanguage;
}

export function t(key: TranslationKey, params?: TranslationParams): string {
  const template = CATALOGS[currentLanguage]?.[key] ?? en[key] ?? key;

  if (!params) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}
