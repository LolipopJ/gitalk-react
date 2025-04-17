import { type GitalkProps } from "../../gitalk";
import type { Comment } from "../../interfaces";

export interface IssueCommentsQLResponse {
  repository: {
    issue: {
      comments: {
        totalCount: number;
        pageInfo: {
          hasPreviousPage?: boolean;
          hasNextPage?: boolean;
          startCursor?: string;
          endCursor?: string;
        };
        nodes: (Pick<Comment, "id" | "body"> & {
          author: {
            avatarUrl: Comment["user"]["avatar_url"];
            login: Comment["user"]["login"];
            url: Comment["user"]["html_url"];
          };
          bodyHTML: Comment["body_html"];
          createdAt: Comment["created_at"];
          resourcePath: Comment["html_url"];
          reactions: Comment["reactionsHeart"];
        })[];
      };
    };
  };
}

export const getIssueCommentsQL = ({
  pagerDirection,
}: {
  pagerDirection: GitalkProps["pagerDirection"];
}): string => {
  const cursorDirection = pagerDirection === "last" ? "before" : "after";

  return `
  query getIssueAndComments(
    $owner: String!,
    $repo: String!,
    $id: Int!,
    $cursor: String,
    $pageSize: Int!
  ) {
    repository(owner: $owner, name: $repo) {
      issue(number: $id) {
        comments(${pagerDirection}: $pageSize, ${cursorDirection}: $cursor) {
          totalCount
          pageInfo {
            ${pagerDirection === "last" ? "hasPreviousPage" : "hasNextPage"}
            ${cursorDirection === "before" ? "startCursor" : "endCursor"}
          }
          nodes {
            id
            author {
              avatarUrl
              login
              url
            }
            body
            bodyHTML
            createdAt
            resourcePath
            reactions(first: 100, content: HEART) {
              totalCount
              viewerHasReacted
              pageInfo {
                hasNextPage
              }
              nodes {
                id
                user {
                  login
                }
              }
            }
          }
        }
      }
    }
  }
  `;
};
