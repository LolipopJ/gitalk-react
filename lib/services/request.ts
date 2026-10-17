import { Octokit, type RequestError } from "octokit";

import logger from "../utils/logger";

export const getOctokitInstance = (
  accessToken: string | undefined,
  onUnauthorized: () => void,
): Octokit => {
  const _octokit = new Octokit({
    ...(accessToken ? { auth: accessToken } : {}),
  });
  _octokit.hook.before("request", (options) => {
    options.headers["X-Github-Next-Global-ID"] = "1";
  });
  _octokit.hook.error("request", (error) => {
    if (accessToken && (error as RequestError).status === 401) {
      onUnauthorized();
      logger.w(`Access token expired.`);
    }
    const requestError = error as RequestError;
    const headers = requestError.response?.headers;
    const rateLimited =
      requestError.status === 429 ||
      (requestError.status === 403 &&
        (headers?.["x-ratelimit-remaining"] === "0" ||
          headers?.["retry-after"] !== undefined ||
          /(?:secondary )?rate limit|abuse detection/i.test(
            requestError.message,
          )));
    if (rateLimited) {
      const retryAfter = headers?.["retry-after"];
      const reset = headers?.["x-ratelimit-reset"];
      const resetTime = reset ? new Date(Number(reset) * 1000) : undefined;
      const retry = retryAfter
        ? ` Retry after ${retryAfter} seconds.`
        : resetTime && Number.isFinite(resetTime.getTime())
          ? ` Retry after ${resetTime.toISOString()}.`
          : " Please try again later.";
      requestError.message = `GitHub API rate limit exceeded.${retry}`;
    }
    throw error;
  });
  return _octokit;
};

export default getOctokitInstance;
