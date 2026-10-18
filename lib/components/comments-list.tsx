import React, { useContext } from "react";

import I18nContext from "../contexts/I18nContext";
import type {
  Comment as CommentType,
  GitalkProps,
  PendingComment,
  User,
} from "../interfaces";
import type { ReactionContent } from "../utils/reactions";
import AnimatedComments from "./animated-comments";
import Button from "./button";
import Comment, { type CommentProps } from "./comment";

interface CommentItemProps
  extends
    Pick<
      CommentProps,
      | "comment"
      | "onReply"
      | "reactionLoading"
      | "collapsedHeight"
      | "highlightAdminComment"
      | "showAdminLabel"
      | "octokit"
      | "comments"
      | "onEdit"
      | "editLoading"
    >,
    Pick<GitalkProps, "admin"> {
  onReaction: (
    add: boolean,
    content: ReactionContent,
    commentId: CommentType["id"],
  ) => void;
  user?: User;
}

const CommentItem: React.FC<CommentItemProps> = ({
  comment,
  user,
  admin,
  onReaction,
  ...restProps
}) => {
  const { id: commentId, user: commentAuthor } = comment;

  const commentAuthorName = commentAuthor?.login;
  const isAuthor =
    !!user &&
    !!commentAuthorName &&
    user.login.toLowerCase() === commentAuthorName.toLowerCase();
  const isAdmin =
    !!commentAuthorName &&
    !!admin.find(
      (username) => username.toLowerCase() === commentAuthorName.toLowerCase(),
    );

  return (
    <Comment
      {...restProps}
      comment={comment}
      isAuthor={isAuthor}
      isAdmin={isAdmin}
      canReact={!!user}
      onReaction={(add, content) => {
        onReaction(add, content, commentId);
      }}
    />
  );
};

interface CommentsListProps extends Omit<CommentItemProps, "comment"> {
  comments: CommentType[];
  commentsCount: number;
  hasMoreComments: boolean;
  onGetComments: () => void;
  getCommentsLoading: boolean;
  pendingComments: PendingComment[];
  onRetry: (comment: PendingComment) => void;
  createCommentLoading: boolean;
}

const CommentsList: React.FC<CommentsListProps> = (props) => {
  const {
    comments,
    commentsCount,
    hasMoreComments,
    onGetComments,
    getCommentsLoading,
    pendingComments = [],
    onRetry,
    createCommentLoading,
    ...restCommentProps
  } = props;

  const { polyglot } = useContext(I18nContext);

  return (
    <div className="gt-comments" key="comments">
      <div
        className="gt-pending-comments"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {pendingComments.map((comment) => (
          <div
            className="gt-comment gt-comment-pending"
            key={comment.id}
            aria-busy={comment.status === "sending"}
          >
            <div className="gt-comment-content">
              <div className="gt-comment-header">{comment.user.login}</div>
              <div className="gt-pending-body">{comment.body}</div>
              <p role="status">
                {comment.status === "sending"
                  ? polyglot.t("sending")
                  : `${polyglot.t("send-failed")}: ${comment.error}`}
              </p>
              {comment.status === "failed" && (
                <Button
                  className="gt-btn-retry"
                  text={polyglot.t("retry")}
                  disabled={createCommentLoading}
                  onClick={() => onRetry(comment)}
                />
              )}
            </div>
          </div>
        ))}
      </div>
      <AnimatedComments>
        {comments.map((comment) => (
          <CommentItem
            {...restCommentProps}
            key={comment.id.toString()}
            comment={comment}
            comments={comments}
          />
        ))}
      </AnimatedComments>
      {!commentsCount && !pendingComments.length && (
        <p className="gt-comments-null">{polyglot.t("first-comment-person")}</p>
      )}
      {hasMoreComments ? (
        <div className="gt-comments-controls">
          <Button
            className="gt-btn-loadmore"
            onClick={onGetComments}
            isLoading={getCommentsLoading}
            text={polyglot.t("load-more")}
          />
        </div>
      ) : null}
    </div>
  );
};

export default CommentsList;
