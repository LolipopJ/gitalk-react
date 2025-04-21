import type { Endpoints } from "@octokit/types";
import type FlipMove from "react-flip-move";

import type { Lang } from "../i18n";
import type { IssueCommentsQLResponse } from "../services/graphql/comment";

export interface GitalkProps
  extends Omit<
    React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLDivElement>,
      HTMLDivElement
    >,
    "id" | "title"
  > {
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
   * @default location.host + location.pathname
   */
  id?: string;
  /**
   * The issue ID of the page.
   * If the number attribute is not defined, issue will be located using id.
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
   * Available values are `last` and `first`.
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
  defaultUser?: Comment["user"];
  /**
   * Default user field if comments' author is not provided
   *
   * @deprecated use `defaultUser`
   */
  defaultAuthor?: IssueCommentsQLResponse["repository"]["issue"]["comments"]["nodes"][number]["author"];
  /**
   * Default collapse the comment if meets the height (px)
   */
  collapsedHeight?: number;
  /**
   * Callback method invoked when updating the number of comments.
   *
   * @param count comments number
   */
  updateCountCallback?: (count: number) => void;
  /**
   * Callback method invoked when a new issue is successfully created.
   *
   * @param issue created issue
   */
  onCreateIssue?: (issue: Issue) => void;
  /**
   * Callback method invoked when a new comment is successfully created.
   *
   * @param comment created comment
   */
  onCreateComment?: (comment: Comment) => void;
}

export type User = Endpoints["GET /user"]["response"]["data"];

export type Issue =
  Endpoints["GET /repos/{owner}/{repo}/issues/{issue_number}"]["response"]["data"];

type CommentDefine =
  Endpoints["GET /repos/{owner}/{repo}/issues/{issue_number}/comments"]["response"]["data"][number];

export type Comment = Pick<
  CommentDefine,
  "id" | "body" | "body_html" | "created_at" | "html_url"
> & {
  user: Pick<
    NonNullable<CommentDefine["user"]>,
    "avatar_url" | "login" | "html_url"
  >;
  reactions: Pick<NonNullable<CommentDefine["reactions"]>, "heart">;
  reactionsHeart: {
    totalCount: number;
    viewerHasReacted: boolean;
    nodes: {
      databaseId: number;
      user: {
        login: string;
      };
    }[];
  };
};
