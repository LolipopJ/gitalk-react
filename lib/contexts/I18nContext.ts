import { type Locale } from "date-fns";
import type Polyglot from "node-polyglot";
import { createContext } from "react";

import { DATE_FNS_LOCALE_MAP, DEFAULT_LANG } from "../constants";
import i18n, { type Lang } from "../i18n";

export interface I18nContextValue {
  language: Lang;
  polyglot: Polyglot;
  dateFnsLocaleMap: Record<string, Locale>;
}

export const I18nContext = createContext<I18nContextValue>({
  language: DEFAULT_LANG,
  polyglot: i18n(DEFAULT_LANG),
  dateFnsLocaleMap: DATE_FNS_LOCALE_MAP,
});

export default I18nContext;
