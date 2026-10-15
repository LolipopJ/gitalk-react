import type Polyglot from "node-polyglot";
import { createContext } from "react";

import { DEFAULT_LANG } from "../constants";
import i18n from "../i18n";

export interface I18nContextValue {
  polyglot: Polyglot;
  relativeTimeFormat: Intl.RelativeTimeFormat;
}

export const I18nContext = createContext<I18nContextValue>({
  polyglot: i18n(DEFAULT_LANG),
  relativeTimeFormat: new Intl.RelativeTimeFormat(DEFAULT_LANG, {
    numeric: "auto",
  }),
});

export default I18nContext;
