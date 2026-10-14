import assert from "node:assert/strict";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";

import { createOAuthServer } from "./server.mjs";

const config = {
  clientID: "server-client",
  clientSecret: "server-secret",
  allowedOrigin: "https://site.example",
};

const start = async (t) => {
  const server = createOAuthServer(config);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  return (path, { method = "GET", origin = config.allowedOrigin } = {}) =>
    new Promise((resolve, reject) => {
      const req = request(
        {
          hostname: "127.0.0.1",
          port: server.address().port,
          path,
          method,
          headers: origin ? { Origin: origin } : {},
        },
        (res) => {
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => {
            body += chunk;
          });
          res.on("end", () =>
            resolve({ status: res.statusCode, headers: res.headers, body }),
          );
        },
      );
      req.on("error", reject);
      req.end();
    });
};

test("exchange uses server credentials and returns only the token with no-cache CORS headers", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (...args) => {
    calls.push(args);
    return {
      ok: true,
      json: async () => ({
        access_token: "github-token",
        client_secret: "do-not-return",
        scope: "public_repo",
      }),
    };
  });
  const call = await start(t);
  const res = await call(
    "/oauth/access_token?code=grant%20%26%2B&client_id=attacker&client_secret=attacker",
  );
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(res.body), { access_token: "github-token" });
  assert.equal(
    res.headers["access-control-allow-origin"],
    config.allowedOrigin,
  );
  assert.equal(res.headers["cache-control"], "no-store");
  assert.equal(res.headers.vary, "Origin");
  assert.equal(calls.length, 1);
  const [url, options] = calls[0];
  assert.equal(url, "https://github.com/login/oauth/access_token");
  assert.equal(options.method, "POST");
  assert.deepEqual(JSON.parse(options.body), {
    code: "grant &+",
    client_id: config.clientID,
    client_secret: config.clientSecret,
  });
  assert.ok(options.signal instanceof AbortSignal);
});

test("same-origin and command-line callers can omit Origin", async (t) => {
  t.mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => ({ access_token: "token" }),
  }));
  const call = await start(t);
  const res = await call("/oauth/access_token?code=grant", { origin: "" });
  assert.equal(res.status, 200);
  assert.equal(res.headers["access-control-allow-origin"], undefined);
});

for (const [label, path, options, status] of [
  [
    "untrusted origin",
    "/oauth/access_token?code=grant",
    { origin: "https://attacker.example" },
    403,
  ],
  ["wrong route", "/other?code=grant", {}, 404],
  ["wrong method", "/oauth/access_token?code=grant", { method: "POST" }, 405],
  ["missing code", "/oauth/access_token", {}, 400],
  ["empty code", "/oauth/access_token?code=", {}, 400],
  ["duplicate code", "/oauth/access_token?code=one&code=two", {}, 400],
  ["oversized code", `/oauth/access_token?code=${"x".repeat(2049)}`, {}, 400],
  ["malformed URL", "//[", {}, 400],
]) {
  test(
    `rejects ${label} without contacting GitHub`,
    { timeout: 2000 },
    async (t) => {
      t.mock.method(globalThis, "fetch", () =>
        assert.fail("must not contact GitHub"),
      );
      const call = await start(t);
      const res = await call(path, options);
      assert.equal(res.status, status);
      assert.equal(res.headers["cache-control"], "no-store");
      assert.equal(res.body.includes(config.clientSecret), false);
      if (status === 403)
        assert.equal(res.headers["access-control-allow-origin"], undefined);
    },
  );
}

test("preflight supports only GET for the allowed origin", async (t) => {
  t.mock.method(globalThis, "fetch", () =>
    assert.fail("must not contact GitHub"),
  );
  const call = await start(t);
  const res = await call("/oauth/access_token", { method: "OPTIONS" });
  assert.equal(res.status, 204);
  assert.equal(res.headers["access-control-allow-methods"], "GET");
});

for (const [label, response] of [
  ["HTTP failure", { ok: false, data: { access_token: "bad" } }],
  [
    "OAuth failure",
    {
      ok: true,
      data: {
        error: "bad_verification_code",
        error_description: "sensitive details",
      },
    },
  ],
  ["empty token", { ok: true, data: { access_token: "" } }],
  ["non-string token", { ok: true, data: { access_token: 12 } }],
  ["null JSON", { ok: true, data: null }],
  [
    "OAuth error with token",
    { ok: true, data: { error: "bad_verification_code", access_token: "bad" } },
  ],
]) {
  test(`upstream ${label} returns a generic error`, async (t) => {
    t.mock.method(globalThis, "fetch", async () => ({
      ok: response.ok,
      json: async () => response.data,
    }));
    const call = await start(t);
    const res = await call("/oauth/access_token?code=grant");
    assert.equal(res.status, 502);
    assert.deepEqual(JSON.parse(res.body), { error: "oauth_exchange_failed" });
  });
}

test("network failure does not reveal credentials or upstream details", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error(config.clientSecret);
  });
  const call = await start(t);
  const res = await call("/oauth/access_token?code=grant");
  assert.equal(res.status, 502);
  assert.deepEqual(JSON.parse(res.body), { error: "oauth_exchange_failed" });
});

test("proxy requires credentials and an exact HTTP(S) origin", () => {
  for (const key of ["clientID", "clientSecret", "allowedOrigin"]) {
    assert.throws(() => createOAuthServer({ ...config, [key]: "" }));
  }
  for (const allowedOrigin of [
    "*",
    "https://site.example/path",
    "https://site.example/",
    "file:///tmp/site",
    "https://user:pass@site.example",
  ]) {
    assert.throws(() => createOAuthServer({ ...config, allowedOrigin }));
  }
});
