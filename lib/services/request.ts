import { Octokit, type RequestError } from "octokit";

import { ACCESS_TOKEN_KEY } from "../constants";
import logger from "../utils/logger";

export const getOctokitInstance = (accessToken?: string) => {
  const _octokit = new Octokit(
    accessToken
      ? {
          auth: accessToken,
        }
      : {},
  );
  _octokit.hook.error("request", (error) => {
    if ((error as RequestError).status === 401) {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      logger.w(`Access token expired.`);
    }
    throw error;
  });
  return _octokit;
};

export default getOctokitInstance;
