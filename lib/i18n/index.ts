import Polyglot from "node-polyglot";

import { DEFAULT_LANG } from "../constants";
import ar from "./ar.json";
import bn from "./bn.json";
import de from "./de.json";
import en from "./en.json";
import es from "./es.json";
import fa from "./fa.json";
import fr from "./fr.json";
import hi from "./hi.json";
import ja from "./ja.json";
import ko from "./ko.json";
import pl from "./pl.json";
import pt from "./pt.json";
import ru from "./ru.json";
import ur from "./ur.json";
import zhCN from "./zh-CN.json";
import zhTW from "./zh-TW.json";

export const i18nMap = {
  en,
  zh: zhCN,
  "zh-CN": zhCN,
  "zh-TW": zhTW,
  "zh-HK": zhTW,
  hi,
  es,
  fr,
  ar,
  bn,
  ru,
  pt,
  ur,
  ko,
  ja,
  de,
  pl,
  fa,
};

export type Lang = keyof typeof i18nMap;

export const resolveLanguage = (language: string = DEFAULT_LANG): Lang => {
  try {
    const locale = new Intl.Locale(language);
    if (Object.prototype.hasOwnProperty.call(i18nMap, locale.baseName)) {
      return locale.baseName as Lang;
    }
    if (locale.language === "zh") {
      return locale.maximize().script === "Hant" ? "zh-TW" : "zh-CN";
    }
    if (Object.prototype.hasOwnProperty.call(i18nMap, locale.language)) {
      return locale.language as Lang;
    }
  } catch {
    // Invalid language tags use the default translation, just like unknown ones.
  }
  return DEFAULT_LANG;
};

const getPolyglotInstance = (language: string = DEFAULT_LANG) => {
  const lang = resolveLanguage(language);
  return new Polyglot({
    phrases: i18nMap[lang],
    locale: lang,
  });
};

export default getPolyglotInstance;
