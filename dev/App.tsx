import { useRequest } from "ahooks";
import { useEffect, useState } from "react";

import { ACCESS_TOKEN_KEY } from "../lib/constants";
import Gitalk from "../lib/gitalk";
import { Issue } from "../lib/interfaces";
import getOctokitInstance from "../lib/services/request";
import logger from "../lib/utils/logger";

const {
  VITE_CLIENT_ID,
  VITE_CLIENT_SECRET,
  VITE_REPO_OWNER,
  VITE_REPO_NAME,
  VITE_ADMIN,
} = import.meta.env;

const PER_PAGE = 30;

type Theme = "light" | "dark";

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

    const initialIssueNumber =
      Number(searchParams.get("issueNumber")) || undefined;
    setIssueNumber(initialIssueNumber);
  }, []);

  const octokit = getOctokitInstance(
    localStorage.getItem(ACCESS_TOKEN_KEY) ?? undefined,
  );

  const { data: issues = [], loading: getIssuesLoading } = useRequest(
    async (): Promise<Issue[]> => {
      const from = (issuesPage - 1) * PER_PAGE + 1;
      const to = issuesPage * PER_PAGE;

      const getIssuesRes = await octokit.request(
        "GET /repos/{owner}/{repo}/issues",
        {
          owner: VITE_REPO_OWNER,
          repo: VITE_REPO_NAME,
          labels: "Gitalk",
          page: issuesPage,
          per_page: PER_PAGE,
        },
      );

      if (getIssuesRes.status === 200) {
        const _issues = getIssuesRes.data;
        logger.s(`Get issues from ${from} to ${to} successfully:`, _issues);

        if (_issues.length < PER_PAGE) {
          setIssuesLoaded(true);
        }

        return [...issues, ..._issues];
      } else {
        logger.e(`Get issues from ${from} to ${to} failed:`, getIssuesRes);
        return issues;
      }
    },
    {
      ready: !!VITE_REPO_OWNER && !!VITE_REPO_NAME && !issuesLoaded,
      refreshDeps: [issuesPage],
      onSuccess: (data) => {
        if (!issueNumber) {
          setIssueNumber(data[0]?.number);
        }
      },
    },
  );

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
          Existed issues in repository {VITE_REPO_OWNER}/{VITE_REPO_NAME}:
        </span>
        {issues.map(({ number }) => (
          <a
            key={number}
            onClick={() => setIssueNumber(number)}
            style={{
              padding: "6px 12px",
              border: "1px solid #333",
              borderRadius: "6px",
              cursor: "pointer",
              backgroundColor: number === issueNumber ? "#efefef" : undefined,
            }}
          >
            {number}
          </a>
        ))}
        <button
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
      <div
        style={{
          marginTop: 16,
          padding: 32,
          background: theme === "light" ? "#eee" : "#111",
        }}
      >
        {!!issueNumber && (
          <Gitalk
            clientID={VITE_CLIENT_ID}
            clientSecret={VITE_CLIENT_SECRET}
            owner={VITE_REPO_OWNER}
            repo={VITE_REPO_NAME}
            admin={JSON.parse(VITE_ADMIN)}
            number={issueNumber}
            labels={["gitalk-react-dev"]}
            createIssueManually
          />
        )}
      </div>
    </div>
  );
};

export default App;
