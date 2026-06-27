import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "@/locales/en/translation.json";
import bn from "@/locales/bn/translation.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      bn: { translation: bn },
    },
    fallbackLng: "en",
    supportedLngs: ["en", "bn"],
    interpolation: { escapeValue: false }, // React already escapes
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "lang",
    },
  });

// Keep <html lang> in sync for accessibility + SEO.
const applyLang = (lng: string) => {
  document.documentElement.lang = lng?.startsWith("bn") ? "bn" : "en";
};
i18n.on("languageChanged", applyLang);
applyLang(i18n.language || "en");

export default i18n;
