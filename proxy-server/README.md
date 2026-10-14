# OAuth proxy

This Node.js 22+ server exchanges GitHub OAuth authorization codes using credentials kept on the server. It has no additional dependencies.

From the repository root, copy `proxy-server/.env.example` to `proxy-server/.env.local`. Set:

- `GITHUB_CLIENT_ID`: the same OAuth App ID as the browser's `clientID`.
- `GITHUB_CLIENT_SECRET`: the OAuth App secret, stored only on the server.
- `ALLOWED_ORIGIN`: your exact site origin, such as `http://localhost:5173` or `https://example.com`, without a path or trailing slash. For the deployed preview, use `https://lolipopj.github.io`.
- `HOST` and `PORT`: default to `127.0.0.1` and `3000`. Set `HOST=0.0.0.0` when a container needs to accept connections from outside it.

The `.env.local` file is ignored by Git. Never copy its secret into `VITE_*`, component props, or the static preview build.

```bash
npm run start:proxy
```

In another terminal, run `npm run dev`. Vite forwards `/oauth/access_token` to the local proxy. If you override `VITE_PROXY`, point it to `http://localhost:3000/oauth/access_token` locally and use the exact Vite origin for `ALLOWED_ORIGIN`.

For deployment, copy `server.mjs` to a Node host, inject the environment variables through the host's secret settings, and run:

```bash
node server.mjs
```

Use a process manager and an HTTPS reverse proxy. Disable caching and query-string access logs for `/oauth/access_token`; URLs contain one-time authorization codes. For the GitHub Pages preview, configure the repository Actions variable `OAUTH_PROXY_URL` with this HTTPS endpoint. Set `VITE_CLIENT_ID` too if you use a different OAuth App. Register the frontend callback URL with that App.

Requests with an `Origin` must match `ALLOWED_ORIGIN`. Requests without `Origin` are permitted for same-origin browsers and command-line clients; CORS is a browser restriction, not authentication. Only the server-configured App credentials are used, regardless of query parameters supplied by callers.

The endpoint accepts `GET /oauth/access_token?code=...` and returns JSON `{ "access_token": "..." }`. Missing or duplicate codes return 400; disallowed origins return 403; unsupported paths and methods return 404/405. Invalid GitHub responses or network failures return 502 with a generic error. All responses use `Cache-Control: no-store`. Upstream requests time out after 10 seconds.

This implementation covers audit item 1. OAuth `state` validation and token storage remain separate audit items. Rotate secrets previously published in preview source before deploying.

Run the focused tests from the repository root:

```bash
npm run test:oauth
```
