import { Octokit } from "octokit";

import { ACCESS_TOKEN_KEY } from "../constants";

export const getOctokitInstance = (
  accessToken = localStorage.getItem(ACCESS_TOKEN_KEY) ?? "",
) =>
  new Octokit(
    accessToken
      ? {
          auth: accessToken,
        }
      : {},
  );
