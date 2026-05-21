import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import ko from './locales/ko.json';

export const SUPPORTED_LANGS = ['en', 'ko'] as const;
export type SupportedLang = (typeof SUPPORTED_LANGS)[number];

export const I18N_STORAGE_KEY = 'authlens.lang';

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ko: { translation: ko },
    },
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGS,
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: I18N_STORAGE_KEY,
      caches: ['localStorage'],
    },
    react: {
      useSuspense: false,
    },
  });

export function changeLanguage(lang: SupportedLang): Promise<unknown> {
  return i18n.changeLanguage(lang);
}

export function currentLanguage(): SupportedLang {
  const resolved = (i18n.resolvedLanguage ?? i18n.language ?? 'en').slice(0, 2);
  return (SUPPORTED_LANGS as readonly string[]).includes(resolved)
    ? (resolved as SupportedLang)
    : 'en';
}

export default i18n;
