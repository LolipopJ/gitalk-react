"use client";

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
  PendingComment,
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
import {
  type ReactionContent,
  type ReactionGroup,
  reactionsFromGroups,
  reactionsFromRest,
} from "./utils/reactions";

const isModernBrowser = supportsCSSVariables() && supportsES2020();

const getPageFromLink = (
  link: string | undefined,
  relation: "next" | "prev" | "last",
) => {
  const url = link?.match(new RegExp(`<([^>]+)>;\\s*rel="${relation}"`))?.[1];
  if (!url) return undefined;
  const page = Number(new URL(url).searchParams.get("page"));
  return Number.isInteger(page) && page > 0 ? page : undefined;
};

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
  const oauthScope = useMemo(
    () => ({ owner, repo, id: propsIssueId, number: issueNumber }),
    [owner, repo, propsIssueId, issueNumber],
  );
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
  const reactionRequestRef = useRef<object | null>(null);
  const [pendingComments, setPendingComments] = useState<PendingComment[]>([]);
  const pendingIdRef = useRef(0);
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
  const [commentsPage, setCommentsPage] = useState<number>();
  const [hasMoreComments, setHasMoreComments] = useState(true);
  const commentsPerPage = useMemo(
    () =>
      Number.isInteger(propsPerPage) && propsPerPage > 0
        ? Math.min(propsPerPage, 100)
        : 10,
    [propsPerPage],
  );
  /** Current sort order. */
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
  const accessTokenRef = useRef(accessToken);
  const clearSession = useMemoizedFn((expiredToken?: string) => {
    if (expiredToken !== undefined && expiredToken !== accessTokenRef.current)
      return;
    accessTokenRef.current = undefined;
    // Keep a pending login alive when the previous API token expires.
    if (expiredToken === undefined) cancelGetAccessToken();
    cancelGetUser();
    cancelCreateIssue();
    cancelGetIssue();
    cancelGetComments();
    cancelCreateIssueComment();
    cancelReactToComment();
    reactionRequestRef.current = null;
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    setAccessToken(undefined);
    clearAccessTokenResult(undefined);
    setUser(undefined);
    setComments([]);
    setLocalComments([]);
    setPendingComments([]);
    submissionRef.current = null;
    commentCreationVersionRef.current = 0;
    setCommentsCursor("");
    setCommentsPage(undefined);
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
        accessTokenRef.current = data;
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
      const callback = consumeOAuthCallback(clientID, oauthScope);
      if (callback) {
        if (draftVersionRef.current === 0) updateInputComment(callback.draft);
        if ("error" in callback) {
          setAlert(`An error occurred while authorizing: ${callback.error}`);
        } else {
          runGetAccessToken(callback.code);
        }
      }
    } catch (error) {
      setAlert(`An error occurred while authorizing: ${error}`);
    }
  }, [clientID, oauthScope, runGetAccessToken, updateInputComment]);

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
        try {
          onCreateIssue?.(createdIssue);
        } catch (error) {
          logger.e("onCreateIssue callback failed:", error);
        }
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
            state: "all",
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
      const from = ((commentsPage ?? 1) - 1) * commentsPerPage + 1;
      const to = (commentsPage ?? 1) * commentsPerPage;

      if (user) {
        // Get comments via GraphQL, which requires being logged in.
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
                reactions: reactionsFromGroups(comment.reactionGroups),
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
        // REST pages are always ascending; newest-first starts at the last page.
        const newestFirst = commentsPagerDirection === "last";
        let page =
          commentsPage ??
          (newestFirst
            ? Math.max(1, Math.ceil((issue?.comments ?? 0) / commentsPerPage))
            : 1);
        const requestPage = (page: number) =>
          octokit.request(
            "GET /repos/{owner}/{repo}/issues/{issue_number}/comments",
            {
              owner,
              repo,
              issue_number: currentIssueNumber,
              page,
              per_page: commentsPerPage,
              headers: {
                accept: "application/vnd.github.v3.full+json",
              },
            },
          );

        let getIssueCommentsRes = await requestPage(page);
        const visitedPages = new Set([page]);
        while (newestFirst) {
          const link = getIssueCommentsRes.headers?.link;
          const lastPage = getPageFromLink(link, "last");
          const newestPage =
            commentsPage === undefined
              ? (lastPage ?? getPageFromLink(link, "next"))
              : undefined;
          let retryPage = newestPage !== page ? newestPage : undefined;
          if (
            retryPage === undefined &&
            !getIssueCommentsRes.data.length &&
            page > 1
          ) {
            // A page-one probe recovers stale totals without walking empty pages.
            retryPage = lastPage && lastPage < page ? lastPage : 1;
          }
          if (retryPage === undefined || visitedPages.has(retryPage)) break;
          page = retryPage;
          visitedPages.add(page);
          getIssueCommentsRes = await requestPage(page);
        }

        const _comments = getIssueCommentsRes.data.map((comment) => {
          return {
            ...comment,
            user: comment.user ?? { ...defaultUser },
            reactions: reactionsFromRest(comment.reactions),
          } as CommentType;
        });
        logger.s(`Get comments from ${from} to ${to} successfully:`, _comments);

        const nextPage = getPageFromLink(
          getIssueCommentsRes.headers?.link,
          newestFirst ? "prev" : "next",
        );
        const hasMore = nextPage !== undefined;
        return {
          comments: _comments,
          creationVersion,
          page: nextPage,
          hasMore,
          totalCount:
            newestFirst && commentsPage === undefined
              ? (page - 1) * commentsPerPage + _comments.length
              : hasMore
                ? undefined
                : new Set(
                    [...comments, ..._comments].map((comment) => comment.id),
                  ).size,
        };
      }
    },
    {
      manual: true,
      ready: !!owner && !!repo && !!issue && !getUserLoading,
      onSuccess: (result) => {
        setComments((previous) =>
          commentsPagerDirection === "last"
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
          reactions: reactionsFromRest(createIssueCommentRes.data.reactions),
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
        try {
          onCreateComment?.(createdComment);
        } catch (error) {
          logger.e("onCreateComment callback failed:", error);
        }
      },
      onError: (error) => {
        setAlert(error.message);
        logger.e(`Create issue comment failed:`, error);
      },
    },
  );

  const submitComment = async (retry?: PendingComment) => {
    const body = retry?.body ?? inputComment;
    if (
      !user ||
      !issue ||
      !owner ||
      !repo ||
      !body.trim() ||
      getIssueLoading ||
      createIssueCommentLoading ||
      submissionRef.current
    )
      return;
    const submission = {};
    const draftVersion = retry?.draftVersion ?? draftVersionRef.current;
    const pending = retry ??
      pendingComments.find(
        (comment) =>
          comment.status === "failed" &&
          comment.draftVersion === draftVersion &&
          comment.body === body,
      ) ?? {
        id: ++pendingIdRef.current,
        body,
        user,
        draftVersion,
        status: "sending" as const,
      };
    submissionRef.current = submission;
    setAlert("");
    setPendingComments((previous) => [
      ...previous.filter((comment) => comment.id !== pending.id),
      { ...pending, status: "sending", error: undefined },
    ]);
    try {
      await runCreateIssueComment(body);
      if (submissionRef.current !== submission) return;
      // The POST response is the committed comment. Later reads or callbacks
      // must never turn a successful write into a retryable submission.
      setPendingComments((previous) =>
        previous.filter((comment) => comment.id !== pending.id),
      );
      if (
        submissionRef.current === submission &&
        draftVersionRef.current === draftVersion
      ) {
        setInputComment("");
      }
    } catch (error) {
      if (submissionRef.current === submission) {
        setPendingComments((previous) =>
          previous.map((comment) =>
            comment.id === pending.id
              ? {
                  ...comment,
                  status: "failed",
                  error: error instanceof Error ? error.message : String(error),
                }
              : comment,
          ),
        );
      }
    } finally {
      if (submissionRef.current === submission) submissionRef.current = null;
    }
  };

  useLayoutEffect(() => {
    commentCreationVersionRef.current = 0;
    setIssue(undefined);
    setComments([]);
    setLocalComments([]);
    setPendingComments([]);
    setCommentsCount(0);
    setCommentsCursor("");
    setCommentsPage(undefined);
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
    setCommentsPage(undefined);
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

    if (commentsPagerDirection === "last") {
      // sort comments by date DESC
      _loadedComments.reverse();
    }

    return _loadedComments;
  }, [comments, commentsPagerDirection, localComments]);

  useEffect(() => {
    try {
      updateCountCallback?.(commentsCount);
    } catch (error) {
      logger.e("updateCountCallback failed:", error);
    }
  }, [commentsCount, updateCountCallback]);

  const {
    loading: reactionLoading,
    runAsync: runReactToComment,
    cancel: cancelReactToComment,
  } = useRequest(
    async (
      add: boolean,
      content: ReactionContent,
      commentId: CommentType["id"],
    ) => {
      const targetComment = comments
        .concat(localComments)
        .find((comment) => comment.id === commentId);
      if (!targetComment) throw new Error("Comment is no longer available.");
      const result = await octokit.graphql<{
        reaction: {
          subject: { reactionGroups: ReactionGroup[] } | null;
        } | null;
      }>(getCommentReactionMutationQL(add), {
        subjectId: targetComment.node_id,
        content,
      });
      const reactions = result.reaction?.subject?.reactionGroups;
      if (!reactions)
        throw new Error("The comment reaction could not be updated.");
      return { commentId, reactions: reactionsFromGroups(reactions) };
    },
    {
      manual: true,
      ready: !!owner && !!repo && !!user && !!issue,
      onSuccess: ({ commentId, reactions }) => {
        const updateComment = (comment: CommentType): CommentType =>
          comment.id === commentId
            ? {
                ...comment,
                reactions,
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
  const reactToComment = async (
    add: boolean,
    content: ReactionContent,
    commentId: CommentType["id"],
  ) => {
    if (!user || reactionRequestRef.current) return;
    const request = {};
    reactionRequestRef.current = request;
    try {
      await runReactToComment(add, content, commentId);
    } catch {
      // Active mutation errors are reported by useRequest.onError.
    } finally {
      if (reactionRequestRef.current === request)
        reactionRequestRef.current = null;
    }
  };
  useLayoutEffect(
    () => () => {
      cancelReactToComment();
      reactionRequestRef.current = null;
    },
    [issueScope, accessToken, cancelReactToComment],
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
      window.location.href = getAuthorizeUrl(
        clientID,
        oauthScope,
        inputComment,
      );
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
                onCreateComment={() => submitComment()}
                comments={loadedComments}
                onValueChange={updateInputComment}
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
                onReaction={reactToComment}
                reactionLoading={reactionLoading}
                pendingComments={pendingComments}
                onRetry={submitComment}
                createCommentLoading={createIssueCommentLoading}
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

export { Gitalk };
export type { GitalkProps };

export default Gitalk;
