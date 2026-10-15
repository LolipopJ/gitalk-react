import "./i18n";

import { useMemoizedFn, useRequest } from "ahooks";
import cn from "classnames";
import { RequestError } from "octokit";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import Button from "./components/button";
import { type CommentProps } from "./components/comment";
import CommentTextarea from "./components/comment-textarea";
import CommentsList from "./components/comments-list";
import Meta from "./components/meta";
import { ACCESS_TOKEN_KEY, DEFAULT_LABELS, DEFAULT_USER } from "./constants";
import I18nContext, { type I18nContextValue } from "./contexts/I18nContext";
import i18n from "./i18n";
import type {
  Comment as CommentType,
  GitalkProps,
  Issue as IssueType,
} from "./interfaces";
import {
  getCommentReactionMutationQL,
  getIssueCommentsQL,
  type IssueCommentsQLResponse,
} from "./services/graphql/comment";
import getOctokitInstance from "./services/request";
import {
  consumeOAuthCallback,
  getAccessToken,
  getAuthorizeUrl,
} from "./services/user";
import { supportsCSSVariables, supportsES2020 } from "./utils/compatibility";
import logger from "./utils/logger";

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
    language = navigator.language,
    perPage: propsPerPage = 10,
    pagerDirection = "last",
    createIssueManually = false,
    enableHotKey = true,
    distractionFreeMode = false,
    proxy,
    defaultUser: propsDefaultUser,
    defaultAuthor: propsDefaultAuthor,
    collapsedHeight: propsCollapsedHeight,
    highlightAdminComment = true,
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

  const issueScope = JSON.stringify([
    owner,
    repo,
    issueNumber,
    issueId,
    issueLabels,
  ]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [inputComment, setInputComment] = useState<string>("");
  const draftVersionRef = useRef(0);
  const submissionRef = useRef<object | null>(null);
  const updateInputComment = useCallback(
    (value: React.SetStateAction<string>) => {
      draftVersionRef.current += 1;
      setInputComment(value);
    },
    [],
  );
  const [isInputFocused, setIsInputFocused] = useState<boolean>(false);

  const [commentsCount, setCommentsCount] = useState<number>(0);
  const [comments, setComments] = useState<CommentType[]>([]);
  const [localComments, setLocalComments] = useState<CommentType[]>([]);
  const commentCreationVersionRef = useRef(0);
  const [commentsCursor, setCommentsCursor] = useState("");
  const [commentsPage, setCommentsPage] = useState<number>(1);
  const [hasMoreComments, setHasMoreComments] = useState(true);
  const commentsPerPage = useMemo(
    () =>
      Number.isInteger(propsPerPage) && propsPerPage > 0
        ? Math.min(propsPerPage, 100)
        : 10,
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
      polyglot,
      relativeTimeFormat: new Intl.RelativeTimeFormat(polyglot.locale(), {
        numeric: "auto",
      }),
    }),
    [polyglot],
  );

  const [accessToken, setAccessToken] = useState<string | undefined>(
    () => localStorage.getItem(ACCESS_TOKEN_KEY) ?? undefined,
  );
  const clearSession = useMemoizedFn((expiredToken?: string) => {
    if (expiredToken !== undefined && expiredToken !== accessToken) return;
    // Keep a pending login alive when the previous API token expires.
    if (expiredToken === undefined) cancelGetAccessToken();
    cancelGetUser();
    cancelCreateIssue();
    cancelGetIssue();
    cancelGetComments();
    cancelCreateIssueComment();
    cancelLikeOrDislikeComment();
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    setAccessToken(undefined);
    clearAccessTokenResult(undefined);
    setUser(undefined);
    setComments([]);
    setLocalComments([]);
    commentCreationVersionRef.current = 0;
    setCommentsCursor("");
    setCommentsPage(1);
    setHasMoreComments(true);
  });

  const {
    mutate: clearAccessTokenResult,
    cancel: cancelGetAccessToken,
    loading: getAccessTokenLoading,
    run: runGetAccessToken,
  } = useRequest(
    async (code: string) =>
      await getAccessToken({ proxy, code, clientID, clientSecret }),
    {
      manual: true,
      ready: !!clientID && !!(clientSecret || proxy),
      onSuccess: (data) => {
        localStorage.setItem(ACCESS_TOKEN_KEY, data);
        setAccessToken(data);
        logger.s(`Get access token successfully`);
      },
      onError: (error) => {
        setAlert(`An error occurred while getting access token: ${error}`);
        logger.e(`An error occurred while getting access token:`, error);
      },
    },
  );

  useEffect(() => {
    try {
      const code = consumeOAuthCallback(clientID);
      if (code) runGetAccessToken(code);
    } catch (error) {
      setAlert(`An error occurred while authorizing: ${error}`);
    }
  }, [clientID, runGetAccessToken]);

  const octokit = useMemo(
    () => getOctokitInstance(accessToken, () => clearSession(accessToken)),
    [accessToken, clearSession],
  );

  const {
    data: user,
    mutate: setUser,
    cancel: cancelGetUser,
    loading: getUserLoading,
  } = useRequest(
    async () => {
      const getUserRes = await octokit.request("GET /user");
      const _user = getUserRes.data;
      logger.s(`Login successfully:`, _user);
      return _user;
    },
    {
      ready: !!accessToken,
      refreshDeps: [accessToken],
      onError: (error) => {
        setAlert(error.message);
        logger.e(`Get user details with access token failed:`, error);
      },
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

  const {
    loading: createIssueLoading,
    run: runCreateIssue,
    cancel: cancelCreateIssue,
  } = useRequest(
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

      const _issue = createIssueRes.data;
      logger.s(`Create issue successfully:`, _issue);
      return _issue;
    },
    {
      manual: true,
      ready:
        !!isAdmin && !!owner && !!repo && !!issueTitle && !!issueLabels.length,
      onSuccess: (createdIssue) => {
        setIssue(createdIssue);
        onCreateIssue?.(createdIssue);
      },
      onError: (error) => {
        setAlert(error.message);
        logger.e(`Create issue failed:`, error);
      },
    },
  );

  const { loading: getIssueLoading, cancel: cancelGetIssue } = useRequest(
    async () => {
      if (issueNumber) {
        try {
          const getIssueRes = await octokit.request(
            "GET /repos/{owner}/{repo}/issues/{issue_number}",
            {
              owner,
              repo,
              issue_number: issueNumber,
            },
          );

          const _issue = getIssueRes.data;
          logger.s(
            `Locate issue ${issueNumber} in repository ${owner}/${repo} successfully:`,
            _issue,
          );
          return _issue;
        } catch (error) {
          if (!(error instanceof RequestError) || error.status !== 404)
            throw error;
          logger.w(
            `Issue ${issueNumber} in repository ${owner}/${repo} was not found.`,
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
        const { data: issues } = getIssuesRes;

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
        }
      }
      return undefined;
    },
    {
      ready: !!owner && !!repo && (!!issueNumber || !!issueId),
      refreshDeps: [issueScope, accessToken, isAdmin, createIssueManually],
      onBefore: () => {
        setIssue(undefined);
      },
      onSuccess: (locatedIssue) => {
        setIssue(locatedIssue);
        if (!locatedIssue && isAdmin && !createIssueManually) runCreateIssue();
      },
      onError: (error) => {
        setAlert(error.message);
        logger.e(`Get issue failed:`, error);
      },
    },
  );

  const {
    run: runGetComments,
    loading: getCommentsLoading,
    cancel: cancelGetComments,
  } = useRequest(
    async (): Promise<{
      comments: CommentType[];
      cursor?: string;
      page?: number;
      hasMore: boolean;
      totalCount?: number;
      creationVersion: number;
    }> => {
      const creationVersion = commentCreationVersionRef.current;
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

        if (getIssueCommentsRes.repository?.issue) {
          const _comments = getIssueCommentsRes.repository.issue.comments.nodes
            .filter((comment) => comment !== null)
            .map((comment) => {
              return {
                ...comment,
                id: comment.databaseId,
                node_id: comment.id,
                user: comment.author
                  ? {
                      avatar_url: comment.author.avatarUrl,
                      login: comment.author.login,
                      html_url: comment.author.url,
                    }
                  : { ...defaultUser },
                body_html: comment.bodyHTML,
                created_at: comment.createdAt,
                html_url: comment.resourcePath,
                reactions: {
                  heart: comment.reactions?.totalCount ?? 0,
                },
                reactionsHeart: comment.reactions,
              } as CommentType;
            });
          logger.s(
            `Get comments from ${from} to ${to} successfully:`,
            _comments,
          );

          const commentsPageInfo =
            getIssueCommentsRes.repository.issue.comments.pageInfo;
          const commentsPageCursor =
            commentsPagerDirection === "last"
              ? commentsPageInfo.startCursor
              : commentsPageInfo.endCursor;

          return {
            comments: _comments,
            creationVersion,
            cursor: commentsPageCursor ?? "",
            hasMore:
              (commentsPagerDirection === "last"
                ? commentsPageInfo.hasPreviousPage
                : commentsPageInfo.hasNextPage) ?? false,
            totalCount:
              getIssueCommentsRes.repository.issue.comments.totalCount,
          };
        } else {
          throw new Error(
            `Get comments from ${from} to ${to} failed: ${getIssueCommentsRes}`,
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

        const _comments = getIssueCommentsRes.data.map((comment) => {
          const reactionsHeartTotalCount = comment.reactions?.heart ?? 0;
          return {
            ...comment,
            user: comment.user ?? { ...defaultUser },
            reactions: { heart: reactionsHeartTotalCount },
            reactionsHeart: {
              totalCount: reactionsHeartTotalCount,
              viewerHasReacted: false,
            },
          } as CommentType;
        });
        logger.s(`Get comments from ${from} to ${to} successfully:`, _comments);

        const hasMore = /<[^>]+>;\s*rel="next"/.test(
          getIssueCommentsRes.headers?.link ?? "",
        );
        return {
          comments: _comments,
          creationVersion,
          page: commentsPage + 1,
          hasMore,
          totalCount: hasMore
            ? undefined
            : new Set([...comments, ..._comments].map((comment) => comment.id))
                .size,
        };
      }
    },
    {
      manual: true,
      ready: !!owner && !!repo && !!issue && !getUserLoading,
      onSuccess: (result) => {
        setComments((previous) =>
          user && commentsPagerDirection === "last"
            ? [...result.comments, ...previous]
            : [...previous, ...result.comments],
        );
        if (result.cursor !== undefined) setCommentsCursor(result.cursor);
        if (result.page !== undefined) setCommentsPage(result.page);
        setHasMoreComments(result.hasMore);
        // A later request can recount comments submitted while this page loaded.
        if (
          result.totalCount !== undefined &&
          result.creationVersion === commentCreationVersionRef.current
        )
          setCommentsCount(result.totalCount);
      },
      onError: (error) => {
        setAlert(error.message);
        logger.e(`Get comments failed:`, error);
      },
    },
  );

  const {
    loading: createIssueCommentLoading,
    runAsync: runCreateIssueComment,
    cancel: cancelCreateIssueComment,
  } = useRequest(
    async (body: string): Promise<CommentType> => {
      const { number: currentIssueNumber } = issue as IssueType;

      const createIssueCommentRes = await octokit.request(
        "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
        {
          owner,
          repo,
          issue_number: currentIssueNumber,
          body,
          headers: {
            accept: "application/vnd.github.v3.full+json",
          },
        },
      );

      if (createIssueCommentRes.status === 201) {
        const createdIssueComment = {
          ...createIssueCommentRes.data,
          user: createIssueCommentRes.data.user ?? { ...defaultUser },
          reactions: { heart: 0 },
          reactionsHeart: {
            totalCount: 0,
            viewerHasReacted: false,
          },
        } as CommentType;
        logger.s(`Create issue comment successfully.`);

        return createdIssueComment;
      } else {
        throw new Error(
          `Create issue comment failed: ${createIssueCommentRes}`,
        );
      }
    },
    {
      manual: true,
      ready: !!owner && !!repo && !!issue && !!user,
      onSuccess: (createdComment) => {
        commentCreationVersionRef.current += 1;
        setLocalComments((prev) => prev.concat(createdComment));
        setCommentsCount((prev) => prev + 1);
        onCreateComment?.(createdComment);
      },
      onError: (error) => {
        setAlert(error.message);
        logger.e(`Create issue comment failed:`, error);
      },
    },
  );

  const submitComment = async () => {
    if (
      !user ||
      !issue ||
      !owner ||
      !repo ||
      !inputComment.trim() ||
      getIssueLoading ||
      createIssueCommentLoading ||
      submissionRef.current
    )
      return;
    const submission = {};
    const draftVersion = draftVersionRef.current;
    submissionRef.current = submission;
    try {
      await runCreateIssueComment(inputComment);
      if (
        submissionRef.current === submission &&
        draftVersionRef.current === draftVersion
      ) {
        setInputComment("");
      }
    } catch {
      // useRequest reports active request failures through onError.
    } finally {
      if (submissionRef.current === submission) submissionRef.current = null;
    }
  };

  useLayoutEffect(() => {
    commentCreationVersionRef.current = 0;
    setIssue(undefined);
    setComments([]);
    setLocalComments([]);
    setCommentsCount(0);
    setCommentsCursor("");
    setCommentsPage(1);
    setHasMoreComments(true);
    setAlert("");
    return () => {
      cancelGetIssue();
      cancelCreateIssue();
      cancelGetComments();
      cancelCreateIssueComment();
      submissionRef.current = null;
    };
  }, [
    issueScope,
    cancelGetIssue,
    cancelCreateIssue,
    cancelGetComments,
    cancelCreateIssueComment,
  ]);

  useEffect(() => {
    setCommentsCount(issue?.comments ?? 0);
    setLocalComments([]);
  }, [issue]);

  useEffect(() => {
    setComments([]);
    setCommentsCursor("");
    setCommentsPage(1);
    setHasMoreComments(true);

    const timer = setTimeout(() => {
      runGetComments();
    });
    return () => {
      clearTimeout(timer);
      cancelGetComments();
    };
  }, [
    accessToken,
    issue,
    user,
    commentsPagerDirection,
    commentsPerPage,
    cancelGetComments,
    runGetComments,
  ]);

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

  const {
    loading: likeOrDislikeCommentLoading,
    run: runLikeOrDislikeComment,
    cancel: cancelLikeOrDislikeComment,
  } = useRequest(
    async (like: boolean, commentId: CommentType["id"]) => {
      const targetComment = comments
        .concat(localComments)
        .find((comment) => comment.id === commentId);
      if (!targetComment) throw new Error("Comment is no longer available.");
      const result = await octokit.graphql<{
        reaction: {
          subject: { reactions: CommentType["reactionsHeart"] } | null;
        } | null;
      }>(getCommentReactionMutationQL(like), {
        subjectId: targetComment.node_id,
      });
      const reactions = result.reaction?.subject?.reactions;
      if (!reactions)
        throw new Error("The comment reaction could not be updated.");
      return { commentId, reactions };
    },
    {
      manual: true,
      ready: !!owner && !!repo && !!user && !!issue,
      onSuccess: ({ commentId, reactions }) => {
        const updateComment = (comment: CommentType): CommentType =>
          comment.id === commentId
            ? {
                ...comment,
                reactions: { heart: reactions.totalCount },
                reactionsHeart: reactions,
              }
            : comment;
        setComments((previous) => previous.map(updateComment));
        setLocalComments((previous) => previous.map(updateComment));
      },
      onError: (error) => {
        setAlert(error.message);
        logger.e("Update comment reaction failed:", error);
      },
    },
  );
  useLayoutEffect(
    () => () => cancelLikeOrDislikeComment(),
    [issueScope, accessToken, cancelLikeOrDislikeComment],
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
    try {
      window.location.href = getAuthorizeUrl(clientID);
    } catch (error) {
      setAlert(`An error occurred while authorizing: ${error}`);
    }
  };

  const onLogout = () => {
    clearSession();
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
      e.preventDefault();
      void submitComment();
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

      updateInputComment((prevComment) => {
        if (prevComment) {
          repliedCommentBodyArray.unshift("", "");
        }
        repliedCommentBodyArray.push("");
        const newComment = `${prevComment}${repliedCommentBodyArray.join("\n")}`;
        return newComment;
      });

      setTimeout(() => {
        textareaRef.current?.focus();
      });
    },
    [updateInputComment],
  );

  if (!isModernBrowser) {
    logger.e(
      `Gitalk React can only be rendered well in modern browser that supports CSS variables and ES2020.`,
      `If you have compatibility requirements, please consider using the original project which is compatible with older browsers: https://github.com/gitalk/gitalk`,
    );
    return null;
  }

  if (!clientID || !(clientSecret || proxy)) {
    logger.e(
      `You must specify \`clientID\` and either \`proxy\` or \`clientSecret\``,
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
        className={cn(
          "gt-container",
          { "gt-input-focused": isInputFocused },
          className,
        )}
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
                ref={textareaRef}
                value={inputComment}
                onChange={(e) => updateInputComment(e.target.value)}
                onFocus={onCommentInputFocus}
                onBlur={onCommentInputBlur}
                onKeyDown={onCommentInputKeyDown}
                placeholder={polyglot.t("leave-a-comment")}
                octokit={octokit}
                user={user}
                onLogin={onLogin}
                onCreateComment={submitComment}
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
                hasMoreComments={hasMoreComments}
                onGetComments={runGetComments}
                getCommentsLoading={getCommentsLoading}
                user={user}
                admin={admin}
                onReply={onReplyComment}
                onLike={runLikeOrDislikeComment}
                likeLoading={likeOrDislikeCommentLoading}
                collapsedHeight={collapsedHeight}
                highlightAdminComment={highlightAdminComment}
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
