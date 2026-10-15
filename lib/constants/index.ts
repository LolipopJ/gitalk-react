import packageJson from "../../package.json";
import { type Lang } from "../i18n";
import type { GitalkProps } from "../interfaces";

export const VERSION = packageJson.version;
export const HOMEPAGE = packageJson.homepage;

export const DEFAULT_LANG: Lang = "en";
export const DEFAULT_LABELS = ["Gitalk"];
export const DEFAULT_PROXY =
  "https://cors-anywhere.azm.workers.dev/https://github.com/login/oauth/access_token";
export const DEFAULT_AVATAR =
  "https://cdn.jsdelivr.net/npm/gitalk@1/src/assets/icon/github.svg";
export const DEFAULT_USER: GitalkProps["defaultUser"] = {
  avatar_url: "//avatars1.githubusercontent.com/u/29697133?s=50",
  login: "null",
  html_url: "",
};

export const ACCESS_TOKEN_KEY = "GT_ACCESS_TOKEN";
export const STORED_COMMENTS_KEY = "GT_COMMENT";
