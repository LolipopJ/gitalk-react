import { DEFAULT_PROXY } from "../constants";

const stateKey = (clientID: string) => `GT_OAUTH_STATE:${clientID}`;
const callbackParams = [
  "code",
  "state",
  "error",
  "error_description",
  "error_uri",
];

export const getAuthorizeUrl = (clientID: string) => {
  const state = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  sessionStorage.setItem(
    stateKey(clientID),
    JSON.stringify({ state, expiresAt: Date.now() + 10 * 60 * 1000 }),
  );
  const query = {
    client_id: clientID,
    redirect_uri: window.location.href,
    scope: "public_repo",
    state,
  };
  return `https://github.com/login/oauth/authorize?${new URLSearchParams(query)}`;
};

export const consumeOAuthCallback = (clientID: string): string | undefined => {
  const url = new URL(window.location.href);
  const query = url.searchParams;
  if (!query.has("code") && !query.has("error")) return;

  const codes = query.getAll("code");
  const states = query.getAll("state");
  const errors = query.getAll("error");
  const description = query.get("error_description");
  callbackParams.forEach((key) => query.delete(key));
  history.replaceState(null, "", url.toString());

  const key = stateKey(clientID);
  const stored = sessionStorage.getItem(key);
  sessionStorage.removeItem(key);
  let pending;
  try {
    pending = JSON.parse(stored ?? "null");
  } catch {
    throw new Error("Invalid OAuth state; please log in again");
  }
  if (
    states.length !== 1 ||
    !states[0] ||
    pending?.state !== states[0] ||
    typeof pending?.expiresAt !== "number" ||
    pending.expiresAt <= Date.now()
  ) {
    throw new Error("Invalid or expired OAuth state; please log in again");
  }
  if (errors.length === 1 && codes.length === 0) {
    throw new Error(description || errors[0] || "OAuth authorization denied");
  }
  if (codes.length !== 1 || !codes[0] || errors.length) {
    throw new Error("Invalid OAuth callback; please log in again");
  }
  return codes[0];
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

  let resData;
  try {
    resData = await res.json();
  } catch {
    throw new Error("OAuth token exchange returned invalid JSON");
  }
  if (resData?.error) {
    const message =
      typeof resData.error_description === "string"
        ? resData.error_description
        : String(resData.error);
    throw new Error(`OAuth token exchange failed: ${message}`);
  }
  if (!res.ok)
    throw new Error(`OAuth token exchange failed (HTTP ${res.status})`);
  if (
    typeof resData?.access_token !== "string" ||
    !resData.access_token.trim()
  ) {
    throw new Error("OAuth response did not contain an access token");
  }

  return resData.access_token as string;
};
