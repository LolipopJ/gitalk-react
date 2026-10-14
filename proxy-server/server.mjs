import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

export const createOAuthServer = ({
  clientID,
  clientSecret,
  allowedOrigin,
}) => {
  if (!clientID || !clientSecret || !allowedOrigin) {
    throw new Error(
      "GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET and ALLOWED_ORIGIN are required",
    );
  }
  const origin = new URL(allowedOrigin);
  if (
    !["http:", "https:"].includes(origin.protocol) ||
    origin.origin !== allowedOrigin
  ) {
    throw new Error(
      "ALLOWED_ORIGIN must be an exact HTTP(S) origin without a path",
    );
  }

  return createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Vary", "Origin");
    const send = (status, body) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };

    if (req.headers.origin && req.headers.origin !== allowedOrigin) {
      send(403, { error: "origin_not_allowed" });
      return;
    }
    if (req.headers.origin) {
      res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    }

    let url;
    try {
      url = new URL(req.url, "http://localhost");
    } catch {
      send(400, { error: "invalid_url" });
      return;
    }
    if (url.pathname !== "/oauth/access_token") {
      send(404, { error: "not_found" });
      return;
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204, { "Access-Control-Allow-Methods": "GET" });
      res.end();
      return;
    }
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET, OPTIONS");
      send(405, { error: "method_not_allowed" });
      return;
    }

    const codes = url.searchParams.getAll("code");
    const code = codes[0];
    if (codes.length !== 1 || !code || code.length > 2048) {
      send(400, { error: "invalid_code" });
      return;
    }

    try {
      const upstream = await fetch(
        "https://github.com/login/oauth/access_token",
        {
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
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!upstream.ok) throw new Error("OAuth exchange failed");
      const data = await upstream.json();
      if (
        data?.error ||
        typeof data?.access_token !== "string" ||
        !data.access_token
      ) {
        throw new Error("Invalid OAuth response");
      }
      send(200, { access_token: data.access_token });
    } catch {
      send(502, { error: "oauth_exchange_failed" });
    }
  });
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const port = Number(process.env["PORT"] ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer from 1 to 65535");
  }
  const server = createOAuthServer({
    clientID: process.env["GITHUB_CLIENT_ID"],
    clientSecret: process.env["GITHUB_CLIENT_SECRET"],
    allowedOrigin: process.env["ALLOWED_ORIGIN"],
  });
  server.listen(port, process.env["HOST"] ?? "127.0.0.1", () => {
    console.log(`OAuth proxy listening on port ${port}`);
  });
}
