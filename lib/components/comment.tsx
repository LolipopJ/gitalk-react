import { formatDistanceToNow, parseISO } from "date-fns";
import React, { useContext, useEffect, useMemo, useRef, useState } from "react";

import ArrowDown from "../assets/arrow-down.svg?raw";
import Edit from "../assets/edit.svg?raw";
import Heart from "../assets/heart.svg?raw";
import HeartFilled from "../assets/heart-filled.svg?raw";
import Reply from "../assets/reply.svg?raw";
import I18nContext from "../contexts/I18nContext";
import type { Comment as CommentType, GitalkProps } from "../interfaces";
import Avatar from "./avatar";
import Svg from "./svg";

export interface CommentProps
  extends React.DetailedHTMLProps<
    React.HTMLAttributes<HTMLDivElement>,
    HTMLDivElement
  > {
  comment: CommentType;
  isAuthor: boolean;
  isAdmin: boolean;
  onReply: (comment: CommentType) => void;
  onLike: (like: boolean, comment: CommentType) => void;
  likeLoading: boolean;
  collapsedHeight?: GitalkProps["collapsedHeight"];
}

const Comment: React.FC<CommentProps> = ({
  comment,
  isAuthor,
  isAdmin,
  onReply,
  onLike,
  likeLoading,
  collapsedHeight,
  className = "",
  ...restProps
}) => {
  const ref = useRef<HTMLDivElement>(null);

  const [collapsed, setCollapsed] = useState<boolean>(false);

  const { language, polyglot, dateFnsLocaleMap } = useContext(I18nContext);

  const { body_html, created_at, user, reactionsHeart, html_url } = comment;
  const commentHtmlUrl = html_url.includes("github.com")
    ? html_url
    : `https://github.com/${html_url}`;

  const reactionsHeartCountText = useMemo(() => {
    const totalCount = reactionsHeart?.totalCount ?? 0;
    return totalCount > 100 ? "100+" : String(totalCount);
  }, [reactionsHeart]);

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

  useEffect(() => {
    const commentElement = ref.current;

    if (commentElement && collapsedHeight) {
      const commentElementHeight = commentElement.clientHeight;
      if (commentElementHeight > collapsedHeight) {
        setCollapsed(true);
      }
    }
  }, [collapsedHeight]);

  return (
    <div
      ref={ref}
      className={`gt-comment ${isAdmin ? "gt-comment-admin" : ""} ${className}`}
      {...restProps}
    >
      <Avatar
        className="gt-comment-avatar"
        src={user?.avatar_url}
        alt={user?.login}
        href={user?.html_url}
      />

      <div
        className="gt-comment-content"
        style={
          collapsed ? { maxHeight: collapsedHeight, overflow: "hidden" } : {}
        }
      >
        <div className="gt-comment-header">
          <a
            className="gt-comment-username"
            href={user?.html_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {user?.login}
          </a>
          <div className="gt-comment-date" title={created_at}>
            <span className="gt-comment-date__prefix">
              {polyglot.t("commented")}
            </span>
            <span className="gt-comment-date__time">
              {formatDistanceToNow(parseISO(created_at), {
                addSuffix: true,
                locale: dateFnsLocaleMap[language],
              })}
            </span>
          </div>
          <div className="gt-comment-actions">
            <a
              className="gt-comment-like"
              title="Like"
              onClick={() => {
                if (reactionsHeart && !likeLoading)
                  onLike(!reactionsHeart.viewerHasReacted, comment);
              }}
            >
              <Svg
                className="gt-ico-heart"
                icon={reactionsHeart?.viewerHasReacted ? HeartFilled : Heart}
                text={reactionsHeartCountText}
              />
            </a>
            {isAuthor && (
              // TODO: 支持在 Gitalk 里编辑
              <a
                href={commentHtmlUrl}
                className="gt-comment-edit"
                title="Edit"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Svg className="gt-ico-edit" icon={Edit} />
              </a>
            )}
            <a
              className="gt-comment-reply"
              title="Reply"
              onClick={() => onReply(comment)}
            >
              <Svg className="gt-ico-reply" icon={Reply} />
            </a>
          </div>
        </div>
        <div
          className="gt-comment-body markdown-body"
          dangerouslySetInnerHTML={{
            __html: body_html ?? "",
          }}
        />
        {collapsed && (
          <div
            className="gt-comment-collapse"
            onClick={() => setCollapsed(false)}
          >
            <Svg className="gt-ico-collapse" icon={ArrowDown} />
          </div>
        )}
      </div>
    </div>
  );
};

export default Comment;
