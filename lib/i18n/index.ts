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
  "zh-SG": zhCN,
  "zh-TW": zhTW,
  "zh-HK": zhTW,
  "zh-MO": zhTW,
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

const getPolyglotInstance = (lang: Lang = DEFAULT_LANG) => {
  return new Polyglot({
    phrases: i18nMap[lang] ?? i18nMap.en,
    locale: lang,
  });
};

export default getPolyglotInstance;
