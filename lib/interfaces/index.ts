import type { Endpoints } from "@octokit/types";

export interface GitalkProps extends Omit<
  React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement>,
  "id" | "title"
> {
  /**
   * GitHub Application Client ID.
   */
  clientID: string;
  /**
   * GitHub Application Client Secret.
   * When provided, exchange credentials through the selected CORS proxy.
   * Exposed in browser code; omit it to use a server-side `proxy`.
   */
  clientSecret?: string;
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
   * BCP 47 language tag. Regional tags use the available base translation;
   * Chinese tags preserve simplified/traditional script differences.
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
   * With `clientSecret`: optional CORS relay, defaulting to `https://cors-anywhere.azm.workers.dev/https://github.com/login/oauth/access_token`.
   * Without `clientSecret`: required server-side OAuth exchange endpoint.
   * Server-side mode receives GET requests with only `code` and returns
   * `{ access_token: string }`; credentials stay on the server.
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
  defaultAuthor?: {
    avatarUrl: Comment["user"]["avatar_url"];
    login: Comment["user"]["login"];
    url: Comment["user"]["html_url"];
  };
  /**
   * Default collapse the comment if meets the height (px)
   */
  collapsedHeight?: number;
  /**
   * Whether to highlight the comment created by admin users.
   *
   * @default true
   */
  highlightAdminComment?: boolean;
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
  "id" | "node_id" | "body" | "body_html" | "created_at" | "html_url"
> & {
  user: Pick<
    NonNullable<CommentDefine["user"]>,
    "avatar_url" | "login" | "html_url"
  >;
  reactions: Pick<NonNullable<CommentDefine["reactions"]>, "heart">;
  reactionsHeart: {
    totalCount: number;
    viewerHasReacted: boolean;
  };
};
