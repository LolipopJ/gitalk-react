import type { Comment, GitalkProps } from "../../interfaces";
import type { ReactionGroup } from "../../utils/reactions";

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
        nodes: (
          | (Pick<Comment, "body"> & {
              id: Comment["node_id"];
              databaseId: Comment["id"];
              author: {
                avatarUrl: Comment["user"]["avatar_url"];
                login: Comment["user"]["login"];
                url: Comment["user"]["html_url"];
              } | null;
              bodyHTML: Comment["body_html"];
              createdAt: Comment["created_at"];
              resourcePath: Comment["html_url"];
              reactionGroups: ReactionGroup[];
            })
          | null
        )[];
      };
    } | null;
  } | null;
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
            databaseId
            author {
              avatarUrl
              login
              url
            }
            body
            bodyHTML
            createdAt
            resourcePath
            reactionGroups {
              content
              viewerHasReacted
              reactors(first: 1) { totalCount }
            }
          }
        }
      }
    }
  }
  `;
};

export const getCommentReactionMutationQL = (add: boolean): string => `
mutation setCommentReaction($subjectId: ID!, $content: ReactionContent!) {
  reaction: ${add ? "addReaction" : "removeReaction"}(input: {subjectId: $subjectId, content: $content}) {
    subject {
      reactionGroups {
        content
        viewerHasReacted
        reactors(first: 1) { totalCount }
      }
    }
  }
}
`;
