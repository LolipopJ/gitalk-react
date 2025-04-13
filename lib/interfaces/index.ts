import type { Endpoints } from "@octokit/types";

export type User = Endpoints["GET /user"]["response"]["data"];

export type Issue =
  Endpoints["GET /repos/{owner}/{repo}/issues/{issue_number}"]["response"]["data"];

export type Comment =
  Endpoints["GET /repos/{owner}/{repo}/issues/{issue_number}/comments"]["response"]["data"][number];
