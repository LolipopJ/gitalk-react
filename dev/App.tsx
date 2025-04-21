import "./app.scss";

import { useRequest } from "ahooks";
import { useEffect, useMemo, useState } from "react";

import { ACCESS_TOKEN_KEY } from "../lib/constants";
import Gitalk from "../lib/gitalk";
import { i18nMap, type Lang } from "../lib/i18n";
import type { GitalkProps, Issue } from "../lib/interfaces";
import getOctokitInstance from "../lib/services/request";
import { Logger } from "../lib/utils/logger";

const logger = new Logger({ prefix: "Gitalk Dev Page" });

type Theme = "light" | "dark";
const THEME_LIST: { label: string; key: Theme }[] = [
  { label: "LIGHT", key: "light" },
  { label: "DARK", key: "dark" },
];

const DEFAULT_CSS = `.gt-container {
  --gt-color-main: #059669;
  --gt-color-main-lighter: #10b981;
}`;
const GITALK_CUSTOM_CSS_KEY = "GITALK_CUSTOM_CSS";

const GITALK_CUSTOM_OPTIONS_KEY = "GITALK_CUSTOM_OPTIONS";
const storedGitalkCustomOptions = localStorage.getItem(
  GITALK_CUSTOM_OPTIONS_KEY,
);

const I18N_LANGS = Object.keys(i18nMap) as Lang[];

const GITALK_BASE_OPTIONS: GitalkProps = import.meta.env.PROD
  ? {
      clientID: "Ov23lizwQOGBomnxr5j1",
      clientSecret: "c6c3a16df89ef55264fb34821c4e76fe4f75c77e",
      owner: "LolipopJ",
      repo: "gitalk-react",
      admin: ["LolipopJ"],
    }
  : {
      clientID: import.meta.env["VITE_CLIENT_ID"] ?? "Ov23lieS9XRg4Axl4x6P",
      clientSecret:
        import.meta.env["VITE_CLIENT_SECRET"] ??
        "754ba9d5432e289457daad3f49fb88a87e3ca266",
      owner: import.meta.env["VITE_REPO_OWNER"] ?? "LolipopJ",
      repo: import.meta.env["VITE_REPO_NAME"] ?? "gitalk-react",
      admin: import.meta.env["VITE_ADMIN"]
        ? JSON.parse(import.meta.env["VITE_ADMIN"])
        : ["LolipopJ"],
    };

type GitalkEditableProps = Omit<
  GitalkProps,
  "clientID" | "clientSecret" | "owner" | "repo" | "admin" | "number"
>;
const DEFAULT_EDITABLE_OPTIONS: GitalkEditableProps = {};

const App = () => {
  const [issuesPage, setIssuesPage] = useState<number>(1);
  const [issuesLoaded, setIssuesLoaded] = useState<boolean>(false);
  const [issueNumber, setIssueNumber] = useState<number>();

  const [theme, setTheme] = useState<Theme>("light");
  const [css, setCSS] = useState<string>(
    localStorage.getItem(GITALK_CUSTOM_CSS_KEY) ?? DEFAULT_CSS,
  );

  const [options, setOptions] = useState<GitalkEditableProps>(
    storedGitalkCustomOptions
      ? JSON.parse(storedGitalkCustomOptions)
      : DEFAULT_EDITABLE_OPTIONS,
  );

  useEffect(() => {
    logger.i(
      "Gitalk React options:",
      Object.assign({}, options, GITALK_BASE_OPTIONS),
    );
    localStorage.setItem(GITALK_CUSTOM_OPTIONS_KEY, JSON.stringify(options));
  }, [options]);

  useEffect(() => {
    const url = new URL(location.href);
    const searchParams = url.searchParams;

    const _theme = searchParams.get("theme") || "light";
    if (_theme === "dark") {
      import("../lib/themes/gitalk-dark.scss");
      setTheme("dark");
    } else {
      import("../lib/themes/gitalk-light.scss");
      setTheme("light");
    }

    const initialIssueNumber =
      Number(searchParams.get("issueNumber")) || undefined;
    setIssueNumber(initialIssueNumber);
  }, []);

  const octokit = getOctokitInstance(
    localStorage.getItem(ACCESS_TOKEN_KEY) ?? undefined,
  );

  const {
    data: issues = [],
    mutate: setIssues,
    loading: getIssuesLoading,
  } = useRequest(
    async (): Promise<Issue[]> => {
      const issuesPerPage = 30;

      const from = (issuesPage - 1) * issuesPerPage + 1;
      const to = issuesPage * issuesPerPage;

      const getIssuesRes = await octokit.request(
        "GET /repos/{owner}/{repo}/issues",
        {
          owner: GITALK_BASE_OPTIONS.owner,
          repo: GITALK_BASE_OPTIONS.repo,
          labels: "Gitalk",
          page: issuesPage,
          per_page: issuesPerPage,
        },
      );

      if (getIssuesRes.status === 200) {
        const _issues = getIssuesRes.data;
        logger.s(`Get issues from ${from} to ${to} successfully:`, _issues);

        if (_issues.length < issuesPerPage) {
          setIssuesLoaded(true);
        }

        return [...issues, ..._issues];
      } else {
        logger.e(`Get issues from ${from} to ${to} failed:`, getIssuesRes);
        return issues;
      }
    },
    {
      ready: !issuesLoaded,
      refreshDeps: [issuesPage],
      onSuccess: (data) => {
        if (!issueNumber) {
          setIssueNumber(data[0]?.number);
        }
      },
    },
  );

  const selectedIssue = useMemo(
    () => issues.find((issue) => issue.number === issueNumber),
    [issueNumber, issues],
  );
  useEffect(() => {
    if (selectedIssue) {
      logger.i("Current active issue:", selectedIssue);

      const url = new URL(location.href);
      const searchParams = url.searchParams;
      searchParams.set("issueNumber", String(selectedIssue.number));
      history.replaceState(null, "", url);
    }
  }, [selectedIssue]);

  const switchTheme = (newTheme: Theme) => {
    const url = new URL(location.href);
    const searchParams = url.searchParams;
    searchParams.set("theme", newTheme);
    location.href = url.toString();
  };

  const onResetCSS = () => {
    document.getElementById(GITALK_CUSTOM_CSS_KEY)?.remove();

    setCSS(DEFAULT_CSS);
  };

  const onSetCSS = (cssString: string) => {
    document.getElementById(GITALK_CUSTOM_CSS_KEY)?.remove();

    const style = document.createElement("style");
    style.id = GITALK_CUSTOM_CSS_KEY;
    style.textContent = cssString;
    document.head.appendChild(style);

    localStorage.setItem(GITALK_CUSTOM_CSS_KEY, cssString);
  };

  return (
    <div
      style={{
        padding: "56px 32px",
        margin: "0 auto",
        maxWidth: 768,
      }}
    >
      <div className="sections">
        <section className="section__header">
          <h1 style={{ textAlign: "center" }}>Gitalk React</h1>
          <div style={{ textAlign: "center", padding: 12 }}>
            <a
              href="https://www.npmjs.com/package/gitalk-react?activeTab=readme#quick-start"
              target="_blank"
            >
              <button
                className="primary large"
                style={{
                  marginRight: 12,
                }}
              >
                USAGE
              </button>
            </a>
            <a href="https://github.com/LolipopJ/gitalk-react" target="_blank">
              <button className="outlined large">GITHUB</button>
            </a>
          </div>
        </section>

        <section className="section__themes">
          <h2>🎨 Themes</h2>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 12,
            }}
          >
            {THEME_LIST.map(({ label: themeLabel, key: themeKey }) => (
              <button
                key={themeKey}
                className={theme === themeKey ? "active" : ""}
                onClick={() => switchTheme(themeKey)}
              >
                {themeLabel}
              </button>
            ))}

            <div style={{ width: "100%" }}>
              <textarea
                style={{
                  width: "calc(100% - 16px)",
                  minHeight: 100,
                  resize: "vertical",
                  padding: 8,
                }}
                placeholder="Custom your styles"
                value={css}
                onChange={(e) => setCSS(e.target.value)}
              />
              <div style={{ width: "100%", marginTop: 6, textAlign: "end" }}>
                <button
                  className="small"
                  style={{ marginRight: 8 }}
                  onClick={onResetCSS}
                >
                  Reset
                </button>
                <button className="primary small" onClick={() => onSetCSS(css)}>
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="section__options">
          <h2>📐 Options</h2>
          <form
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div>
              <label htmlFor="language">Language</label>
              <select
                name="language"
                defaultValue={options.language ?? navigator.language}
                onChange={(e) => {
                  e.persist();
                  setOptions((prev) => ({
                    ...prev,
                    language: e.target.value as GitalkProps["language"],
                  }));
                }}
              >
                {I18N_LANGS.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="perPage">Comments per page</label>
              <select
                name="perPage"
                defaultValue={options.perPage ?? 10}
                onChange={(e) => {
                  e.persist();
                  setOptions((prev) => ({
                    ...prev,
                    perPage: Number(e.target.value),
                  }));
                }}
              >
                <option value="1">1</option>
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>
            <div>
              <label htmlFor="pagerDirection">Pager direction</label>
              <select
                name="pagerDirection"
                defaultValue={options.pagerDirection ?? "last"}
                onChange={(e) => {
                  e.persist();
                  setOptions((prev) => ({
                    ...prev,
                    pagerDirection: e.target
                      .value as GitalkProps["pagerDirection"],
                  }));
                  setTimeout(() => location.reload());
                }}
              >
                <option value="last">last</option>
                <option value="first">first</option>
              </select>
            </div>
            <div>
              <label htmlFor="collapsedHeight">Collapsed height</label>
              <select
                name="collapsedHeight"
                defaultValue={options.collapsedHeight ?? "-"}
                onChange={(e) => {
                  e.persist();
                  setOptions((prev) => ({
                    ...prev,
                    collapsedHeight: Number(e.target.value) || undefined,
                  }));
                }}
              >
                <option value="-">-</option>
                <option value="300">300px</option>
                <option value="600">600px</option>
                <option value="900">900px</option>
              </select>
            </div>
            {/* <div>
              <label htmlFor="createIssueManually">Create issue manually</label>
              <input
                type="checkbox"
                name="createIssueManually"
                defaultChecked={options.createIssueManually ?? true}
                onChange={(e) => {
                  e.persist();
                  setOptions((prev) => ({
                    ...prev,
                    createIssueManually: e.target.checked,
                  }));
                }}
              />
            </div> */}
            <div>
              <label htmlFor="enableHotKey">Enable hot key</label>
              <input
                type="checkbox"
                name="enableHotKey"
                defaultChecked={options.enableHotKey ?? true}
                onChange={(e) => {
                  e.persist();
                  setOptions((prev) => ({
                    ...prev,
                    enableHotKey: e.target.checked,
                  }));
                }}
              />
            </div>
            <div>
              <label htmlFor="distractionFreeMode">Distraction-free mode</label>
              <input
                type="checkbox"
                name="distractionFreeMode"
                defaultChecked={options.distractionFreeMode ?? false}
                onChange={(e) => {
                  e.persist();
                  setOptions((prev) => ({
                    ...prev,
                    distractionFreeMode: Boolean(e.target.checked),
                  }));
                }}
              />
            </div>
            <div>
              <button
                className="small"
                style={{ marginRight: 8 }}
                onClick={() => setOptions(DEFAULT_EDITABLE_OPTIONS)}
              >
                Reset
              </button>
            </div>
          </form>
        </section>

        <section className="section__preview">
          <h2>💬 Preview</h2>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span>
              Existed issues in repository {GITALK_BASE_OPTIONS.owner}/
              {GITALK_BASE_OPTIONS.repo}:
            </span>
            {issues.length
              ? issues.map((issue) => {
                  const { number, title, html_url } = issue;

                  return (
                    <button
                      className={number === issueNumber ? "active" : ""}
                      key={number}
                      title={html_url}
                      onClick={() => setIssueNumber(number)}
                    >
                      {title}
                    </button>
                  );
                })
              : getIssuesLoading
                ? ""
                : "NO ISSUE LOCATED"}
            <button
              className="small"
              onClick={() => setIssuesPage((prev) => prev + 1)}
              disabled={getIssuesLoading || issuesLoaded}
            >
              {issuesLoaded
                ? "Issues loaded"
                : getIssuesLoading
                  ? "Loading..."
                  : "Load more issues"}
            </button>
          </div>
        </section>
      </div>

      <div
        style={{
          background: theme === "light" ? "#fff" : "#171717",
          boxShadow:
            theme === "light" ? "0 4px 12px 0 #ccc" : "0 4px 12px 0 #333",
        }}
        className="section__preview__container"
      >
        {!!issueNumber && (
          <Gitalk
            {...options}
            {...GITALK_BASE_OPTIONS}
            number={issueNumber}
            onCreateIssue={(issue) => {
              setIssues((prev) => [issue, ...(prev ?? [])]);
              setIssueNumber(issue.number);
            }}
          />
        )}
      </div>
    </div>
  );
};

export default App;
