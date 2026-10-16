import { Octokit, type RequestError } from "octokit";

import logger from "../utils/logger";

export const getOctokitInstance = (
  accessToken: string | undefined,
  onUnauthorized: () => void,
): Octokit => {
  const _octokit = new Octokit(
    accessToken
      ? {
          auth: accessToken,
        }
      : {},
  );
  _octokit.hook.error("request", (error) => {
    if (accessToken && (error as RequestError).status === 401) {
      onUnauthorized();
      logger.w(`Access token expired.`);
    }
    throw error;
  });
  return _octokit;
};

export default getOctokitInstance;
