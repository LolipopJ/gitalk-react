import { DEFAULT_PROXY } from "../constants";
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
  proxy,
  code,
  clientID,
  clientSecret,
}: {
  proxy?: string;
  code: string;
  clientID: string;
  clientSecret?: string;
}) => {
  let res: Response;
  if (!clientSecret) {
    if (!proxy)
      throw new Error(
        "Specify an OAuth `proxy` when `clientSecret` is omitted",
      );
    const url = new URL(proxy, window.location.href);
    url.searchParams.set("code", code);
    res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
  } else {
    res = await fetch(proxy || DEFAULT_PROXY, {
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
  }

  if (!res.ok) throw new Error("OAuth token exchange failed");
  const resData = await res.json();
  if (
    resData?.error ||
    typeof resData?.access_token !== "string" ||
    !resData.access_token
  ) {
    throw new Error("OAuth response did not contain an access token");
  }

  return resData.access_token as string;
};
