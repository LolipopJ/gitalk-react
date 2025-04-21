import "./i18n";

import { useRequest } from "ahooks";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import Button from "./components/button";
import { type CommentProps } from "./components/comment";
import CommentTextarea from "./components/comment-textarea";
import CommentsList from "./components/comments-list";
import Meta from "./components/meta";
import {
  ACCESS_TOKEN_KEY,
  DATE_FNS_LOCALE_MAP,
  DEFAULT_FLIP_MOVE_OPTIONS,
  DEFAULT_LABELS,
  DEFAULT_PROXY,
  DEFAULT_USER,
} from "./constants";
import I18nContext, { type I18nContextValue } from "./contexts/I18nContext";
import i18n, { type Lang } from "./i18n";
import type {
  Comment as CommentType,
  GitalkProps,
  Issue as IssueType,
  User as UserType,
} from "./interfaces";
import {
  getIssueCommentsQL,
  type IssueCommentsQLResponse,
} from "./services/graphql/comment";
import getOctokitInstance from "./services/request";
import { getAccessToken, getAuthorizeUrl } from "./services/user";
import { supportsCSSVariables, supportsES2020 } from "./utils/compatibility";
import logger from "./utils/logger";
import { parseSearchQuery, stringifySearchQuery } from "./utils/query";

const isModernBrowser = supportsCSSVariables() && supportsES2020();

const Gitalk: React.FC<GitalkProps> = (props) => {
  const {
    clientID,
    clientSecret,
    owner,
    repo,
    admin,
    id: propsIssueId = location.host + location.pathname,
    number: propsIssueNumber,
    labels: propsIssueLabels = DEFAULT_LABELS,
    title: issueTitle = document.title,
    body: issueBody = location.href +
      "\n\n" +
      (document
        ?.querySelector('meta[name="description"]')
        ?.getAttribute("content") ?? ""),
    language = navigator.language as Lang,
    perPage: propsPerPage = 10,
    pagerDirection = "last",
    createIssueManually = false,
    enableHotKey = true,
    distractionFreeMode = false,
    flipMoveOptions = DEFAULT_FLIP_MOVE_OPTIONS,
    proxy = DEFAULT_PROXY,
    defaultUser: propsDefaultUser,
    defaultAuthor: propsDefaultAuthor,
    collapsedHeight: propsCollapsedHeight,
    updateCountCallback,
    onCreateIssue,
    onCreateComment,
    className = "",
    ...restProps
  } = props;

  const [issue, setIssue] = useState<IssueType>();
  const issueNumber = useMemo(
    () =>
      propsIssueNumber && propsIssueNumber > 0 ? propsIssueNumber : undefined,
    [propsIssueNumber],
  );
  const issueId = useMemo(() => propsIssueId.slice(0, 50), [propsIssueId]);
  const issueLabels = useMemo(
    () => propsIssueLabels.concat([issueId]),
    [propsIssueLabels, issueId],
  );

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [inputComment, setInputComment] = useState<string>("");
  const [isInputFocused, setIsInputFocused] = useState<boolean>(false);

  const [commentsCount, setCommentsCount] = useState<number>(0);
  const [commentsCursor, setCommentsCursor] = useState("");
  const [commentsPage, setCommentsPage] = useState<number>(1);
  const commentsPerPage = useMemo(
    () => (propsPerPage > 100 ? 100 : propsPerPage < 0 ? 10 : propsPerPage),
    [propsPerPage],
  );
  /** Current sort order, have effect when user is logged */
  const [commentsPagerDirection, setCommentsPagerDirection] =
    useState(pagerDirection);
  const defaultUser = useMemo(
    () =>
      propsDefaultUser
        ? propsDefaultUser
        : propsDefaultAuthor
          ? {
              avatar_url: propsDefaultAuthor.avatarUrl,
              login: propsDefaultAuthor.login,
              html_url: propsDefaultAuthor.url,
            }
          : DEFAULT_USER,
    [propsDefaultAuthor, propsDefaultUser],
  );
  const collapsedHeight =
    propsCollapsedHeight && propsCollapsedHeight > 0
      ? propsCollapsedHeight
      : undefined;

  const [alert, setAlert] = useState<string>("");

  const polyglot = useMemo(() => i18n(language), [language]);
  const i18nContextValue: I18nContextValue = useMemo(
    () => ({
      language,
      polyglot,
      dateFnsLocaleMap: DATE_FNS_LOCALE_MAP,
    }),
    [language, polyglot],
  );

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
        setAlert(`An error occurred while getting access token: ${error}`);
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

  const octokit = useMemo(() => getOctokitInstance(accessToken), [accessToken]);

  const {
    data: user,
    mutate: setUser,
    loading: getUserLoading,
  } = useRequest(
    async () => {
      const getUserRes = await octokit.request("GET /user");
      if (getUserRes.status === 200) {
        const _user = getUserRes.data;
        logger.s(`Login successfully:`, _user);
        return _user;
      } else {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        setAccessToken(undefined);
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

  const { loading: createIssueLoading, run: runCreateIssue } = useRequest(
    async () => {
      logger.i(`Creating issue...`);

      const createIssueRes = await octokit.request(
        "POST /repos/{owner}/{repo}/issues",
        {
          owner,
          repo,
          title: issueTitle,
          labels: issueLabels,
          body: issueBody,
        },
      );

      if (createIssueRes.status === 201) {
        const _issue = createIssueRes.data;
        logger.s(`Create issue successfully:`, _issue);

        onCreateIssue?.(_issue);

        setIssue(_issue);
      } else {
        setAlert(`Create issue failed: ${createIssueRes}`);
        logger.e(`Create issue failed:`, createIssueRes);
      }
    },
    {
      manual: true,
      ready:
        !!isAdmin && !!owner && !!repo && !!issueTitle && !!issueLabels.length,
    },
  );

  const { loading: getIssueLoading } = useRequest(
    async () => {
      if (issueNumber) {
        const getIssueRes = await octokit.request(
          "GET /repos/{owner}/{repo}/issues/{issue_number}",
          {
            owner,
            repo,
            issue_number: issueNumber,
          },
        );

        if (getIssueRes.status === 200) {
          const _issue = getIssueRes.data;
          logger.s(
            `Locate issue ${issueNumber} in repository ${owner}/${repo} successfully:`,
            _issue,
          );
          setIssue(_issue);
        } else if (getIssueRes.status === 404) {
          logger.w(
            `Issue ${issueNumber} in repository ${owner}/${repo} was not found.`,
          );

          if (isAdmin && !createIssueManually) {
            runCreateIssue();
          }
        } else {
          setAlert(
            `Get issue ${issueNumber} in repository ${owner}/${repo} failed: ${getIssueRes}`,
          );
          logger.e(
            `Get issue ${issueNumber} in repository ${owner}/${repo} failed:`,
            getIssueRes,
          );
        }
      } else if (issueId) {
        const getIssuesRes = await octokit.request(
          "GET /repos/{owner}/{repo}/issues",
          {
            owner,
            repo,
            labels: issueLabels.join(","),
            per_page: 1,
          },
        );
        const { status: getIssuesStatus, data: issues = [] } = getIssuesRes;

        if (getIssuesStatus === 200) {
          if (issues.length) {
            const _issue = issues[0];
            logger.s(
              `Locate issue with labels ${issueLabels} in repository ${owner}/${repo} successfully:`,
              _issue,
            );
            setIssue(_issue);
          } else {
            logger.w(
              `Issue with labels ${issueLabels} in repository ${owner}/${repo} was not found.`,
            );

            if (isAdmin && !createIssueManually) {
              runCreateIssue();
            }
          }
        } else if (getIssuesStatus === 404) {
          logger.w(
            `Issue with labels ${issueLabels} in repository ${owner}/${repo} was not found.`,
          );

          if (isAdmin && !createIssueManually) {
            runCreateIssue();
          }
        } else {
          setAlert(
            `Get issue with labels ${issueLabels} in repository ${owner}/${repo} failed: ${getIssuesRes}`,
          );
          logger.e(
            `Get issue with labels ${issueLabels} in repository ${owner}/${repo} failed:`,
            getIssuesRes,
          );
        }
      }
    },
    {
      ready: !!owner && !!repo && (!!issueNumber || !!issueId),
      refreshDeps: [owner, repo, issueNumber, issueId],
      onBefore: () => {
        setIssue(undefined);
      },
    },
  );

  const {
    data: comments = [],
    mutate: setComments,
    run: runGetComments,
    loading: getCommentsLoading,
  } = useRequest(
    async (): Promise<CommentType[]> => {
      const { number: currentIssueNumber } = issue as IssueType;
      const from = (commentsPage - 1) * commentsPerPage + 1;
      const to = commentsPage * commentsPerPage;

      if (user) {
        // Get comments via GraphQL, witch requires being logged and able to sort
        const query = getIssueCommentsQL({
          pagerDirection: commentsPagerDirection,
        });

        const getIssueCommentsRes: IssueCommentsQLResponse =
          await octokit.graphql(query, {
            owner,
            repo,
            id: currentIssueNumber,
            pageSize: commentsPerPage,
            ...(commentsCursor ? { cursor: commentsCursor } : {}),
          });

        if (getIssueCommentsRes.repository) {
          const _comments =
            getIssueCommentsRes.repository.issue.comments.nodes.map(
              (comment) => {
                return {
                  ...comment,
                  id: comment.databaseId,
                  user: {
                    ...defaultUser,
                    avatar_url: comment.author.avatarUrl,
                    login: comment.author.login,
                    html_url: comment.author.url,
                  },
                  body_html: comment.bodyHTML,
                  created_at: comment.createdAt,
                  html_url: comment.resourcePath,
                  reactions: {
                    heart: comment.reactions?.totalCount ?? 0,
                  },
                  reactionsHeart: comment.reactions,
                } as CommentType;
              },
            );
          logger.s(
            `Get comments from ${from} to ${to} successfully:`,
            _comments,
          );

          const commentsPageInfo =
            getIssueCommentsRes.repository.issue.comments.pageInfo;
          const commentsPageCursor =
            commentsPageInfo.startCursor || commentsPageInfo.endCursor || "";
          setCommentsCursor(commentsPageCursor);

          if (commentsPagerDirection === "last")
            return [..._comments, ...comments];
          else return [...comments, ..._comments];
        } else {
          setAlert(
            `Get comments from ${from} to ${to} failed: ${getIssueCommentsRes}`,
          );
          logger.e(
            `Get comments from ${from} to ${to} failed:`,
            getIssueCommentsRes,
          );
        }
      } else {
        // Get comments via RESTful API, which not need be logged but unable to sort
        const getIssueCommentsRes = await octokit.request(
          "GET /repos/{owner}/{repo}/issues/{issue_number}/comments",
          {
            owner,
            repo,
            issue_number: currentIssueNumber,
            page: commentsPage,
            per_page: commentsPerPage,
            headers: {
              accept: "application/vnd.github.v3.full+json",
            },
          },
        );

        if (getIssueCommentsRes.status === 200) {
          const _comments = getIssueCommentsRes.data.map((comment) => {
            const reactionsHeartTotalCount = comment.reactions?.heart ?? 0;
            return {
              ...defaultUser,
              ...comment,
              reactionsHeart: {
                totalCount: reactionsHeartTotalCount,
                viewerHasReacted: false,
                nodes: [],
              },
            } as CommentType;
          });
          logger.s(
            `Get comments from ${from} to ${to} successfully:`,
            _comments,
          );

          setCommentsPage((prev) => prev + 1);

          return [...comments, ..._comments];
        } else {
          setAlert(
            `Get comments from ${from} to ${to} failed: ${getIssueCommentsRes}`,
          );
          logger.e(
            `Get comments from ${from} to ${to} failed:`,
            getIssueCommentsRes,
          );
        }
      }

      return comments;
    },
    {
      manual: true,
      ready: !!owner && !!repo && !!issue && !getUserLoading,
    },
  );

  const {
    data: localComments = [],
    mutate: setLocalComments,
    loading: createIssueCommentLoading,
    runAsync: runCreateIssueComment,
  } = useRequest(
    async (): Promise<CommentType[]> => {
      const { number: currentIssueNumber } = issue as IssueType;

      const createIssueCommentRes = await octokit.request(
        "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
        {
          owner,
          repo,
          issue_number: currentIssueNumber,
          body: inputComment,
          headers: {
            accept: "application/vnd.github.v3.full+json",
          },
        },
      );

      if (createIssueCommentRes.status === 201) {
        const createdIssueComment = {
          ...defaultUser,
          ...createIssueCommentRes.data,
          reactions: { heart: 0 },
          reactionsHeart: {
            totalCount: 0,
            viewerHasReacted: false,
            nodes: [],
          },
        } as CommentType;
        logger.s(`Create issue comment successfully.`);

        setInputComment("");
        setCommentsCount((prev) => prev + 1);

        onCreateComment?.(createdIssueComment);

        return localComments.concat([createdIssueComment]);
      } else {
        setAlert(`Create issue comment failed: ${createIssueCommentRes}`);
        logger.e(`Create issue comment failed:`, createIssueCommentRes);
        return localComments;
      }
    },
    {
      manual: true,
      ready: !!owner && !!repo && !!issue && !!inputComment,
    },
  );

  useEffect(() => {
    setComments([]);
    setCommentsCount(issue?.comments ?? 0);
    setCommentsCursor("");
    setCommentsPage(1);
    setLocalComments([]);

    setTimeout(() => {
      runGetComments();
    });
  }, [issue, runGetComments, setComments, setLocalComments]);

  useEffect(() => {
    setComments([]);
    setCommentsCursor("");
    setCommentsPage(1);

    setTimeout(() => {
      runGetComments();
    });
  }, [user, commentsPagerDirection, setComments, runGetComments]);

  /** sorted all comments */
  const loadedComments = useMemo(() => {
    const _loadedComments: CommentType[] = [];

    // filter duplicate comments if exist
    const commentIdsSet = new Set();
    for (const comment of comments.concat(localComments)) {
      if (!commentIdsSet.has(comment.id)) {
        commentIdsSet.add(comment.id);
        _loadedComments.push(comment);
      }
    }

    if (!!user && commentsPagerDirection === "last") {
      // sort comments by date DESC
      _loadedComments.reverse();
    }

    return _loadedComments;
  }, [comments, commentsPagerDirection, localComments, user]);

  useEffect(() => {
    updateCountCallback?.(commentsCount);
  }, [commentsCount, updateCountCallback]);

  const { loading: likeOrDislikeCommentLoading, run: runLikeOrDislikeComment } =
    useRequest(
      async (like: boolean, commentId: number, reactionId?: number) => {
        const deletedReactionId = reactionId;
        let createdReactionId: number = -1;
        if (like) {
          const likeCommentRes = await octokit.request(
            "POST /repos/{owner}/{repo}/issues/comments/{comment_id}/reactions",
            {
              owner,
              repo,
              comment_id: commentId,
              content: "heart",
            },
          );

          if (likeCommentRes.status === 201) {
            logger.s(`You like the comment!`);
            createdReactionId = likeCommentRes.data.id;
          } else if (likeCommentRes.status === 200) {
            logger.i(`You already liked the comment!`);
          } else {
            logger.e(`Failed to like the comment.`);
            return;
          }
        } else {
          if (reactionId) {
            const dislikeCommentRes = await octokit.request(
              "DELETE /repos/{owner}/{repo}/issues/comments/{comment_id}/reactions/{reaction_id}",
              {
                owner,
                repo,
                comment_id: commentId,
                reaction_id: reactionId,
              },
            );

            if (dislikeCommentRes.status === 204) {
              logger.s(`You unlike the comment.`);
            } else {
              logger.e(`Failed to unlike the comment.`);
              return;
            }
          } else {
            logger.e("Reaction ID is not provided.");
            return;
          }
        }

        let isLocalComment = false;
        let targetComment = comments.find(
          (comment) => comment.id === commentId,
        );
        if (!targetComment) {
          targetComment = localComments.find(
            (comment) => comment.id === commentId,
          );
          isLocalComment = true;
        }
        if (targetComment) {
          const username = (user as UserType).login;

          const prevHeartCount = targetComment.reactions?.heart ?? 0;
          const newHeartCount = like ? prevHeartCount + 1 : prevHeartCount - 1;

          const prevHeartNodes = targetComment.reactionsHeart?.nodes ?? [];
          const newHeartNodes = like
            ? prevHeartNodes.concat([
                {
                  databaseId: createdReactionId,
                  user: {
                    login: username,
                  },
                },
              ])
            : prevHeartNodes.filter(
                (node) => node.databaseId !== deletedReactionId,
              );

          targetComment.reactions = {
            heart: newHeartCount,
          };
          targetComment.reactionsHeart = {
            totalCount: newHeartCount,
            viewerHasReacted: like,
            nodes: newHeartNodes,
          };
        }
        if (isLocalComment) {
          setLocalComments((prev) => [...(prev ?? [])]);
        } else {
          setComments((prev) => [...(prev ?? [])]);
        }
      },
      {
        manual: true,
        ready: !!owner && !!repo && !!user,
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

  const onLogin = () => {
    const url = getAuthorizeUrl(clientID);
    window.location.href = url;
  };

  const onLogout = () => {
    setAccessToken(undefined);
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    setUser(undefined);
  };

  const onCommentInputFocus: React.FocusEventHandler<HTMLTextAreaElement> = (
    e,
  ) => {
    if (!distractionFreeMode) return e.preventDefault();
    setIsInputFocused(true);
  };

  const onCommentInputBlur: React.FocusEventHandler<HTMLTextAreaElement> = (
    e,
  ) => {
    if (!distractionFreeMode) return e.preventDefault();
    setIsInputFocused(false);
  };

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight + 2}px`;
    }
  }, [inputComment]);

  const onCommentInputKeyDown: React.KeyboardEventHandler<
    HTMLTextAreaElement
  > = (e) => {
    if (enableHotKey && (e.metaKey || e.ctrlKey) && e.keyCode === 13) {
      runCreateIssueComment();
    }
  };

  const onReplyComment: CommentProps["onReply"] = useCallback(
    (repliedComment) => {
      const { body: repliedCommentBody = "", user: repliedCommentUser } =
        repliedComment;
      let repliedCommentBodyArray = repliedCommentBody.split("\n");
      const repliedCommentUsername = repliedCommentUser?.login;

      if (repliedCommentUsername) {
        repliedCommentBodyArray.unshift(`@${repliedCommentUsername}`);
      }
      repliedCommentBodyArray = repliedCommentBodyArray.map(
        (text) => `> ${text}`,
      );

      setInputComment((prevComment) => {
        if (prevComment) {
          repliedCommentBodyArray.unshift("", "");
        }
        repliedCommentBodyArray.push("", "");
        const newComment = `${prevComment}${repliedCommentBodyArray.join("\n")}`;
        return newComment;
      });

      setTimeout(() => {
        textareaRef.current?.focus();
      });
    },
    [],
  );

  if (!isModernBrowser) {
    logger.e(
      `Gitalk React can only be rendered well in modern browser that supports CSS variables and ES2020.`,
      `If you have compatibility requirements, please consider using the original project which is compatible with older browsers: https://github.com/gitalk/gitalk`,
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
    <I18nContext.Provider value={i18nContextValue}>
      <div
        className={`gt-container${isInputFocused ? " gt-input-focused" : ""} ${className}`}
        {...restProps}
      >
        {/* Alert */}
        {alert && <div className="gt-error">{alert}</div>}

        {initialized ? (
          issueCreated ? (
            <>
              {/* Meta */}
              <Meta
                issue={issue}
                user={user}
                commentsCount={commentsCount}
                pagerDirection={commentsPagerDirection}
                onPagerDirectionChange={setCommentsPagerDirection}
                onLogin={onLogin}
                onLogout={onLogout}
              />

              {/* Comment textarea */}
              <CommentTextarea
                value={inputComment}
                onChange={(e) => setInputComment(e.target.value)}
                onFocus={onCommentInputFocus}
                onBlur={onCommentInputBlur}
                onKeyDown={onCommentInputKeyDown}
                placeholder={polyglot.t("leave-a-comment")}
                octokit={octokit}
                user={user}
                onLogin={onLogin}
                onCreateComment={async () => {
                  await runCreateIssueComment();
                }}
                createCommentLoading={createIssueCommentLoading}
                onPreviewError={(e) => {
                  setAlert(`Preview rendered comment failed: ${e}`);
                  logger.e(`Preview rendered comment failed:`, e);
                }}
              />

              {/* Comments */}
              <CommentsList
                comments={loadedComments}
                commentsCount={commentsCount}
                onGetComments={runGetComments}
                getCommentsLoading={getCommentsLoading}
                flipMoveOptions={flipMoveOptions}
                user={user}
                admin={admin}
                onReply={onReplyComment}
                onLike={runLikeOrDislikeComment}
                likeLoading={likeOrDislikeCommentLoading}
                collapsedHeight={collapsedHeight}
              />
            </>
          ) : (
            // Issue not created placeholder
            <div className="gt-no-init" key="no-init">
              <p
                dangerouslySetInnerHTML={{
                  __html: polyglot.t("no-found-related", {
                    link: `<a href="https://github.com/${owner}/${repo}/issues" target="_blank" rel="noopener noreferrer">Issues</a>`,
                  }),
                }}
              />
              <p>
                {polyglot.t("please-contact", {
                  user: admin.map((u) => `@${u}`).join(" "),
                })}
              </p>
              {isAdmin ? (
                <p>
                  <Button
                    onClick={runCreateIssue}
                    isLoading={createIssueLoading}
                    text={polyglot.t("init-issue")}
                  />
                </p>
              ) : null}
              {!user && (
                <Button
                  className="gt-btn-login"
                  onClick={onLogin}
                  text={polyglot.t("login-with-github")}
                />
              )}
            </div>
          )
        ) : (
          // Loading issue placeholder
          <div className="gt-initing">
            <i className="gt-loader" />
            <p className="gt-initing-text">{polyglot.t("init")}</p>
          </div>
        )}
      </div>
    </I18nContext.Provider>
  );
};

export type { GitalkProps };

export default Gitalk;
