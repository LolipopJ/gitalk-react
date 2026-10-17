import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  type ReactionContent,
  REACTIONS,
  type Reactions as ReactionStates,
} from "../utils/reactions";

interface ReactionsProps {
  reactions: ReactionStates;
  canReact: boolean;
  loading: boolean;
  onReaction: (add: boolean, content: ReactionContent) => void;
}

const Reactions: React.FC<ReactionsProps> = ({
  reactions,
  canReact,
  loading,
  onReaction,
}) => {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const pickerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const ReactionTag = canReact ? "button" : "span";

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };
  const toggleReaction = (content: ReactionContent) => {
    if (!canReact || loading) return;
    close();
    onReaction(!reactions[content].viewerHasReacted, content);
  };

  useLayoutEffect(() => {
    if (canReact && open)
      menuRef.current
        ?.querySelectorAll<HTMLButtonElement>("button")
        [activeIndex]?.focus();
  }, [canReact, open, activeIndex]);

  useEffect(() => {
    if (!canReact) {
      setOpen(false);
      return;
    }
    if (!open) return;
    const dismiss = (event: MouseEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("click", dismiss);
    return () => document.removeEventListener("click", dismiss);
  }, [canReact, open]);

  return (
    <div
      className="gt-comment-reactions"
      role="group"
      aria-label="Reactions"
      aria-busy={loading}
    >
      {canReact && (
        <div
          className="gt-reaction-picker"
          ref={pickerRef}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node))
              setOpen(false);
          }}
          onKeyDown={(event) => {
            if (
              !open ||
              event.ctrlKey ||
              event.metaKey ||
              event.altKey ||
              event.shiftKey
            )
              return;
            if (event.key === "Escape") {
              event.preventDefault();
              close();
            } else if (
              ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
            ) {
              event.preventDefault();
              setActiveIndex(
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? REACTIONS.length - 1
                    : (activeIndex +
                        (event.key === "ArrowRight" ? 1 : -1) +
                        REACTIONS.length) %
                      REACTIONS.length,
              );
            }
          }}
        >
          <button
            type="button"
            className="gt-reaction-add"
            ref={triggerRef}
            aria-label="Add reaction"
            title="Add reaction"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-disabled={loading}
            onClick={() => {
              if (loading) return;
              setActiveIndex(0);
              setOpen((previous) => !previous);
            }}
            onKeyDown={(event) => {
              if (
                !loading &&
                (event.key === "ArrowDown" || event.key === "ArrowUp") &&
                !event.ctrlKey &&
                !event.metaKey &&
                !event.altKey &&
                !event.shiftKey
              ) {
                event.preventDefault();
                setActiveIndex(
                  event.key === "ArrowUp" ? REACTIONS.length - 1 : 0,
                );
                setOpen(true);
              }
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M8.6 1.9A6.25 6.25 0 1 0 13.7 7M12.5 1v5M10 3.5h5M4.8 10a3.2 3.2 0 0 0 5.4 0" />
              <circle
                cx="5.2"
                cy="7.2"
                r=".7"
                fill="currentColor"
                stroke="none"
              />
              <circle
                cx="9.8"
                cy="7.2"
                r=".7"
                fill="currentColor"
                stroke="none"
              />
            </svg>
          </button>
          {open && (
            <div
              className="gt-reaction-menu"
              ref={menuRef}
              role="menu"
              aria-label="Choose a reaction"
              aria-orientation="horizontal"
            >
              {REACTIONS.map(({ content, emoji, label }, index) => (
                <button
                  key={content}
                  type="button"
                  className="gt-reaction-option"
                  data-reaction={content}
                  role="menuitemcheckbox"
                  aria-label={label}
                  aria-checked={reactions[content].viewerHasReacted}
                  title={label}
                  tabIndex={index === activeIndex ? 0 : -1}
                  disabled={loading}
                  onFocus={() => setActiveIndex(index)}
                  onClick={() => toggleReaction(content)}
                >
                  <span aria-hidden="true">{emoji}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {REACTIONS.filter(({ content }) => reactions[content].totalCount > 0).map(
        ({ content, emoji, label }) => (
          <ReactionTag
            key={content}
            type={canReact ? "button" : undefined}
            className="gt-comment-reaction"
            role={canReact ? undefined : "img"}
            data-reaction={content}
            aria-label={`${label}: ${reactions[content].totalCount}`}
            aria-pressed={
              canReact ? reactions[content].viewerHasReacted : undefined
            }
            title={label}
            disabled={canReact ? loading : undefined}
            onClick={canReact ? () => toggleReaction(content) : undefined}
          >
            <span aria-hidden="true">{emoji}</span>{" "}
            {reactions[content].totalCount}
          </ReactionTag>
        ),
      )}
    </div>
  );
};

export default Reactions;
