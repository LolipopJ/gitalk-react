import { stringifySearchQuery } from "../utils/query";

export const getAuthorizeUrl = (clientID: string) => {
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
  clientID: string;
  clientSecret: string;
}) => {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
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
};
