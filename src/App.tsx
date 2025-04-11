import "../lib/themes/gitalk-light.scss";

import { useEffect, useState } from "react";

import Gitalk from "../lib/gitalk";
import { getOctokitInstance } from "../lib/services";

const {
  VITE_CLIENT_ID,
  VITE_CLIENT_SECRET,
  VITE_REPO_OWNER,
  VITE_REPO_NAME,
  VITE_ADMIN,
} = import.meta.env;

const PER_PAGE = 30;

const App = () => {
  const [loading, setLoading] = useState<boolean>(true);
  const [loaded, setLoaded] = useState<boolean>(false);
  const [page, setPage] = useState<number>(1);
  const [issueList, setIssueList] = useState<number[]>([]);
  const [issueNumber, setIssueNumber] = useState<number>();

  useEffect(() => {
    setLoading(true);

    const octokit = getOctokitInstance();
    octokit
      .request("GET /repos/{owner}/{repo}/issues", {
        owner: VITE_REPO_OWNER,
        repo: VITE_REPO_NAME,
        labels: "Gitalk",
        page,
        per_page: PER_PAGE,
      })
      .then((res) => {
        const issueNumbers = res.data.map((item) => item.number);

        setIssueList((prev) => [...prev, ...issueNumbers]);
        setLoading(false);
        if (issueNumbers.length < PER_PAGE) setLoaded(true);
      });
  }, [page]);

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {issueList.map((number) => (
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
          onClick={() => setPage((prev) => prev + 1)}
          disabled={loading || loaded}
        >
          {loaded
            ? "Issues loaded"
            : loading
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
