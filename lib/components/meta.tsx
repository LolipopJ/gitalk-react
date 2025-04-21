import React, { useCallback, useContext, useState } from "react";

import ArrowDown from "../assets/arrow-down.svg?raw";
import { HOMEPAGE, VERSION } from "../constants";
import I18nContext from "../contexts/I18nContext";
import type { GitalkProps, Issue, User } from "../interfaces";
import { hasClassInParent } from "../utils/dom";
import Action from "./action";
import Svg from "./svg";

interface MetaProps {
  issue?: Issue;
  user?: User;
  commentsCount: number;
  pagerDirection: GitalkProps["pagerDirection"];
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

  const hidePopup = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target && hasClassInParent(target, "gt-user", "gt-popup")) {
      return;
    }
    document.removeEventListener("click", hidePopup);
    setShowPopup(false);
  }, []);

  const onShowOrHidePopup: React.MouseEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();

    setShowPopup((visible) => {
      if (visible) {
        document.removeEventListener("click", hidePopup);
      } else {
        document.addEventListener("click", hidePopup);
      }
      return !visible;
    });
  };

  return (
    <div className="gt-meta" key="meta">
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
        <div className="gt-popup">
          {user
            ? [
                <Action
                  key="sort-asc"
                  className={`gt-action-sortasc${pagerDirection === "first" ? " is--active" : ""}`}
                  onClick={() => onPagerDirectionChange("first")}
                  text={polyglot.t("sort-asc")}
                />,
                <Action
                  key="sort-desc"
                  className={`gt-action-sortdesc${pagerDirection === "last" ? " is--active" : ""}`}
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
            <a className="gt-action gt-action-login" onClick={onLogin}>
              {polyglot.t("login-with-github")}
            </a>
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
        <div
          className={`gt-user-inner${showPopup ? " is--poping" : ""}`}
          onClick={onShowOrHidePopup}
        >
          <span className="gt-user-name">
            {user?.login ?? polyglot.t("anonymous")}
          </span>
          <Svg className="gt-ico-arrdown" icon={ArrowDown} />
        </div>
      </div>
    </div>
  );
};

export default Meta;
