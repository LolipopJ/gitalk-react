import Polyglot from "node-polyglot";

import { DEFAULT_LANG } from "../constants";
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

export const i18nMap = {
  zh: ZHCN,
  "zh-CN": ZHCN,
  "zh-TW": ZHTW,
  en: EN,
  "es-ES": ES,
  fr: FR,
  ru: RU,
  de: DE,
  pl: PL,
  ko: KO,
  fa: FA,
  ja: JA,
};

export type Lang = keyof typeof i18nMap;

const getPolyglotInstance = (lang: Lang = DEFAULT_LANG) => {
  return new Polyglot({
    phrases: i18nMap[lang] ?? i18nMap.en,
    locale: lang,
  });
};

export default getPolyglotInstance;
