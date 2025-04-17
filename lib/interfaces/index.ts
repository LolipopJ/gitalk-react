import type { Endpoints } from "@octokit/types";

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
      id: number;
      user: {
        login: string;
      };
    }[];
  };
};

export interface GraphQLResponse<T> {
  status: number;
  data: T;
}
