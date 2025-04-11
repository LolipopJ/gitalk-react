import React, { useEffect, useRef } from "react";

import Edit from "../assets/edit.svg?raw";
import Heart from "../assets/heart.svg?raw";
import HeartFilled from "../assets/heart-filled.svg?raw";
import Reply from "../assets/reply.svg?raw";
import { GitalkProps } from "../gitalk";
import Avatar from "./avatar";
import Svg from "./svg";

export interface CommentProps
  extends Pick<GitalkProps, "admin" | "language">,
    React.HTMLAttributes<HTMLDivElement> {
  comment: any;
  user: any;
  repliedText?: string;
  onLike?: (like: boolean) => void;
  onReply?: (comment: string) => void;
}

const Comment: React.FC<CommentProps> = ({
  comment,
  user,
  repliedText,
  onLike,
  onReply,
  admin,
  language,
  className,
  ...restProps
}) => {
  const ref = useRef<HTMLDivElement>(null);

  const {
    user: { login: commentAuthor },
    reactions,
  } = comment;
  const currentUser = user.login;

  const isCommentAuthor = commentAuthor === currentUser;
  const isAdmin = admin.find(
    (username) => username.toLowerCase() === commentAuthor.toLowerCase(),
  );

  let reactionTotalCount = "";
  if (reactions?.totalCount) {
    reactionTotalCount = String(reactions.totalCount);
    if (reactions.totalCount === 100 && reactions.pageInfo?.hasNextPage) {
      reactionTotalCount = "100+";
    }
  }

  useEffect(() => {
    const commentElement = ref.current;

    if (commentElement) {
      const emailResponse = commentElement.querySelector(
        ".email-hidden-toggle>a",
      );

      if (emailResponse) {
        const onEmailClick = (e: Event) => {
          e.preventDefault();
          commentElement
            ?.querySelector(".email-hidden-reply")
            ?.classList.toggle("expanded");
        };
        emailResponse.addEventListener("click", onEmailClick, true);

        return () =>
          emailResponse.removeEventListener("click", onEmailClick, true);
      }
    }

    return () => {};
  }, []);

  return (
    <div
      ref={ref}
      className={`gt-comment ${isAdmin ? "gt-comment-admin" : ""} ${className}`}
      {...restProps}
    >
      <Avatar
        className="gt-comment-avatar"
        src={comment.user && comment.user.avatar_url}
        alt={comment.user && comment.user.login}
      />

      <div className="gt-comment-content">
        <div className="gt-comment-header">
          <div className={`gt-comment-block-${user ? "2" : "1"}`} />
          <a
            className="gt-comment-username"
            href={comment.user && comment.user.html_url}
          >
            {comment.user && comment.user.login}
          </a>
          <span className="gt-comment-text">{repliedText}</span>
          <span className="gt-comment-date">
            {new Date(comment.created_at).toISOString()}
          </span>
          {onLike && (
            <a
              className="gt-comment-like"
              title="Like"
              onClick={() => onLike(!reactions?.viewerHasReacted)}
            >
              {reactions?.viewerHasReacted ? (
                <Svg
                  className="gt-ico-heart"
                  icon={HeartFilled}
                  text={reactionTotalCount}
                ></Svg>
              ) : (
                <Svg
                  className="gt-ico-heart"
                  icon={Heart}
                  text={reactionTotalCount}
                />
              )}
            </a>
          )}
          {isCommentAuthor && (
            // TODO: 支持在 Gitalk 里编辑
            <a
              href={comment.html_url}
              className="gt-comment-edit"
              title="Edit"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Svg className="gt-ico-edit" icon={Edit} />
            </a>
          )}
          {onReply && (
            <a
              className="gt-comment-reply"
              title="Reply"
              onClick={() => {
                onReply(comment);
              }}
            >
              <Svg className="gt-ico-reply" icon={Reply} />
            </a>
          )}
        </div>
        <div
          className="gt-comment-body markdown-body"
          dangerouslySetInnerHTML={{
            __html: comment.body_html,
          }}
        />
      </div>
    </div>
  );
};

export default Comment;
