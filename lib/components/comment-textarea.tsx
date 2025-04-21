import { useRequest } from "ahooks";
import type { Octokit } from "octokit";
import React, { forwardRef, useContext, useRef, useState } from "react";

import Github from "../assets/github.svg?raw";
import Tip from "../assets/tip.svg?raw";
import I18nContext from "../contexts/I18nContext";
import type { User } from "../interfaces";
import Avatar from "./avatar";
import Button from "./button";
import Svg from "./svg";

interface CommentTextareaProps
  extends React.DetailedHTMLProps<
    React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    HTMLTextAreaElement
  > {
  value: string;
  octokit: Octokit;
  user?: User;
  onLogin: () => void;
  onCreateComment: (comment: string) => Promise<void>;
  createCommentLoading: boolean;
  onPreviewError: (error: unknown) => void;
}

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
      ...restProps
    } = props;

    const { polyglot } = useContext(I18nContext);

    const [isPreviewComment, setIsPreviewComment] = useState<boolean>(false);

    const prevInputCommentRef = useRef<string>();

    const {
      data: commentHtml = "",
      loading: getCommentHtmlLoading,
      run: runGetCommentHtml,
    } = useRequest(
      async (): Promise<string> => {
        if (prevInputCommentRef.current === inputComment) return commentHtml;

        const getPreviewedHtmlRes = await octokit.request("POST /markdown", {
          text: inputComment,
        });

        if (getPreviewedHtmlRes.status === 200) {
          prevInputCommentRef.current = inputComment;

          const _commentHtml = getPreviewedHtmlRes.data;
          return _commentHtml;
        } else {
          onPreviewError(getPreviewedHtmlRes);
          return "";
        }
      },
      {
        manual: true,
      },
    );

    const onCommentInputPreview: React.MouseEventHandler<
      HTMLButtonElement
    > = () => {
      if (isPreviewComment) {
        setIsPreviewComment(false);
      } else {
        setIsPreviewComment(true);
        runGetCommentHtml();
      }
    };

    return (
      <div className="gt-header" key="header">
        {user ? (
          <Avatar
            className="gt-header-avatar"
            src={user.avatar_url}
            alt={user.login}
            href={user.html_url}
          />
        ) : (
          <a className="gt-avatar-github" onClick={onLogin}>
            <Svg className="gt-ico-github" icon={Github} />
          </a>
        )}
        <div className="gt-header-comment">
          <textarea
            {...restProps}
            ref={ref}
            value={inputComment}
            className="gt-header-textarea"
            style={{ display: isPreviewComment ? "none" : undefined }}
          />
          <div
            className="gt-header-preview markdown-body"
            style={{ display: isPreviewComment ? undefined : "none" }}
            dangerouslySetInnerHTML={{
              __html: getCommentHtmlLoading
                ? "<span>Loading preview...</span>"
                : commentHtml,
            }}
          />
          <div className="gt-header-controls">
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

            <Button
              className="gt-btn-preview gt-btn--secondary"
              onClick={onCommentInputPreview}
              text={
                isPreviewComment ? polyglot.t("edit") : polyglot.t("preview")
              }
              isLoading={getCommentHtmlLoading}
              disabled={false}
            />

            {user ? (
              <Button
                className="gt-btn-public"
                onClick={async () => {
                  await onCreateComment(inputComment);
                  setIsPreviewComment(false);
                }}
                text={polyglot.t("comment")}
                isLoading={createCommentLoading}
                disabled={createCommentLoading || !inputComment}
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

export default CommentTextarea;
