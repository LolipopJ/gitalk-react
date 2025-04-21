import React, { forwardRef, useContext } from "react";
import FlipMove from "react-flip-move";

import I18nContext from "../contexts/I18nContext";
import type { Comment as CommentType, GitalkProps, User } from "../interfaces";
import Button from "./button";
import Comment, { type CommentProps } from "./comment";

interface CommentWithForwardedRefProps
  extends Pick<
    CommentProps,
    "comment" | "onReply" | "likeLoading" | "collapsedHeight"
  > {
  onLike: (like: boolean, commentId: number, heartReactionId?: number) => void;
  user?: User;
  admin: GitalkProps["admin"];
}

// Why forwardRef? https://www.npmjs.com/package/react-flip-move#usage-with-functional-components
const CommentWithForwardedRef = forwardRef<
  HTMLDivElement,
  CommentWithForwardedRefProps
>(({ comment, user, admin, onLike, ...restProps }, ref) => {
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
      (username) => username.toLowerCase() === commentAuthorName.toLowerCase(),
    );
  const heartReactionId = commentReactionsHeart?.nodes.find(
    (node) => node.user.login === user?.login,
  )?.databaseId;

  return (
    <div ref={ref}>
      <Comment
        {...restProps}
        comment={comment}
        isAuthor={isAuthor}
        isAdmin={isAdmin}
        onLike={(like) => {
          onLike(like, commentId, heartReactionId);
        }}
      />
    </div>
  );
});

interface CommentsListProps
  extends Pick<GitalkProps, "flipMoveOptions">,
    Omit<CommentWithForwardedRefProps, "comment"> {
  comments: CommentType[];
  commentsCount: number;
  onGetComments: () => void;
  getCommentsLoading: boolean;
}

const CommentsList: React.FC<CommentsListProps> = (props) => {
  const {
    comments,
    commentsCount,
    onGetComments,
    getCommentsLoading,
    flipMoveOptions,
    ...restCommentProps
  } = props;

  const { polyglot } = useContext(I18nContext);

  return (
    <div className="gt-comments" key="comments">
      <FlipMove {...flipMoveOptions}>
        {comments.map((comment) => (
          <CommentWithForwardedRef
            {...restCommentProps}
            key={comment.id}
            comment={comment}
          />
        ))}
      </FlipMove>
      {!commentsCount && (
        <p className="gt-comments-null">{polyglot.t("first-comment-person")}</p>
      )}
      {commentsCount > comments.length ? (
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
