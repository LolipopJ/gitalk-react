import {
  de,
  enUS,
  es,
  faIR,
  fr,
  ja,
  ko,
  type Locale,
  pl,
  ru,
  zhCN,
  zhTW,
} from "date-fns/locale";

import packageJson from "../../package.json";
import { type GitalkProps } from "../gitalk";
import { type Lang } from "../i18n";

export const VERSION = packageJson.version;
export const HOMEPAGE = packageJson.homepage;

export const DEFAULT_LANG: Lang = "en";
export const DEFAULT_LABELS = ["Gitalk"];
export const DEFAULT_AVATAR =
  "https://cdn.jsdelivr.net/npm/gitalk@1/src/assets/icon/github.svg";
export const DEFAULT_USER: GitalkProps["defaultUser"] = {
  avatar_url: "//avatars1.githubusercontent.com/u/29697133?s=50",
  login: "null",
  html_url: "",
};

export const ACCESS_TOKEN_KEY = "GT_ACCESS_TOKEN";
export const STORED_COMMENTS_KEY = "GT_COMMENT";

export const DATE_FNS_LOCALE_MAP: Record<Lang, Locale> = {
  zh: zhCN,
  "zh-CN": zhCN,
  "zh-TW": zhTW,
  en: enUS,
  "es-ES": es,
  fr,
  ru,
  de,
  pl,
  ko,
  fa: faIR,
  ja,
};
