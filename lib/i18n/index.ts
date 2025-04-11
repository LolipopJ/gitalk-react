import i18n, { type Resource } from "i18next";
import { initReactI18next } from "react-i18next";

import DE from "./de.json";
import EN from "./en.json";
import ES from "./es-ES.json";
import FA from "./fa.json";
import FR from "./fr.json";
import JA from "./ja.json";
import KO from "./ko.json";
import PL from "./pl.json";
import RU from "./ru.json";
import ZHCN from "./zh-CN.json";
import ZHTW from "./zh-TW.json";

const resources: Resource = {
  zh: { translation: ZHCN },
  "zh-CN": { translation: ZHCN },
  "zh-TW": { translation: ZHTW },
  en: { translation: EN },
  "es-ES": { translation: ES },
  fr: { translation: FR },
  ru: { translation: RU },
  de: { translation: DE },
  pl: { translation: PL },
  ko: { translation: KO },
  fa: { translation: FA },
  ja: { translation: JA },
};

i18n.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
  debug: import.meta.env.DEV,
});

export default i18n;
