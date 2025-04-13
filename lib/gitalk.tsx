import "./i18n";

import { usePagination, useRequest } from "ahooks";
import React, { useEffect, useMemo, useRef, useState } from "react";
import FlipMove from "react-flip-move";
import { useTranslation } from "react-i18next";

import ArrowDown from "./assets/arrow-down.svg";
import Github from "./assets/github.svg";
import Tip from "./assets/tip.svg";
import Action from "./components/action";
import Avatar from "./components/avatar";
import Button from "./components/button";
import Comment from "./components/comment";
import Svg from "./components/svg";
import { ACCESS_TOKEN_KEY, VERSION } from "./constants";
import type { Comment as CommentType, Issue, User } from "./interfaces";
import {
  createIssue,
  createIssueComment,
  getAccessToken,
  getAuthorizeUrl,
  getIssueByNumber,
  getIssueComments,
  getIssues,
  getUser,
} from "./services";
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
    labels: issueBaseLabels = ["Gitalk"],
    title: issueTitle = document.title,
    body: issueBody = location.href +
      document
        ?.querySelector('meta[name="description"]')
        ?.getAttribute("content") || "",
    language = navigator.language,
    perPage: commentsPerPage = 10,
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

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { t, i18n } = useTranslation();

  const onLogin = () => {
    const url = getAuthorizeUrl(clientID);
    window.location.href = url;
  };

  useEffect(() => {
    i18n.changeLanguage(language);
  }, [i18n, language]);

  const {
    data: accessToken = localStorage.getItem(ACCESS_TOKEN_KEY) ?? undefined,
    mutate: setAccessToken,
    loading: getAccessTokenLoading,
    run: runGetAccessToken,
  } = useRequest(
    async (code: string) =>
      await getAccessToken({ url: proxy, code, clientID, clientSecret }),
    {
      manual: true,
      ready: !!proxy && !!clientID && !!clientSecret,
      onSuccess: (data) => {
        localStorage.setItem(ACCESS_TOKEN_KEY, data);
        logger.s(`Get access token successfully:`, data);
      },
      onError: (error) => {
        logger.e(`An error occurred while getting access token:`, error);
      },
    },
  );

  useEffect(() => {
    const query = parseSearchQuery();
    const code = query["code"];

    if (code && !accessToken) {
      delete query["code"];
      const replacedUrl = `${window.location.origin}${window.location.pathname}?${stringifySearchQuery(query)}${window.location.hash}`;
      history.replaceState(null, "", replacedUrl);

      runGetAccessToken(code);
    }
  }, [accessToken, runGetAccessToken]);

  const {
    data: user,
    mutate: setUser,
    loading: getUserLoading,
  } = useRequest(
    async () => {
      const getUserRes = await getUser(accessToken);
      if (getUserRes.status === 200) {
        const _user = getUserRes.data;
        logger.s(`Login successfully:`, _user);

        return _user;
      } else {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        setAccessToken("");
        logger.e(`Get user details with access token failed:`, getUserRes);

        return undefined;
      }
    },
    {
      ready: !!accessToken,
      refreshDeps: [accessToken],
    },
  );

  const isAdmin = useMemo(() => {
    return (
      user &&
      !!admin.find(
        (username) => username.toLowerCase() === user.login.toLocaleLowerCase(),
      )
    );
  }, [admin, user]);

  const issueLabels = useMemo(
    () => issueBaseLabels.concat([issueId]),
    [issueId, issueBaseLabels],
  );

  const { loading: createIssueLoading, runAsync: runCreateIssue } = useRequest(
    async () => {
      logger.i(`Creating issue...`);

      const createIssueRes = await createIssue({
        owner,
        repo,
        title: issueTitle,
        labels: issueLabels,
        body: issueBody,
      });

      if (createIssueRes.status === 201) {
        const _issue = createIssueRes.data;
        logger.s(`Create issue successfully:`, _issue);
        return _issue;
      } else {
        logger.e(`Create issue failed:`, createIssueRes);
        return undefined;
      }
    },
    {
      manual: true,
      ready: !!isAdmin && !!owner && !!repo && !!issueTitle,
    },
  );

  const {
    data: issue,
    mutate: setIssue,
    loading: getIssueLoading,
  } = useRequest(
    async () => {
      if (issueNumber) {
        const getIssueRes = await getIssueByNumber({
          owner,
          repo,
          issue_number: issueNumber,
        });

        if (getIssueRes.status === 200) {
          const _issue = getIssueRes.data;
          logger.s(
            `Locate issue ${issueNumber} in repository ${owner}/${repo} successfully:`,
            _issue,
          );
          return _issue;
        } else if (getIssueRes.status === 404) {
          logger.w(
            `Issue ${issueNumber} in repository ${owner}/${repo} was not found.`,
          );

          if (isAdmin && !createIssueManually) {
            const _issue = await runCreateIssue();
            return _issue;
          }
        } else {
          logger.e(
            `Get issue ${issueNumber} in repository ${owner}/${repo} failed:`,
            getIssueRes,
          );
        }
      } else if (issueId) {
        const getIssuesRes = await getIssues({
          owner,
          repo,
          labels: issueLabels.join(","),
          per_page: 1,
        });
        const { status: getIssuesStatus, data: issues = [] } = getIssuesRes;

        if (getIssuesStatus === 200) {
          if (issues.length) {
            const _issue = issues[0];
            logger.s(
              `Locate issue with labels ${issueLabels} in repository ${owner}/${repo} successfully:`,
              _issue,
            );
            return _issue;
          } else {
            logger.w(
              `Issue with labels ${issueLabels} in repository ${owner}/${repo} was not found.`,
            );

            if (isAdmin && !createIssueManually) {
              const _issue = await runCreateIssue();
              return _issue;
            }
          }
        } else if (getIssuesStatus === 404) {
          logger.w(
            `Issue with labels ${issueLabels} in repository ${owner}/${repo} was not found.`,
          );

          if (isAdmin && !createIssueManually) {
            const _issue = await runCreateIssue();
            return _issue;
          }
        } else {
          logger.e(
            `Get issue with labels ${issueLabels} in repository ${owner}/${repo} failed:`,
            getIssuesRes,
          );
        }
      }

      return undefined;
    },
    {
      ready: !!owner && !!repo && (!!issueNumber || !!issueId),
      refreshDeps: [
        owner,
        repo,
        issueNumber,
        issueId,
        issueLabels,
        createIssueManually,
      ],
    },
  );

  const {
    data: comments,
    mutate: setComments,
    pagination: commentsPagination,
    loading: getCommentsLoading,
  } = usePagination(
    async ({ current, pageSize }) => {
      const { number: issueNumber, comments: commentsCount } = issue as Issue;
      const from = (current - 1) * pageSize + 1;
      const to = current * pageSize;

      const getIssueCommentsRes = await getIssueComments({
        owner,
        repo,
        issue_number: issueNumber,
        page: current,
        per_page: pageSize,
      });

      if (getIssueCommentsRes.status === 200) {
        const _comments = getIssueCommentsRes.data;
        logger.s(`Get comments from ${from} to ${to} successfully:`, _comments);
        return { total: commentsCount, list: _comments };
      } else {
        logger.e(
          `Get comments from ${from} to ${to} failed:`,
          getIssueCommentsRes,
        );
        return { total: commentsCount, list: [] };
      }
    },
    {
      defaultPageSize: commentsPerPage,
      defaultCurrent: 1,
      ready: !!issue && !!owner && !!repo,
      refreshDeps: [issue?.number],
    },
  );

  const commentsLoaded = useMemo(
    () => comments && comments.list.length === comments.total,
    [comments],
  );

  const {
    data: localComments = [],
    mutate: setLocalComments,
    loading: createIssueCommentLoading,
    run: runCreateIssueComment,
  } = useRequest<CommentType[], [string]>(
    async (body): Promise<CommentType[]> => {
      const { number: issueNumber } = issue as Issue;

      const createIssueCommentRes = await createIssueComment({
        owner,
        repo,
        issue_number: issueNumber,
        body,
      });

      if (createIssueCommentRes.status === 201) {
        const createdIssueComment = createIssueCommentRes.data;
        logger.s(`Create issue comment successfully.`);
        return localComments.concat([createdIssueComment]);
      } else {
        logger.e(`Create issue comment failed:`, createIssueCommentRes);
        return localComments;
      }
    },
    {
      manual: true,
      ready: !!owner && !!repo && !!issue,
    },
  );

  const initialized = useMemo(
    () =>
      !getAccessTokenLoading &&
      !getUserLoading &&
      !createIssueLoading &&
      !getIssueLoading,
    [
      createIssueLoading,
      getAccessTokenLoading,
      getIssueLoading,
      getUserLoading,
    ],
  );

  const issueCreated = useMemo(
    () => initialized && !!issue,
    [initialized, issue],
  );

  if (!isModernBrowser) {
    logger.w(
      `Gitalk React can only be rendered well in modern browser that supports CSS variables and ES2020.`,
      `Please consider using the original project to be compatible with older browsers: https://github.com/gitalk/gitalk`,
    );
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

  const renderInitializing = () => {
    return (
      <div className="gt-initing">
        <i className="gt-loader" />
        <p className="gt-initing-text">{t("init")}</p>
      </div>
    );
  };

  const renderIssueNotInitialized = () => {
    return (
      <div className="gt-no-init" key="no-init">
        <p
          dangerouslySetInnerHTML={{
            __html: t("no-found-related", {
              link: `<a href="https://github.com/${owner}/${repo}/issues">Issues</a>`,
            }),
          }}
        />
        <p>
          {t("please-contact", {
            user: admin.map((u) => `@${u}`).join(" "),
          })}
        </p>
        {isAdmin ? (
          <p>
            <Button
              onClick={runCreateIssue}
              isLoading={createIssueLoading}
              text={t("init-issue")}
            />
          </p>
        ) : null}
        {!user && (
          <Button
            className="gt-btn-login"
            onClick={onLogin}
            text={t("login-with-github")}
          />
        )}
      </div>
    );
  };

  const renderHeader = () => {
    return (
      <div className="gt-header" key="header">
        {user ? (
          <Avatar
            className="gt-header-avatar"
            src={user.avatar_url}
            alt={user.login}
          />
        ) : (
          <a className="gt-avatar-github" onClick={onLogin}>
            <Svg className="gt-ico-github" icon={Github} />
          </a>
        )}
        <div className="gt-header-comment">
          <textarea
            ref={textareaRef}
            className={`gt-header-textarea ${previewInput ? "hide" : ""}`}
            value={comment}
            onChange={handleCommentChange}
            onFocus={handleCommentFocus}
            onBlur={handleCommentBlur}
            onKeyDown={handleCommentKeyDown}
            placeholder={t("leave-a-comment")}
          />
          <div
            className={`gt-header-preview markdown-body ${previewInput ? "" : "hide"}`}
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
          <div className="gt-header-controls">
            <a
              className="gt-header-controls-tip"
              href="https://guides.github.com/features/mastering-markdown/"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Svg
                className="gt-ico-tip"
                icon={Tip}
                text={t("support-markdown")}
              />
            </a>
            {user && (
              <Button
                className="gt-btn-public"
                onClick={handleCommentCreate}
                text={t("comment")}
                isLoading={createIssueLoading}
              />
            )}

            <Button
              className="gt-btn-preview"
              onClick={handleCommentPreview}
              text={previewInput ? t("edit") : t("preview")}
              // isLoading={isPreviewing}
            />
            {!user && (
              <Button
                className="gt-btn-login"
                onClick={onLogin}
                text={t("login-with-github")}
              />
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderCommentList = () => {
    const totalComments = (comments?.list ?? []).concat([]);
    if (pagerDirection === "last" && !!user) {
      totalComments.reverse();
    }
    return (
      <div className="gt-comments" key="comments">
        <FlipMove {...flipMoveOptions}>
          {totalComments.map((c) => (
            <Comment
              comment={c}
              key={c.id}
              user={user}
              language={language}
              commentedText={t("commented")}
              admin={admin}
              replyCallback={reply(c)}
              likeCallback={
                c.reactions && c.reactions.viewerHasReacted
                  ? unLike.bind(this, c)
                  : like.bind(this, c)
              }
            />
          ))}
        </FlipMove>
        {!totalComments.length && (
          <p className="gt-comments-null">{t("first-comment-person")}</p>
        )}
        {!commentsLoaded && totalComments.length ? (
          <div className="gt-comments-controls">
            <Button
              className="gt-btn-loadmore"
              onClick={handleCommentLoad}
              isLoading={loadingComments}
              text={t("load-more")}
            />
          </div>
        ) : null}
      </div>
    );
  };

  const renderMeta = () => {
    const cnt = (issue && issue.comments) + localComments.length;
    const isDesc = pagerDirection === "last";
    if (
      updateCountCallback &&
      {}.toString.call(updateCountCallback) === "[object Function]"
    ) {
      try {
        updateCountCallback(cnt);
      } catch (error) {
        logger.e(
          "An error occurred while executing the updateCountCallback:",
          error,
        );
      }
    }

    return (
      <div className="gt-meta" key="meta">
        <span
          className="gt-counts"
          dangerouslySetInnerHTML={{
            __html: t("counts", {
              counts: `<a class="gt-link gt-link-counts" href="${issue && issue.html_url}" target="_blank" rel="noopener noreferrer">${cnt}</a>`,
              smart_count: cnt,
            }),
          }}
        />
        {popupVisible && (
          <div className="gt-popup">
            {user ? (
              <Action
                className={`gt-action-sortasc${!isDesc ? " is--active" : ""}`}
                onClick={handleSort("first")}
                text={t("sort-asc")}
              />
            ) : null}
            {user ? (
              <Action
                className={`gt-action-sortdesc${isDesc ? " is--active" : ""}`}
                onClick={handleSort("last")}
                text={t("sort-desc")}
              />
            ) : null}
            {user ? (
              <Action
                className="gt-action-logout"
                onClick={handleLogout}
                text={t("logout")}
              />
            ) : (
              <a className="gt-action gt-action-login" onClick={handleLogin}>
                {t("login-with-github")}
              </a>
            )}
            <div className="gt-copyright">
              <a
                className="gt-link gt-link-project"
                href="https://github.com/gitalk/gitalk"
                target="_blank"
                rel="noopener noreferrer"
              >
                Gitalk
              </a>
              <span className="gt-version">{VERSION}</span>
            </div>
          </div>
        )}
        <div className="gt-user">
          {user ? (
            <div
              className={
                popupVisible ? "gt-user-inner is--poping" : "gt-user-inner"
              }
              onClick={handlePopup}
            >
              <span className="gt-user-name">{user.login}</span>
              <Svg className="gt-ico-arrdown" icon={ArrowDown} />
            </div>
          ) : (
            <div
              className={
                popupVisible ? "gt-user-inner is--poping" : "gt-user-inner"
              }
              onClick={handlePopup}
            >
              <span className="gt-user-name">{t("anonymous")}</span>
              <Svg className="gt-ico-arrdown" icon={ArrowDown} />
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      className={`gt-container ${inputFocused ? "gt-input-focused" : ""} ${className}`}
      {...restProps}
    >
      {alertMessage && <div className="gt-error">{alertMessage}</div>}
      {initialized
        ? issueCreated
          ? [renderMeta(), renderHeader(), renderCommentList()]
          : renderIssueNotInitialized()
        : renderInitializing()}
    </div>
  );
};

export default Gitalk;
