import cn from "classnames";
import type { Octokit } from "octokit";
import React, {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import ArrowDown from "../assets/arrow-down.svg?raw";
import I18nContext from "../contexts/I18nContext";
import type { Comment as CommentType, GitalkProps } from "../interfaces";
import { formatRelativeTime } from "../utils/date";
import type { ReactionContent } from "../utils/reactions";
import Avatar from "./avatar";
import CommentTextarea from "./comment-textarea";
import Reactions from "./reactions";
import Svg from "./svg";

export interface CommentProps
  extends
    React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLDivElement>,
      HTMLDivElement
    >,
    Pick<
      GitalkProps,
      "collapsedHeight" | "highlightAdminComment" | "showAdminLabel"
    > {
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
  octokit: Octokit;
  comments: CommentType[];
  onEdit: (comment: CommentType, body: string) => Promise<void>;
  editLoading: boolean;
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
  showAdminLabel = true,
  octokit,
  comments,
  onEdit,
  editLoading,
  className = "",
  ...restProps
}) => {
  const ref = useRef<HTMLDivElement>(null);

  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const focusLastRef = useRef(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [editError, setEditError] = useState("");
  const saveRequestRef = useRef<object | null>(null);

  const { polyglot, relativeTimeFormat } = useContext(I18nContext);

  const { body_html, created_at, user, reactions } = comment;
  const isEditing = editing && isAuthor;

  useEffect(() => {
    if (!menuOpen) return;
    const closeOutside = (event: MouseEvent) => {
      if (!menuRootRef.current?.contains(event.target as Node))
        setMenuOpen(false);
    };
    document.addEventListener("click", closeOutside);
    return () => document.removeEventListener("click", closeOutside);
  }, [menuOpen]);

  useLayoutEffect(() => {
    if (!menuOpen) return;
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>(
      "[role=menuitem]:not(:disabled)",
    );
    items?.[focusLastRef.current ? items.length - 1 : 0]?.focus();
  }, [menuOpen, isAuthor, isEditing]);

  useEffect(() => {
    if (!isAuthor) {
      setEditing(false);
      setDraft("");
      setEditError("");
    }
    return () => {
      saveRequestRef.current = null;
    };
  }, [isAuthor]);

  const closeMenu = () => {
    setMenuOpen(false);
    triggerRef.current?.focus();
  };

  const onMenuKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (event) => {
    if (!menuOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
      return;
    }
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        "[role=menuitem]:not(:disabled)",
      ) ?? [],
    );
    const index = items.indexOf(event.target as HTMLButtonElement);
    let next: number;
    if (event.key === "ArrowDown") next = (index + 1) % items.length;
    else if (event.key === "ArrowUp")
      next = (index - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else return;
    event.preventDefault();
    items[next]?.focus();
  };

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
  }, [body_html, isEditing]);

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
          collapsed && !isEditing && !menuOpen
            ? { maxHeight: collapsedHeight, overflow: "hidden" }
            : {}
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
            {isAdmin && showAdminLabel && (
              <span className="gt-comment-admin-label">
                {polyglot.t("admin")}
              </span>
            )}
            <div
              className="gt-comment-menu-root"
              ref={menuRootRef}
              onKeyDown={onMenuKeyDown}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node))
                  setMenuOpen(false);
              }}
            >
              <button
                ref={triggerRef}
                type="button"
                className="gt-comment-menu-trigger"
                aria-label={polyglot.t("comment-actions")}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => {
                  focusLastRef.current = false;
                  setMenuOpen((open) => !open);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowDown" && event.key !== "ArrowUp")
                    return;
                  event.preventDefault();
                  event.stopPropagation();
                  focusLastRef.current = event.key === "ArrowUp";
                  setMenuOpen(true);
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  aria-hidden="true"
                  fill="currentColor"
                >
                  <circle cx="3" cy="8" r="1.5" />
                  <circle cx="8" cy="8" r="1.5" />
                  <circle cx="13" cy="8" r="1.5" />
                </svg>
              </button>
              {menuOpen && (
                <div
                  className="gt-comment-menu"
                  role="menu"
                  aria-label={polyglot.t("comment-actions")}
                  ref={menuRef}
                >
                  {isAuthor && (
                    <button
                      type="button"
                      role="menuitem"
                      className="gt-comment-edit"
                      disabled={isEditing}
                      onClick={() => {
                        closeMenu();
                        setDraft(comment.body ?? "");
                        setEditError("");
                        setEditing(true);
                      }}
                    >
                      {polyglot.t("edit")}
                    </button>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    aria-label={polyglot.t("reply")}
                    className="gt-comment-reply"
                    onClick={() => {
                      closeMenu();
                      onReply(comment);
                    }}
                  >
                    {polyglot.t("reply")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        {isEditing ? (
          <CommentTextarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onValueChange={setDraft}
            disabled={editLoading}
            octokit={octokit}
            user={user}
            comments={comments}
            onLogin={() => {}}
            onCreateComment={async (body) => {
              if (!body.trim() || editLoading || saveRequestRef.current) return;
              const request = {};
              saveRequestRef.current = request;
              setEditError("");
              try {
                await onEdit(comment, body);
                if (saveRequestRef.current === request) setEditing(false);
              } catch (error) {
                if (saveRequestRef.current === request)
                  setEditError(
                    error instanceof Error ? error.message : String(error),
                  );
              } finally {
                if (saveRequestRef.current === request)
                  saveRequestRef.current = null;
              }
            }}
            createCommentLoading={editLoading}
            onPreviewError={(error) => setEditError(String(error))}
            onCancel={() => {
              setEditing(false);
              setDraft("");
              setEditError("");
              triggerRef.current?.focus();
            }}
          />
        ) : (
          <div
            className="gt-comment-body markdown-body"
            dangerouslySetInnerHTML={{ __html: body_html ?? "" }}
          />
        )}
        {isEditing && editError && (
          <p className="gt-comment-edit-error gt-error" role="alert">
            {editError}
          </p>
        )}
        {!isEditing && (
          <Reactions
            reactions={reactions}
            canReact={canReact}
            loading={reactionLoading}
            onReaction={(add, content) => onReaction(add, content, comment)}
          />
        )}
        {collapsed && !isEditing && (
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
