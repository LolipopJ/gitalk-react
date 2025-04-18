import { useRequest } from "ahooks";
import { useEffect, useMemo, useState } from "react";

import { ACCESS_TOKEN_KEY } from "../lib/constants";
import Gitalk, { type GitalkProps } from "../lib/gitalk";
import { Issue } from "../lib/interfaces";
import getOctokitInstance from "../lib/services/request";
import { Logger } from "../lib/utils/logger";

type Theme = "light" | "dark";

const logger = new Logger({ prefix: "Gitalk Dev Page" });

const GITALK_OPTIONS: GitalkProps = import.meta.env.PROD
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

const ISSUES_PER_PAGE = 30;

const App = () => {
  const [issuesPage, setIssuesPage] = useState<number>(1);
  const [issuesLoaded, setIssuesLoaded] = useState<boolean>(false);

  const [theme, setTheme] = useState<Theme>("light");
  const [issueNumber, setIssueNumber] = useState<number>();

  useEffect(() => {
    const url = new URL(location.href);
    const searchParams = url.searchParams;

    const theme = searchParams.get("theme") || "light";
    if (theme === "dark") {
      import("../lib/themes/gitalk-dark.scss");
      setTheme("dark");
    } else {
      import("../lib/themes/gitalk-light.scss");
      setTheme("light");
    }

    const initialIssueNumber = Number(searchParams.get("number")) || undefined;
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
      const from = (issuesPage - 1) * ISSUES_PER_PAGE + 1;
      const to = issuesPage * ISSUES_PER_PAGE;

      const getIssuesRes = await octokit.request(
        "GET /repos/{owner}/{repo}/issues",
        {
          owner: GITALK_OPTIONS.owner,
          repo: GITALK_OPTIONS.repo,
          labels: "Gitalk",
          page: issuesPage,
          per_page: ISSUES_PER_PAGE,
        },
      );

      if (getIssuesRes.status === 200) {
        const _issues = getIssuesRes.data;
        logger.s(`Get issues from ${from} to ${to} successfully:`, _issues);

        if (_issues.length < ISSUES_PER_PAGE) {
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
    logger.i("Current active issue:", selectedIssue);
  }, [selectedIssue]);

  return (
    <div style={{ padding: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <span>
          Existed issues in repository {GITALK_OPTIONS.owner}/
          {GITALK_OPTIONS.repo}:
        </span>
        {issues.length
          ? issues.map((issue) => {
              const { number, title, html_url } = issue;

              return (
                <a
                  key={number}
                  title={html_url}
                  onClick={() => setIssueNumber(number)}
                  style={{
                    padding: "6px 12px",
                    border: "1px solid #333",
                    borderRadius: "6px",
                    cursor: "pointer",
                    backgroundColor:
                      number === issueNumber ? "#efefef" : undefined,
                  }}
                >
                  {title}
                </a>
              );
            })
          : getIssuesLoading
            ? ""
            : "NO ISSUE LOCATED"}
        <button
          onClick={() => setIssuesPage((prev) => prev + 1)}
          disabled={getIssuesLoading || issuesLoaded}
          style={{ padding: "6px 12px" }}
        >
          {issuesLoaded
            ? "Issues loaded"
            : getIssuesLoading
              ? "Loading..."
              : "Load more issues"}
        </button>
      </div>
      <div
        style={{
          marginTop: 16,
          padding: 32,
          background: theme === "light" ? "#fff" : "#171717",
        }}
      >
        {!!issueNumber && (
          <Gitalk
            {...GITALK_OPTIONS}
            number={issueNumber}
            createIssueManually
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
