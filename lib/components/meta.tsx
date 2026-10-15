import cn from "classnames";
import React, { useContext, useEffect, useRef, useState } from "react";

import ArrowDown from "../assets/arrow-down.svg?raw";
import { HOMEPAGE, VERSION } from "../constants";
import I18nContext from "../contexts/I18nContext";
import type { GitalkProps, Issue, User } from "../interfaces";
import Action from "./action";
import Svg from "./svg";

interface MetaProps extends Pick<GitalkProps, "pagerDirection"> {
  issue?: Issue;
  user?: User;
  commentsCount: number;
  onPagerDirectionChange: (
    direction: NonNullable<GitalkProps["pagerDirection"]>,
  ) => void;
  onLogin: () => void;
  onLogout: () => void;
}

const Meta: React.FC<MetaProps> = (props) => {
  const {
    issue,
    user,
    commentsCount,
    pagerDirection,
    onPagerDirectionChange,
    onLogin,
    onLogout,
  } = props;

  const { polyglot } = useContext(I18nContext);

  const [showPopup, setShowPopup] = useState<boolean>(false);

  const popupRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!showPopup) return;

    const hidePopup = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !popupRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        setShowPopup(false);
      }
    };

    document.addEventListener("click", hidePopup);
    return () => document.removeEventListener("click", hidePopup);
  }, [showPopup]);

  return (
    <div
      className="gt-meta"
      key="meta"
      onKeyDown={(event) => {
        if (event.key === "Escape" && showPopup) {
          event.preventDefault();
          setShowPopup(false);
          triggerRef.current?.focus();
        }
      }}
    >
      <span
        className="gt-counts"
        dangerouslySetInnerHTML={{
          __html: polyglot.t("counts", {
            counts: `<a class="gt-link gt-link-counts" href="${issue?.html_url}" target="_blank" rel="noopener noreferrer">${commentsCount}</a>`,
            smart_count: commentsCount,
          }),
        }}
      />
      {showPopup && (
        <div className="gt-popup" ref={popupRef}>
          {user
            ? [
                <Action
                  key="sort-asc"
                  className={cn("gt-action-sortasc", {
                    "is--active": pagerDirection === "first",
                  })}
                  onClick={() => onPagerDirectionChange("first")}
                  text={polyglot.t("sort-asc")}
                />,
                <Action
                  key="sort-desc"
                  className={cn("gt-action-sortdesc", {
                    "is--active": pagerDirection === "last",
                  })}
                  onClick={() => onPagerDirectionChange("last")}
                  text={polyglot.t("sort-desc")}
                />,
              ]
            : null}
          {user ? (
            <Action
              className="gt-action-logout"
              onClick={onLogout}
              text={polyglot.t("logout")}
            />
          ) : (
            <button
              type="button"
              className="gt-action gt-action-login"
              onClick={onLogin}
            >
              {polyglot.t("login-with-github")}
            </button>
          )}
          <div className="gt-copyright">
            <a
              className="gt-link gt-link-project"
              href={HOMEPAGE}
              target="_blank"
              rel="noopener noreferrer"
            >
              GitalkR
            </a>
            <span className="gt-version">{VERSION}</span>
          </div>
        </div>
      )}
      <div className="gt-user">
        <button
          type="button"
          ref={triggerRef}
          aria-expanded={showPopup}
          className={cn("gt-user-inner", { "is--poping": showPopup })}
          onClick={() => setShowPopup((visible) => !visible)}
        >
          <span className="gt-user-name">
            {user?.login ?? polyglot.t("anonymous")}
          </span>
          <Svg className="gt-ico-arrdown" icon={ArrowDown} />
        </button>
      </div>
    </div>
  );
};

export default Meta;
