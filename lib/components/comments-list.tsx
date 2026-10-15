import React, { useContext } from "react";

import I18nContext from "../contexts/I18nContext";
import type { Comment as CommentType, GitalkProps, User } from "../interfaces";
import AnimatedComments from "./animated-comments";
import Button from "./button";
import Comment, { type CommentProps } from "./comment";

interface CommentItemProps
  extends
    Pick<
      CommentProps,
      | "comment"
      | "onReply"
      | "likeLoading"
      | "collapsedHeight"
      | "highlightAdminComment"
    >,
    Pick<GitalkProps, "admin"> {
  onLike: (like: boolean, commentId: CommentType["id"]) => void;
  user?: User;
}

const CommentItem: React.FC<CommentItemProps> = ({
  comment,
  user,
  admin,
  onLike,
  ...restProps
}) => {
  const { id: commentId, user: commentAuthor } = comment;

  const commentAuthorName = commentAuthor?.login;
  const isAuthor =
    !!user && !!commentAuthorName && user.login === commentAuthorName;
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
      onLike={(like) => {
        onLike(like, commentId);
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
}

const CommentsList: React.FC<CommentsListProps> = (props) => {
  const {
    comments,
    commentsCount,
    hasMoreComments,
    onGetComments,
    getCommentsLoading,
    ...restCommentProps
  } = props;

  const { polyglot } = useContext(I18nContext);

  return (
    <div className="gt-comments" key="comments">
      <AnimatedComments>
        {comments.map((comment) => (
          <CommentItem
            {...restCommentProps}
            key={comment.id.toString()}
            comment={comment}
          />
        ))}
      </AnimatedComments>
      {!commentsCount && (
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
