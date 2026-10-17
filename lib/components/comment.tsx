import cn from "classnames";
import React, {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import ArrowDown from "../assets/arrow-down.svg?raw";
import Edit from "../assets/edit.svg?raw";
import Reply from "../assets/reply.svg?raw";
import I18nContext from "../contexts/I18nContext";
import type { Comment as CommentType, GitalkProps } from "../interfaces";
import { formatRelativeTime } from "../utils/date";
import type { ReactionContent } from "../utils/reactions";
import Avatar from "./avatar";
import Reactions from "./reactions";
import Svg from "./svg";

export interface CommentProps
  extends
    React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLDivElement>,
      HTMLDivElement
    >,
    Pick<GitalkProps, "collapsedHeight" | "highlightAdminComment"> {
  comment: CommentType;
  isAuthor: boolean;
  isAdmin: boolean;
  canReact: boolean;
  onReply: (comment: CommentType) => void;
  onReaction: (
    add: boolean,
    content: ReactionContent,
    comment: CommentType,
  ) => void;
  reactionLoading: boolean;
}

const Comment: React.FC<CommentProps> = ({
  comment,
  isAuthor,
  isAdmin,
  canReact,
  onReply,
  onReaction,
  reactionLoading,
  collapsedHeight,
  highlightAdminComment,
  className = "",
  ...restProps
}) => {
  const ref = useRef<HTMLDivElement>(null);

  const [collapsed, setCollapsed] = useState<boolean>(false);

  const { polyglot, relativeTimeFormat } = useContext(I18nContext);

  const { body_html, created_at, user, reactions, html_url } = comment;
  const commentHtmlUrl = html_url.includes("github.com")
    ? html_url
    : `https://github.com/${html_url}`;

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

  useLayoutEffect(() => {
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
      className={cn(
        "gt-comment",
        {
          "gt-comment-admin": isAdmin,
          "gt-comment-admin--highlight": isAdmin && highlightAdminComment,
        },
        className,
      )}
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
              {formatRelativeTime(created_at, relativeTimeFormat)}
            </span>
          </div>
          <div className="gt-comment-actions">
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
            <button
              type="button"
              aria-label="Reply"
              className="gt-comment-reply"
              title="Reply"
              onClick={() => onReply(comment)}
            >
              <Svg className="gt-ico-reply" icon={Reply} />
            </button>
          </div>
        </div>
        <div
          className="gt-comment-body markdown-body"
          dangerouslySetInnerHTML={{
            __html: body_html ?? "",
          }}
        />
        <Reactions
          reactions={reactions}
          canReact={canReact}
          loading={reactionLoading}
          onReaction={(add, content) => onReaction(add, content, comment)}
        />
        {collapsed && (
          <button
            type="button"
            aria-label="Expand comment"
            className="gt-comment-collapse"
            onClick={() => setCollapsed(false)}
          >
            <Svg className="gt-ico-collapse" icon={ArrowDown} />
          </button>
        )}
      </div>
    </div>
  );
};

export default Comment;
