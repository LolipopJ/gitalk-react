import { Octokit } from "octokit";

import { ACCESS_TOKEN_KEY } from "../constants";
import { type GitalkProps } from "../gitalk";
import logger from "../utils/logger";
import { stringifySearchQuery } from "../utils/query";

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

export const getLoginUrl = (clientID: GitalkProps["clientID"]) => {
  const query = {
    client_id: clientID,
    redirect_uri: window.location.href,
    scope: "public_repo",
  };
  return `https://github.com/login/oauth/authorize?${stringifySearchQuery(query)}`;
};

export const getAccessToken = async ({
  url,
  code,
  clientID,
  clientSecret,
}: {
  url: string;
  code: string;
  clientID: GitalkProps["clientID"];
  clientSecret: GitalkProps["clientSecret"];
}) => {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code,
        client_id: clientID,
        client_secret: clientSecret,
      }),
    });

    const resData = await res.json();
    const { access_token } = resData;

    return access_token as string;
  } catch (error) {
    logger.e(`An error occurred while requesting access token:`, error);
    return undefined;
  }
};
