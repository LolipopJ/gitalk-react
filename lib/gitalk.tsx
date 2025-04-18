import "./i18n";

import { useRequest } from "ahooks";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import FlipMove from "react-flip-move";

import ArrowDown from "./assets/arrow-down.svg?raw";
import Github from "./assets/github.svg?raw";
import Tip from "./assets/tip.svg?raw";
import Action from "./components/action";
import Avatar from "./components/avatar";
import Button from "./components/button";
import Comment, { type CommentProps } from "./components/comment";
import Svg from "./components/svg";
import {
  ACCESS_TOKEN_KEY,
  DATE_FNS_LOCALE_MAP,
  DEFAULT_LABELS,
  HOMEPAGE,
  VERSION,
} from "./constants";
import I18nContext from "./contexts/I18nContext";
import i18n, { type Lang } from "./i18n";
import type {
  Comment as CommentType,
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
import { hasClassInParent } from "./utils/dom";
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
   *
   * @default navigator.language
   */
  language?: Lang;
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
   *   staggerDelayBy: 150,
   *   appearAnimation: 'accordionVertical',
   *   enterAnimation: 'accordionVertical',
   *   leaveAnimation: 'accordionVertical',
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
  /**
   * Default user field if comments' author is not provided
   *
   * @default
   * ```ts
   * {
   *   avatar_url: "//avatars1.githubusercontent.com/u/29697133?s=50",
   *   login: "null",
   *   html_url: ""
   * }
   */
  defaultUser?: CommentType["user"];
  /**
   * Default user field if comments' author is not provided
   *
   * @deprecated use `defaultUser`
   */
  defaultAuthor?: IssueCommentsQLResponse["repository"]["issue"]["comments"]["nodes"][number]["author"];
  updateCountCallback?: (count: number) => void;
  onCreateComment?: (comment: CommentType) => void;
}

const isModernBrowser = supportsCSSVariables() && supportsES2020();

const Gitalk: React.FC<GitalkProps> = (props) => {
  const {
    clientID,
    clientSecret,
    owner,
    repo,
    admin,
    id: propsIssueId = location.href,
    number: issueNumber = -1,
    labels: issueBaseLabels = DEFAULT_LABELS,
    title: issueTitle = document.title,
    body: issueBody = location.href +
      document
        ?.querySelector('meta[name="description"]')
        ?.getAttribute("content") || "",
    language = navigator.language as Lang,
    perPage: propsPerPage = 10,
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
    defaultUser: propsDefaultUser,
    defaultAuthor: propsDefaultAuthor,
    updateCountCallback,
    onCreateComment,
    className = "",
    ...restProps
  } = props;
  const issueId = propsIssueId.slice(0, 50);
  const commentsPerPage =
    propsPerPage > 100 ? 100 : propsPerPage < 0 ? 10 : propsPerPage;
  const defaultUser = propsDefaultUser
    ? propsDefaultUser
    : propsDefaultAuthor
      ? {
          avatar_url: propsDefaultAuthor.avatarUrl,
          login: propsDefaultAuthor.login,
          html_url: propsDefaultAuthor.url,
        }
      : {
          avatar_url: "//avatars1.githubusercontent.com/u/29697133?s=50",
          login: "null",
          html_url: "",
        };

  logger.i("re-rendered.");

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [inputComment, setInputComment] = useState<string>("");
  const [isInputFocused, setIsInputFocused] = useState<boolean>(false);
  const [isPreviewComment, setIsPreviewComment] = useState<boolean>(false);

  const [commentsCount, setCommentsCount] = useState<number>(0);
  const [commentsCursor, setCommentsCursor] = useState("");
  const [commentsPage, setCommentsPage] = useState<number>(1);
  const [commentsLoaded, setCommentsLoaded] = useState<boolean>(false);
  const [commentsPagerDirection, setCommentsPagerDirection] =
    useState(pagerDirection);

  const [showPopup, setShowPopup] = useState<boolean>(false);

  const [alert, setAlert] = useState<string>("");

  const polyglot = useMemo(() => i18n(language), [language]);

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

  const issueLabels = useMemo(
    () => issueBaseLabels.concat([issueId]),
    [issueBaseLabels, issueId],
  );

  const { loading: createIssueLoading, runAsync: runCreateIssue } = useRequest(
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
        return _issue;
      } else {
        setAlert(`Create issue failed: ${createIssueRes}`);
        logger.e(`Create issue failed:`, createIssueRes);
        return undefined;
      }
    },
    {
      manual: true,
      ready:
        !!isAdmin && !!owner && !!repo && !!issueTitle && !!issueLabels.length,
    },
  );

  const {
    data: issue,
    mutate: setIssue,
    loading: getIssueLoading,
  } = useRequest(
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
          setAlert(
            `Get issue with labels ${issueLabels} in repository ${owner}/${repo} failed: ${getIssuesRes}`,
          );
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
      refreshDeps: [owner, repo, issueNumber, issueId],
      onBefore: () => {
        setIssue(undefined);
        setInputComment("");
      },
    },
  );

  const {
    data: comments = [],
    mutate: setComments,
    loading: getCommentsLoading,
  } = useRequest(
    async (): Promise<CommentType[]> => {
      const { number: issueNumber } = issue as IssueType;
      const from = (commentsPage - 1) * commentsPerPage + 1;
      const to = commentsPage * commentsPerPage;

      if (user) {
        // Get comments via GraphQL, witch requires being logged and able to sort
        const query = getIssueCommentsQL({
          pagerDirection,
        });

        const getIssueCommentsRes: IssueCommentsQLResponse =
          await octokit.graphql(query, {
            owner,
            repo,
            id: issueNumber,
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

          if (_comments.length < commentsPerPage) {
            setCommentsLoaded(true);
          }

          if (pagerDirection === "last") return [..._comments, ...comments];
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
            issue_number: issueNumber,
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

          if (_comments.length < commentsPerPage) {
            setCommentsLoaded(true);
          }

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
      ready: !!owner && !!repo && !!issue && !getUserLoading && !commentsLoaded,
      refreshDeps: [commentsPage, issue, user, pagerDirection],
    },
  );

  const {
    data: localComments = [],
    mutate: setLocalComments,
    loading: createIssueCommentLoading,
    run: runCreateIssueComment,
  } = useRequest(
    async (): Promise<CommentType[]> => {
      const { number: issueNumber } = issue as IssueType;

      const createIssueCommentRes = await octokit.request(
        "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
        {
          owner,
          repo,
          issue_number: issueNumber,
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
    setCommentsCount(0);
    setCommentsCursor("");
    setCommentsPage(1);
    setCommentsLoaded(false);
    setLocalComments([]);

    if (issue) {
      setCommentsCount(issue.comments);
    }
  }, [issue, user, pagerDirection, setComments, setLocalComments]);

  /** sorted all comments */
  const allComments = useMemo(() => {
    const _allComments = comments.concat(localComments);

    if (commentsPagerDirection === "last" && !!user) {
      // sort comments by date DESC
      _allComments.reverse();
    }

    return _allComments;
  }, [comments, commentsPagerDirection, localComments, user]);

  const allCommentsCount = commentsCount + (localComments ?? []).length;

  useEffect(() => {
    updateCountCallback?.(allCommentsCount);
  }, [allCommentsCount, updateCountCallback]);

  const {
    data: commentHtml = "",
    mutate: setCommentHtml,
    loading: getCommentHtmlLoading,
    run: runGetCommentHtml,
    cancel: cancelGetCommentHtml,
  } = useRequest(
    async () => {
      const getPreviewedHtmlRes = await octokit.request("POST /markdown", {
        text: inputComment,
      });

      if (getPreviewedHtmlRes.status === 200) {
        const _commentHtml = getPreviewedHtmlRes.data;
        return _commentHtml;
      } else {
        setAlert(`Preview rendered comment failed: ${getPreviewedHtmlRes}`);
        logger.e(`Preview rendered comment failed:`, getPreviewedHtmlRes);
        return "";
      }
    },
    {
      manual: true,
      onBefore: () => {
        setCommentHtml("");
      },
    },
  );

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

  const hidePopup = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target && hasClassInParent(target, "gt-user", "gt-popup")) {
      return;
    }
    document.removeEventListener("click", hidePopup);
    setShowPopup(false);
  }, []);

  const onShowOrHidePopup: React.MouseEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();

    setShowPopup((visible) => {
      if (visible) {
        document.removeEventListener("click", hidePopup);
      } else {
        document.addEventListener("click", hidePopup);
      }
      return !visible;
    });
  };

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

  const onCommentInputKeyDown: React.KeyboardEventHandler<
    HTMLTextAreaElement
  > = (e) => {
    if (enableHotKey && (e.metaKey || e.ctrlKey) && e.keyCode === 13) {
      runCreateIssueComment();
    }
  };

  const onCommentInputPreview: React.MouseEventHandler<
    HTMLButtonElement
  > = () => {
    if (isPreviewComment) {
      setIsPreviewComment(false);
      cancelGetCommentHtml();
    } else {
      setIsPreviewComment(true);
      runGetCommentHtml();
    }
  };

  const onReplyComment: CommentProps["onReply"] = (repliedComment) => {
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

    if (inputComment) {
      repliedCommentBodyArray.unshift("", "");
    }

    repliedCommentBodyArray.push("", "");

    const newComment = `${inputComment}${repliedCommentBodyArray.join("\n")}`;
    setInputComment(newComment);
    textareaRef.current?.focus();
  };

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

  const renderInitializing = () => {
    return (
      <div className="gt-initing">
        <i className="gt-loader" />
        <p className="gt-initing-text">{polyglot.t("init")}</p>
      </div>
    );
  };

  const renderIssueNotInitialized = () => {
    return (
      <div className="gt-no-init" key="no-init">
        <p
          dangerouslySetInnerHTML={{
            __html: polyglot.t("no-found-related", {
              link: `<a href="https://github.com/${owner}/${repo}/issues">Issues</a>`,
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
            href={user.html_url}
          />
        ) : (
          <a className="gt-avatar-github" onClick={onLogin}>
            <Svg className="gt-ico-github" icon={Github} />
          </a>
        )}
        <div className="gt-header-comment">
          <textarea
            ref={textareaRef}
            className="gt-header-textarea"
            style={{ display: isPreviewComment ? "none" : undefined }}
            value={inputComment}
            onChange={(e) => setInputComment(e.target.value)}
            onFocus={onCommentInputFocus}
            onBlur={onCommentInputBlur}
            onKeyDown={onCommentInputKeyDown}
            placeholder={polyglot.t("leave-a-comment")}
          />
          <div
            className="gt-header-preview markdown-body"
            style={{ display: isPreviewComment ? undefined : "none" }}
            dangerouslySetInnerHTML={{
              __html: commentHtml,
            }}
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
                text={polyglot.t("support-markdown")}
              />
            </a>
            {user && (
              <Button
                className="gt-btn-public"
                onClick={runCreateIssueComment}
                text={polyglot.t("comment")}
                isLoading={createIssueCommentLoading}
              />
            )}

            <Button
              className="gt-btn-preview"
              onClick={onCommentInputPreview}
              text={
                isPreviewComment ? polyglot.t("edit") : polyglot.t("preview")
              }
              isLoading={getCommentHtmlLoading}
              disabled={false}
            />
            {!user && (
              <Button
                className="gt-btn-login"
                onClick={onLogin}
                text={polyglot.t("login-with-github")}
              />
            )}
          </div>
        </div>
      </div>
    );
  };

  // Why forwardRef? https://www.npmjs.com/package/react-flip-move#usage-with-functional-components
  const CommentWithForwardedRef = forwardRef<
    HTMLDivElement,
    { comment: CommentType }
  >(({ comment }, ref) => {
    const {
      id: commentId,
      user: commentAuthor,
      reactionsHeart: commentReactionsHeart,
    } = comment;

    const commentAuthorName = commentAuthor?.login;
    const isAuthor =
      !!user && !!commentAuthorName && user.login === commentAuthorName;
    const isAdmin =
      !!commentAuthorName &&
      !!admin.find(
        (username) =>
          username.toLowerCase() === commentAuthorName.toLowerCase(),
      );
    const heartReactionId = commentReactionsHeart?.nodes.find(
      (node) => node.user.login === user?.login,
    )?.databaseId;

    return (
      <div ref={ref}>
        <Comment
          comment={comment}
          isAuthor={isAuthor}
          isAdmin={isAdmin}
          onReply={onReplyComment}
          onLike={(like) => {
            runLikeOrDislikeComment(like, commentId, heartReactionId);
          }}
          likeLoading={likeOrDislikeCommentLoading}
        />
      </div>
    );
  });

  const renderCommentList = () => {
    return (
      <div className="gt-comments" key="comments">
        <FlipMove {...flipMoveOptions}>
          {allComments.map((comment) => (
            <CommentWithForwardedRef key={comment.id} comment={comment} />
          ))}
        </FlipMove>
        {!allCommentsCount && (
          <p className="gt-comments-null">
            {polyglot.t("first-comment-person")}
          </p>
        )}
        {!commentsLoaded && allCommentsCount ? (
          <div className="gt-comments-controls">
            <Button
              className="gt-btn-loadmore"
              onClick={() => setCommentsPage((prev) => prev + 1)}
              isLoading={getCommentsLoading}
              text={polyglot.t("load-more")}
            />
          </div>
        ) : null}
      </div>
    );
  };

  const renderMeta = () => {
    const isDesc = commentsPagerDirection === "last";

    return (
      <div className="gt-meta" key="meta">
        <span
          className="gt-counts"
          dangerouslySetInnerHTML={{
            __html: polyglot.t("counts", {
              counts: `<a class="gt-link gt-link-counts" href="${issue?.html_url}" target="_blank" rel="noopener noreferrer">${allCommentsCount}</a>`,
              smart_count: allCommentsCount,
            }),
          }}
        />
        {showPopup && (
          <div className="gt-popup">
            {user
              ? [
                  <Action
                    key={"sort-asc"}
                    className={`gt-action-sortasc${!isDesc ? " is--active" : ""}`}
                    onClick={() => setCommentsPagerDirection("first")}
                    text={polyglot.t("sort-asc")}
                  />,
                  <Action
                    key={"sort-desc"}
                    className={`gt-action-sortdesc${isDesc ? " is--active" : ""}`}
                    onClick={() => setCommentsPagerDirection("last")}
                    text={polyglot.t("sort-desc")}
                  />,
                ]
              : null}
            {user ? (
              <Action
                className="gt-action-logout"
                onClick={onLogout}
                text={polyglot.t("logout")}
              />
            ) : (
              <a className="gt-action gt-action-login" onClick={onLogin}>
                {polyglot.t("login-with-github")}
              </a>
            )}
            <div className="gt-copyright">
              <a
                className="gt-link gt-link-project"
                href={HOMEPAGE}
                target="_blank"
                rel="noopener noreferrer"
              >
                GitalkR
              </a>
              <span className="gt-version">{VERSION}</span>
            </div>
          </div>
        )}
        <div className="gt-user">
          <div
            className={`gt-user-inner${showPopup ? " is--poping" : ""}`}
            onClick={onShowOrHidePopup}
          >
            <span className="gt-user-name">
              {user?.login ?? polyglot.t("anonymous")}
            </span>
            <Svg className="gt-ico-arrdown" icon={ArrowDown} />
          </div>
        </div>
      </div>
    );
  };

  return (
    <I18nContext.Provider
      value={{ language, polyglot, dateFnsLocaleMap: DATE_FNS_LOCALE_MAP }}
    >
      <div
        className={`gt-container ${isInputFocused ? "gt-input-focused" : ""} ${className}`}
        {...restProps}
      >
        {alert && <div className="gt-error">{alert}</div>}
        {initialized
          ? issueCreated
            ? [renderMeta(), renderHeader(), renderCommentList()]
            : renderIssueNotInitialized()
          : renderInitializing()}
      </div>
    </I18nContext.Provider>
  );
};

export default Gitalk;
