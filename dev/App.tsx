import "../lib/themes/gitalk-light.scss";

import { useRequest } from "ahooks";
import { Octokit } from "octokit";
import { useState } from "react";

import { ACCESS_TOKEN_KEY } from "../lib/constants";
import Gitalk from "../lib/gitalk";
import { Issue } from "../lib/interfaces";
import logger from "../lib/utils/logger";

const {
  VITE_CLIENT_ID,
  VITE_CLIENT_SECRET,
  VITE_REPO_OWNER,
  VITE_REPO_NAME,
  VITE_ADMIN,
} = import.meta.env;

const PER_PAGE = 30;

const App = () => {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [issuesPage, setIssuesPage] = useState<number>(1);
  const [issuesLoaded, setIssuesLoaded] = useState<boolean>(false);

  const [issueNumber, setIssueNumber] = useState<number>();

  const { loading: getIssuesLoading } = useRequest<void, [number]>(
    async () => {
      const from = (issuesPage - 1) * PER_PAGE + 1;
      const to = issuesPage * PER_PAGE;

      const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
      const octokit = new Octokit(
        accessToken
          ? {
              auth: accessToken,
            }
          : {},
      );

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

        setIssues((prev) => [...prev, ..._issues]);
      } else {
        logger.e(`Get issues from ${from} to ${to} failed:`, getIssuesRes);
        throw new Error(JSON.stringify(getIssuesRes));
      }
    },
    {
      ready: !!VITE_REPO_OWNER && !!VITE_REPO_NAME,
      refreshDeps: [issuesPage],
    },
  );

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {issues.map(({ number }) => (
          <a
            key={number}
            onClick={() => setIssueNumber(number)}
            style={{
              padding: "6px 12px",
              border: "1px solid #333",
              borderRadius: "6px",
              cursor: "pointer",
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
      <div style={{ marginTop: 16 }}>
        {!!issueNumber && (
          <Gitalk
            clientID={VITE_CLIENT_ID}
            clientSecret={VITE_CLIENT_SECRET}
            owner={VITE_REPO_OWNER}
            repo={VITE_REPO_NAME}
            admin={JSON.parse(VITE_ADMIN)}
            number={issueNumber}
          />
        )}
      </div>
    </div>
  );
};

export default App;
