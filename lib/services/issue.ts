import type { Endpoints } from "@octokit/types";

import { getOctokitInstance } from "./request";

export const createIssue = async (
  params: Endpoints["POST /repos/{owner}/{repo}/issues"]["parameters"],
) => {
  const octokit = getOctokitInstance();
  return await octokit.request("POST /repos/{owner}/{repo}/issues", params);
};

export const getIssues = async (
  params: Endpoints["GET /repos/{owner}/{repo}/issues"]["parameters"],
) => {
  const octokit = getOctokitInstance();
  return await octokit.request("GET /repos/{owner}/{repo}/issues", params);
};

export const getIssueByNumber = async (
  params: Endpoints["GET /repos/{owner}/{repo}/issues/{issue_number}"]["parameters"],
) => {
  const octokit = getOctokitInstance();
  return await octokit.request(
    "GET /repos/{owner}/{repo}/issues/{issue_number}",
    params,
  );
};

export const getIssueComments = async (
  params: Endpoints["GET /repos/{owner}/{repo}/issues/{issue_number}/comments"]["parameters"],
) => {
  const octokit = getOctokitInstance();
  return await octokit.request(
    "GET /repos/{owner}/{repo}/issues/{issue_number}/comments",
    params,
  );
};

export const createIssueComment = async (
  params: Endpoints["POST /repos/{owner}/{repo}/issues/{issue_number}/comments"]["parameters"],
) => {
  const octokit = getOctokitInstance();
  return await octokit.request(
    "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
    params,
  );
};
