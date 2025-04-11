import "./i18n";

import React, { useEffect, useState } from "react";
import FlipMove from "react-flip-move";
import { useTranslation } from "react-i18next";

import { ACCESS_TOKEN_KEY } from "./constants";
import { getAccessToken, getLoginUrl } from "./services";
import {
  isSupportsCSSVariables,
  isSupportsES2020,
} from "./utils/compatibility";
import logger from "./utils/logger";
import { parseSearchQuery, stringifySearchQuery } from "./utils/query";

export interface GitalkProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "id" | "title"> {
  /**
   * GitHub Application Client ID.
   */
  clientID: string;
  /**
   * GitHub Application Client Secret.
   */
  clientSecret: string;
  /**
   * GitHub repository owner.
   * Can be personal user or organization.
   */
  owner: string;
  /**
   * Name of Github repository.
   */
  repo: string;
  /**
   * GitHub repository owner and collaborators.
   * (Users who having write access to this repository)
   */
  admin: string[];
  /**
   * The unique id of the page.
   * Length must less than 50.
   *
   * @default location.href
   */
  id?: string;
  /**
   * The issue ID of the page.
   * If the number attribute is not defined, issue will be located using id.
   *
   * @default -1
   */
  number?: number;
  /**
   * GitHub issue labels.
   *
   * @default ['Gitalk']
   */
  labels?: string[];
  /**
   * GitHub issue title.
   *
   * @default document.title
   */
  title?: string;
  /**
   * GitHub issue body.
   *
   * @default location.href + header.meta[description]
   */
  body?: string;
  /**
   * Localization language key.
   * en, zh-CN and zh-TW are currently available.
   *
   * @default navigator.language
   */
  language?: string;
  /**
   * Pagination size, with maximum 100.
   *
   * @default 10
   */
  perPage?: number;
  /**
   * Comment sorting direction.
   * Available values are last and first.
   *
   * @default "last"
   */
  pagerDirection?: "last" | "first";
  /**
   * By default, Gitalk will create a corresponding github issue for your every single page automatically when the logined user is belong to the admin users.
   * You can create it manually by setting this option to true.
   *
   * @default false
   */
  createIssueManually?: boolean;
  /**
   * Enable hot key (cmd|ctrl + enter) submit comment.
   *
   * @default true
   */
  enableHotKey?: boolean;
  /**
   * Facebook-like distraction free mode.
   *
   * @default false
   */
  distractionFreeMode?: boolean;
  /**
   * Comment list animation.
   *
   * @default
   * ```ts
   * {
   *  staggerDelayBy: 150,
   *  appearAnimation: 'accordionVertical',
   *  enterAnimation: 'accordionVertical',
   *  leaveAnimation: 'accordionVertical',
   * }
   * ```
   * @link https://github.com/joshwcomeau/react-flip-move/blob/master/documentation/enter_leave_animations.md
   */
  flipMoveOptions?: FlipMove.FlipMoveProps;
  /**
   * GitHub oauth request reverse proxy for CORS.
   * [Why need this?](https://github.com/isaacs/github/issues/330)
   *
   * @default "https://cors-anywhere.azm.workers.dev/https://github.com/login/oauth/access_token"
   */
  proxy?: string;
}

const isModernBrowser = isSupportsCSSVariables() && isSupportsES2020();

const Gitalk: React.FC<GitalkProps> = (props) => {
  const {
    clientID,
    clientSecret,
    owner,
    repo,
    admin,
    id: issueId = location.href,
    number: issueNumber = -1,
    labels: issueLabels = ["Gitalk"],
    title: issueTitle = document.title,
    body: issueBody = location.href +
      document
        ?.querySelector('meta[name="description"]')
        ?.getAttribute("content") || "",
    language = navigator.language,
    perPage = 10,
    pagerDirection = "last",
    createIssueManually = false,
    enableHotKey = true,
    distractionFreeMode = false,
    flipMoveOptions = {
      staggerDelayBy: 150,
      appearAnimation: "accordionVertical",
      enterAnimation: "accordionVertical",
      leaveAnimation: "accordionVertical",
    },
    proxy = "https://cors-anywhere.azm.workers.dev/https://github.com/login/oauth/access_token",
    className = "",
    ...restProps
  } = props;

  const { t, i18n } = useTranslation();

  const [initialized, setInitialized] = useState<boolean>(false);
  const [accessToken, setAccessToken] = useState<string>(
    localStorage.getItem(ACCESS_TOKEN_KEY) ?? "",
  );
  const [currentPagerDirection, setCurrentPagerDirection] =
    useState<GitalkProps["pagerDirection"]>(pagerDirection);

  const onLogin = () => {
    const url = getLoginUrl(clientID);
    window.location.href = url;
  };

  useEffect(() => {
    i18n.changeLanguage(language);
  }, [i18n, language]);

  useEffect(() => {
    const query = parseSearchQuery();
    const code = query["code"];
    if (!accessToken && code) {
      delete query["code"];
      const replacedUrl = `${window.location.origin}${window.location.pathname}?${stringifySearchQuery(query)}${window.location.hash}`;
      history.replaceState(null, "", replacedUrl);

      const initAccessToken = async () => {
        const accessToken = await getAccessToken({
          url: proxy,
          code,
          clientID,
          clientSecret,
        });
        if (accessToken) {
          localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
          setAccessToken(accessToken);
        }
      };
      initAccessToken();
    }
  }, [accessToken, clientID, clientSecret, proxy]);

  if (!isModernBrowser) {
    logger.e(
      `Gitalk React can only be rendered in modern browser that supports CSS variables and ES2020.`,
      `Please consider using the original project to be compatible with older browsers: https://github.com/gitalk/gitalk`,
    );
    return null;
  }

  if (!(clientID && clientSecret)) {
    logger.e(
      `You must specify the \`clientId\` and \`clientSecret\` of Github APP`,
    );
    return null;
  }

  if (!(repo && owner)) {
    logger.e(`You must specify the \`owner\` and \`repo\` of Github`);
    return null;
  }

  if (!(Array.isArray(admin) && admin.length > 0)) {
    logger.e(`You must specify the \`admin\` for the Github repository`);
    return null;
  }

  return (
    <div className={`gt-container ${className}`} {...restProps}>
      {initialized ? <div /> : t("init")}
    </div>
  );
};

export default Gitalk;
