import { useRequest } from "ahooks";
import type { Octokit } from "octokit";
import React, {
  forwardRef,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import Github from "../assets/github.svg?raw";
import Tip from "../assets/tip.svg?raw";
import I18nContext from "../contexts/I18nContext";
import type { Comment } from "../interfaces";
import {
  findMention,
  type Mention,
  mentionCandidates,
  replaceMention,
} from "../utils/mentions";
import Avatar from "./avatar";
import Button from "./button";
import Svg from "./svg";

interface CommentTextareaProps extends React.DetailedHTMLProps<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  HTMLTextAreaElement
> {
  value: string;
  octokit: Octokit;
  user?: Comment["user"];
  onLogin: () => void;
  onCreateComment: (comment: string) => Promise<void>;
  createCommentLoading: boolean;
  onPreviewError: (error: unknown) => void;
  comments: Comment[];
  onValueChange: (value: string) => void;
  onCancel?: () => void;
}

let nextMentionId = 0;

const CommentTextarea = forwardRef<HTMLTextAreaElement, CommentTextareaProps>(
  (props, ref) => {
    const {
      value: inputComment,
      octokit,
      user,
      onLogin,
      onCreateComment,
      createCommentLoading,
      onPreviewError,
      comments = [],
      onValueChange,
      onCancel,
      onChange,
      onKeyDown,
      onSelect,
      onBlur,
      onCompositionStart,
      onCompositionEnd,
      ...restProps
    } = props;

    const { polyglot } = useContext(I18nContext);

    const [isPreviewComment, setIsPreviewComment] = useState<boolean>(false);
    const [listId] = useState(() => `gt-mentions-${++nextMentionId}`);
    const inputRef = useRef<HTMLTextAreaElement | null>(null);
    useLayoutEffect(() => {
      const textarea = inputRef.current;
      if (!textarea || isPreviewComment) return;
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight + 2}px`;
    }, [inputComment, isPreviewComment]);
    const composingRef = useRef(false);
    const caretRef = useRef<number | null>(null);
    const completedMentionRef = useRef<{ value: string; caret: number } | null>(
      null,
    );
    const [mention, setMention] = useState<
      (Mention & { value: string }) | null
    >(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const candidates =
      mention && mention.value === inputComment && !isPreviewComment
        ? mentionCandidates(comments, mention.query)
        : [];
    const selectedIndex = Math.min(
      activeIndex,
      Math.max(0, candidates.length - 1),
    );
    const updateMention = (textarea: HTMLTextAreaElement) => {
      const completed = completedMentionRef.current;
      const next =
        composingRef.current ||
        (completed?.value === textarea.value &&
          completed.caret === textarea.selectionStart)
          ? null
          : findMention(
              textarea.value,
              textarea.selectionStart,
              textarea.selectionEnd,
            );
      setMention(next ? { ...next, value: textarea.value } : null);
      setActiveIndex(0);
    };
    const chooseMention = (login: string) => {
      if (!mention) return;
      const result = replaceMention(inputComment, mention, login);
      completedMentionRef.current = {
        value: result.value,
        caret: result.caret,
      };
      caretRef.current = result.caret;
      onValueChange(result.value);
      setMention(null);
    };
    useLayoutEffect(() => {
      if (caretRef.current !== null) {
        inputRef.current?.focus();
        inputRef.current?.setSelectionRange(caretRef.current, caretRef.current);
        caretRef.current = null;
      }
    }, [inputComment, mention]);

    const prevInputCommentRef = useRef<string>();
    const prevCommentHtmlRef = useRef<string>("");

    const {
      data: commentHtml = "",
      loading: getCommentHtmlLoading,
      run: runGetCommentHtml,
      cancel: cancelGetCommentHtml,
    } = useRequest(
      async (text: string): Promise<string> => {
        if (prevInputCommentRef.current === text)
          return prevCommentHtmlRef.current;

        const getPreviewedHtmlRes = await octokit.request("POST /markdown", {
          text,
        });

        return getPreviewedHtmlRes.data;
      },
      {
        manual: true,
        onSuccess: (html, [text]) => {
          prevInputCommentRef.current = text;
          prevCommentHtmlRef.current = html;
          setIsPreviewComment(true);
        },
        onError: onPreviewError,
      },
    );

    useEffect(() => {
      cancelGetCommentHtml();
      setIsPreviewComment(false);
    }, [inputComment, cancelGetCommentHtml]);

    const onCommentInputPreview: React.MouseEventHandler<
      HTMLButtonElement
    > = () => {
      setMention(null);
      if (isPreviewComment || getCommentHtmlLoading) {
        cancelGetCommentHtml();
        setIsPreviewComment(false);
      } else {
        runGetCommentHtml(inputComment);
      }
    };

    return (
      <div
        className={onCancel ? "gt-header gt-comment-editor" : "gt-header"}
        key="header"
      >
        {onCancel ? null : user ? (
          <Avatar
            className="gt-header-avatar"
            src={user.avatar_url}
            alt={user.login}
            href={user.html_url}
          />
        ) : (
          <button
            type="button"
            aria-label={polyglot.t("login-with-github")}
            className="gt-avatar-github"
            onClick={onLogin}
          >
            <Svg className="gt-ico-github" icon={Github} />
          </button>
        )}
        <div className="gt-header-comment">
          <textarea
            aria-label={polyglot.t("comment")}
            autoFocus={!!onCancel}
            {...restProps}
            ref={(element) => {
              inputRef.current = element;
              if (typeof ref === "function") ref(element);
              else if (ref) ref.current = element;
            }}
            value={inputComment}
            aria-autocomplete="list"
            aria-haspopup="listbox"
            aria-controls={candidates.length ? listId : undefined}
            aria-activedescendant={
              candidates.length ? `${listId}-${selectedIndex}` : undefined
            }
            onChange={(event) => {
              completedMentionRef.current = null;
              onChange?.(event);
              updateMention(event.currentTarget);
            }}
            onSelect={(event) => {
              onSelect?.(event);
              updateMention(event.currentTarget);
            }}
            onBlur={(event) => {
              onBlur?.(event);
              setMention(null);
            }}
            onCompositionStart={(event) => {
              composingRef.current = true;
              setMention(null);
              onCompositionStart?.(event);
            }}
            onCompositionEnd={(event) => {
              composingRef.current = false;
              updateMention(event.currentTarget);
              onCompositionEnd?.(event);
            }}
            onKeyDown={(event) => {
              if (
                composingRef.current ||
                event.nativeEvent.isComposing ||
                event.keyCode === 229
              )
                return;
              if (
                candidates.length &&
                !event.ctrlKey &&
                !event.metaKey &&
                !event.shiftKey &&
                !event.altKey
              ) {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  setActiveIndex(
                    (selectedIndex +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      candidates.length) %
                      candidates.length,
                  );
                  return;
                }
                if (event.key === "Enter" || event.key === "Tab") {
                  event.preventDefault();
                  chooseMention(candidates[selectedIndex]!);
                  return;
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setMention(null);
                  return;
                }
              }
              onKeyDown?.(event);
            }}
            className="gt-header-textarea"
            style={{ display: isPreviewComment ? "none" : undefined }}
          />
          {candidates.length > 0 && (
            <ul
              id={listId}
              className="gt-mentions"
              role="listbox"
              aria-label="Mention suggestions"
            >
              {candidates.map((login, index) => (
                <li
                  key={login}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={selectedIndex === index}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseMention(login)}
                >
                  @{login}
                </li>
              ))}
            </ul>
          )}
          <div
            className="gt-header-preview markdown-body"
            style={{ display: isPreviewComment ? undefined : "none" }}
            dangerouslySetInnerHTML={{
              __html: commentHtml,
            }}
          />
          <div className="gt-header-controls">
            {!onCancel && (
              <a
                className="gt-header-controls-tip"
                href="https://guides.github.com/features/mastering-markdown/"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Svg
                  className="gt-ico-tip"
                  icon={Tip}
                  text={polyglot.t("support-markdown")}
                />
              </a>
            )}

            <Button
              className="gt-btn-preview gt-btn--secondary"
              onClick={onCommentInputPreview}
              text={
                isPreviewComment || getCommentHtmlLoading
                  ? polyglot.t("edit")
                  : polyglot.t("preview")
              }
              isLoading={getCommentHtmlLoading}
              disabled={false}
            />

            {onCancel && (
              <Button
                className="gt-btn-cancel gt-btn--secondary"
                onClick={onCancel}
                text={polyglot.t("cancel")}
                disabled={createCommentLoading}
              />
            )}

            {user ? (
              <Button
                className="gt-btn-public"
                onClick={async () => {
                  await onCreateComment(inputComment);
                  setIsPreviewComment(false);
                }}
                text={polyglot.t(onCancel ? "save" : "comment")}
                isLoading={createCommentLoading}
                disabled={createCommentLoading || !inputComment.trim()}
              />
            ) : (
              <Button
                className="gt-btn-login"
                onClick={onLogin}
                text={polyglot.t("login-with-github")}
              />
            )}
          </div>
        </div>
      </div>
    );
  },
);

CommentTextarea.displayName = "CommentTextarea";

export default CommentTextarea;
