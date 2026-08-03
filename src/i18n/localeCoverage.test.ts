import { describe, expect, it } from 'vitest';
import { en, type TranslationKey } from './locales/en';
import * as euro from './locales/translations/euro';
import * as cjk from './locales/translations/cjk';
import * as rtl from './locales/translations/rtl';

type LocaleCatalog = Partial<Record<TranslationKey, string>>;

// Every non-English locale catalog, keyed by its exported locale code.
// Kept in sync with src/i18n/index.ts's CATALOGS map — if a new locale is
// added there without a matching entry here, this suite won't see it, so
// also cross-check against the module exports directly below.
const LOCALES: Record<string, LocaleCatalog> = {
  de: euro.de,
  el: euro.el,
  es: euro.es,
  et: euro.et,
  fi: euro.fi,
  fr: euro.fr,
  hi: euro.hi,
  hu: euro.hu,
  it: euro.it,
  nb: euro.nb,
  nl: euro.nl,
  pl: euro.pl,
  pt: euro.pt,
  ro: euro.ro,
  ru: euro.ru,
  sv: euro.sv,
  ja: cjk.ja,
  ko: cjk.ko,
  zhCN: cjk.zhCN,
  zhTW: cjk.zhTW,
  ar: rtl.ar,
  he: rtl.he,
};

const enKeys = new Set(Object.keys(en));

describe('locale catalog coverage', () => {
  it('exports every locale referenced in the euro/cjk/rtl translation modules', () => {
    // Guards against silently losing coverage of a locale that a module adds
    // later but this suite forgets to list above.
    const exportedNames = [
      ...Object.keys(euro),
      ...Object.keys(cjk),
      ...Object.keys(rtl),
    ].sort();
    expect(Object.keys(LOCALES).sort()).toEqual(exportedNames);
  });

  it.each(Object.keys(LOCALES).sort())(
    '%s has exactly the same key set as en.ts (no missing, no extra)',
    (locale) => {
      const catalog = LOCALES[locale];
      const localeKeys = new Set(Object.keys(catalog));

      const missing = [...enKeys].filter((key) => !localeKeys.has(key)).sort();
      const extra = [...localeKeys].filter((key) => !enKeys.has(key)).sort();

      if (missing.length > 0 || extra.length > 0) {
        const lines = [`Locale "${locale}" key set diverges from en.ts:`];
        if (missing.length > 0) {
          lines.push(`  MISSING (${missing.length}): ${missing.join(', ')}`);
        }
        if (extra.length > 0) {
          lines.push(`  EXTRA (${extra.length}, stale — remove from the catalog): ${extra.join(', ')}`);
        }
        throw new Error(lines.join('\n'));
      }

      expect(missing).toEqual([]);
      expect(extra).toEqual([]);
    },
  );
});
