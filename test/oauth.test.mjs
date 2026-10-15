import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

import { Octokit } from "octokit";
import ts from "typescript";

const loadUserService = (fetch, browser = {}) => {
  const location = new URL("https://site.example/article?view=all#comments");
  const storage = new Map();
  const source = readFileSync(
    new URL("../lib/services/user.ts", import.meta.url),
    "utf8",
  );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    fetch,
    URL,
    URLSearchParams,
    crypto: webcrypto,
    sessionStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    window: { location },
    history: { replaceState: (_state, _title, url) => (location.href = url) },
    ...browser,
    require: (path) => {
      if (path === "../constants") {
        return {
          DEFAULT_PROXY:
            "https://cors-anywhere.azm.workers.dev/https://github.com/login/oauth/access_token",
        };
      }
      throw new Error(`Unexpected import: ${path}`);
    },
  });
  return { ...exports, location, storage };
};

test("authorization creates unpredictable, per-login state and consumes it once", () => {
  const service = loadUserService();
  const first = new URL(service.getAuthorizeUrl("app"));
  const second = new URL(service.getAuthorizeUrl("app"));
  const state = second.searchParams.get("state");
  assert.match(state, /^[a-f0-9]{64}$/);
  assert.notEqual(first.searchParams.get("state"), state);
  assert.equal(second.searchParams.get("redirect_uri"), service.location.href);
  service.location.search = `?view=all&code=grant&state=${state}`;
  assert.equal(service.consumeOAuthCallback("app"), "grant");
  assert.equal(
    service.location.href,
    "https://site.example/article?view=all#comments",
  );
  service.location.search = `?code=grant&state=${state}`;
  assert.throws(() => service.consumeOAuthCallback("app"), /state/i);
});

for (const scenario of [
  "missing",
  "mismatch",
  "expired",
  "other app",
  "other tab",
  "duplicate state",
  "duplicate code",
]) {
  test(`rejects ${scenario} state before exchanging code`, () => {
    let now = 1000;
    const service = loadUserService(undefined, { Date: { now: () => now } });
    const state = new URL(service.getAuthorizeUrl("app")).searchParams.get(
      "state",
    );
    if (scenario === "expired") now += 10 * 60 * 1000;
    if (scenario === "other tab") service.storage.clear();
    service.location.search = `?code=grant${scenario === "missing" ? "" : `&state=${scenario === "mismatch" ? "wrong" : state}`}${scenario === "duplicate state" ? `&state=${state}` : ""}${scenario === "duplicate code" ? "&code=other" : ""}`;
    assert.throws(
      () =>
        service.consumeOAuthCallback(
          scenario === "other app" ? "another" : "app",
        ),
      /state|callback/i,
    );
    assert.equal(service.location.search, "");
  });
}

test("denied authorization is consumed, displayed, and removed from the URL", () => {
  const service = loadUserService();
  const state = new URL(service.getAuthorizeUrl("app")).searchParams.get(
    "state",
  );
  service.location.search = `?view=all&error=access_denied&error_description=User+denied&error_uri=https://github.com&state=${state}`;
  assert.throws(() => service.consumeOAuthCallback("app"), /User denied/);
  assert.equal(
    service.location.href,
    "https://site.example/article?view=all#comments",
  );
  assert.equal(service.storage.size, 0);
});

for (const auth of [
  { proxy: "/oauth/access_token" },
  { clientSecret: "secret" },
]) {
  test(`OAuth errors stay errors with ${Object.keys(auth)[0]}`, async () => {
    const service = loadUserService(async () => ({
      ok: true,
      json: async () => ({
        error: "bad_verification_code",
        error_description: "The code has expired",
      }),
    }));
    await assert.rejects(
      service.getAccessToken({ code: "grant", clientID: "app", ...auth }),
      /The code has expired/,
    );
  });
  test(`whitespace token is rejected with ${Object.keys(auth)[0]}`, async () => {
    const service = loadUserService(async () => ({
      ok: true,
      json: async () => ({ access_token: "  " }),
    }));
    await assert.rejects(
      service.getAccessToken({ code: "grant", clientID: "app", ...auth }),
    );
  });
}

test("proxy without a client secret receives only an encoded code", async () => {
  const calls = [];
  const { getAccessToken } = loadUserService(async (...args) => {
    calls.push(args);
    return { ok: true, json: async () => ({ access_token: "proxy-token" }) };
  });
  const token = await getAccessToken({
    proxy: "https://proxy.example/oauth/access_token?tenant=blog#fragment",
    code: "code &+?=",
    clientID: "public-client",
  });
  assert.equal(token, "proxy-token");
  assert.equal(calls.length, 1);
  const [url, options] = calls[0];
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("tenant"), "blog");
  assert.equal(parsed.searchParams.get("code"), "code &+?=");
  assert.equal(parsed.hash, "#fragment");
  assert.equal(options.method ?? "GET", "GET");
  assert.equal(options.body, undefined);
  assert.equal(JSON.stringify(calls).includes("public-client"), false);
  assert.equal(options.cache, "no-store");
  assert.equal(options.referrerPolicy, "no-referrer");
});

test("proxy mode supports relative URLs without a client secret", async () => {
  const { getAccessToken } = loadUserService(async (url) => {
    assert.equal(url, "https://site.example/oauth/access_token?code=grant");
    return { ok: true, json: async () => ({ access_token: "relative-token" }) };
  });
  assert.equal(
    await getAccessToken({
      proxy: "/oauth/access_token",
      code: "grant",
      clientID: "public",
    }),
    "relative-token",
  );
});

test("explicit client secret still uses the existing POST exchange without a proxy", async () => {
  const { getAccessToken } = loadUserService(async (url, options) => {
    assert.equal(
      url,
      "https://cors-anywhere.azm.workers.dev/https://github.com/login/oauth/access_token",
    );
    assert.equal(options.method, "POST");
    assert.deepEqual(JSON.parse(options.body), {
      code: "grant",
      client_id: "public",
      client_secret: "explicit-secret",
    });
    return { ok: true, json: async () => ({ access_token: "legacy-token" }) };
  });
  assert.equal(
    await getAccessToken({
      code: "grant",
      clientID: "public",
      clientSecret: "explicit-secret",
    }),
    "legacy-token",
  );
});

test("missing proxy and secret fails before sending a request", async () => {
  const { getAccessToken } = loadUserService(() =>
    assert.fail("must not fetch without configuration"),
  );
  await assert.rejects(
    getAccessToken({ code: "grant", clientID: "public" }),
    /proxy|clientSecret/,
  );
});

test("client secret with an empty optional proxy uses the default CORS service", async () => {
  const { getAccessToken } = loadUserService(async (url, options) => {
    assert.equal(
      url,
      "https://cors-anywhere.azm.workers.dev/https://github.com/login/oauth/access_token",
    );
    assert.equal(options.method, "POST");
    assert.equal(JSON.parse(options.body).client_secret, "secret");
    return { ok: true, json: async () => ({ access_token: "default-token" }) };
  });
  assert.equal(
    await getAccessToken({
      proxy: "",
      code: "grant",
      clientID: "public",
      clientSecret: "secret",
    }),
    "default-token",
  );
});

test("client secret with a custom proxy posts credentials to the selected CORS service", async () => {
  const { getAccessToken } = loadUserService(async (url, options) => {
    assert.equal(url, "https://cors.example/github?tenant=blog");
    assert.equal(options.method, "POST");
    assert.deepEqual(JSON.parse(options.body), {
      code: "grant",
      client_id: "public",
      client_secret: "explicit-secret",
    });
    return {
      ok: true,
      json: async () => ({ access_token: "custom-cors-token" }),
    };
  });
  assert.equal(
    await getAccessToken({
      proxy: "https://cors.example/github?tenant=blog",
      code: "grant",
      clientID: "public",
      clientSecret: "explicit-secret",
    }),
    "custom-cors-token",
  );
});

test("an empty proxy without a client secret fails before sending a request", async () => {
  const { getAccessToken } = loadUserService(() =>
    assert.fail("must not fetch"),
  );
  await assert.rejects(
    getAccessToken({ proxy: "", code: "grant", clientID: "public" }),
    /proxy/,
  );
});

test("a failed proxy request cannot fall back to sending credentials", async () => {
  let calls = 0;
  const { getAccessToken } = loadUserService(async () => {
    calls++;
    throw new Error("proxy unavailable");
  });
  await assert.rejects(
    getAccessToken({
      proxy: "https://proxy.example/token",
      code: "grant",
      clientID: "public",
    }),
    /proxy unavailable/,
  );
  assert.equal(calls, 1);
});

for (const response of [
  { ok: false, data: { access_token: "not-a-success" } },
  { ok: true, data: { error: "bad_verification_code" } },
  { ok: true, data: { access_token: 123 } },
  { ok: true, data: { access_token: "" } },
  {
    ok: true,
    data: { error: "bad_verification_code", access_token: "bad-token" },
  },
  { ok: true, data: null },
]) {
  test(`invalid OAuth response is rejected: ${JSON.stringify(response)}`, async () => {
    const { getAccessToken } = loadUserService(async () => ({
      ok: response.ok,
      json: async () => response.data,
    }));
    await assert.rejects(
      getAccessToken({
        proxy: "https://proxy.example/token",
        code: "grant",
        clientID: "public",
      }),
    );
  });
}

const loadGitalk = (consumeOAuthCallback = () => undefined) => {
  const requests = [];
  const states = [];
  const memoized = [];
  const clients = [];
  const effects = [];
  let stateIndex = 0;
  let requestIndex = 0;
  let memoizedIndex = 0;
  const logs = [];
  const exchanged = [];
  const source = readFileSync(
    new URL("../lib/gitalk.tsx", import.meta.url),
    "utf8",
  );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
      target: ts.ScriptTarget.ES2020,
    },
  });
  const exports = {};
  const location = {
    href: "https://site.example/article",
    host: "site.example",
    pathname: "/article",
  };
  const storage = new Map();
  const hooks = {
    useCallback: (fn) => fn,
    useEffect: (fn) => effects.push(fn),
    useLayoutEffect: () => {},
    useMemo: (fn) => fn(),
    useRef: () => ({ current: null }),
    useState: (initial) => {
      const index = stateIndex++;
      if (!(index in states))
        states[index] = typeof initial === "function" ? initial() : initial;
      return [
        states[index],
        (value) => {
          states[index] =
            typeof value === "function" ? value(states[index]) : value;
        },
      ];
    },
  };
  vm.runInNewContext(outputText, {
    exports,
    location,
    window: { location },
    navigator: { language: "en" },
    document: { title: "Article", querySelector: () => null },
    localStorage: {
      getItem: (key) => storage.get(key),
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    require: (path) => {
      if (path === "react")
        return {
          __esModule: true,
          ...hooks,
          default: {
            createElement: (type, props, ...children) => ({
              type,
              props,
              children,
            }),
          },
        };
      if (path === "ahooks")
        return {
          useMemoizedFn: (fn) => {
            const index = memoizedIndex++;
            memoized[index] ??= {
              run: (...args) => memoized[index].fn(...args),
            };
            memoized[index].fn = fn;
            return memoized[index].run;
          },
          useRequest: (service, options) => {
            const index = requestIndex++;
            const entry = (requests[index] ??= {
              cancelled: 0,
              runs: [],
              cancel: () => entry.cancelled++,
              mutate: (data) => {
                entry.data = data;
              },
              run: (...args) => entry.runs.push(args),
            });
            Object.assign(entry, { service, options });
            return { ...entry, loading: false };
          },
        };
      if (path === "classnames")
        return { __esModule: true, default: () => "gt-container" };
      if (path === "./constants")
        return {
          ACCESS_TOKEN_KEY: "GT_ACCESS_TOKEN",
          DEFAULT_LABELS: ["Gitalk"],
        };
      if (path === "./i18n")
        return {
          __esModule: true,
          default: () => ({ t: (key) => key, locale: () => "en" }),
        };
      if (path === "./utils/compatibility")
        return { supportsCSSVariables: () => true, supportsES2020: () => true };
      if (path === "./utils/logger")
        return {
          __esModule: true,
          default: {
            s: (...args) => logs.push(args),
            e: (...args) => logs.push(args),
          },
        };
      if (path === "./services/user")
        return {
          getAuthorizeUrl: () => "https://github.com/login/oauth/authorize",
          consumeOAuthCallback,
          getAccessToken: async (options) => {
            exchanged.push(options);
            return "component-token";
          },
        };
      if (path === "./services/request")
        return {
          __esModule: true,
          default: (token, onUnauthorized) => {
            const client = { token, onUnauthorized };
            clients.push(client);
            return client;
          },
        };
      if (path === "./contexts/I18nContext")
        return { __esModule: true, default: { Provider: "provider" } };
      return { __esModule: true, default: () => null };
    },
  });
  const Gitalk = (props) => {
    stateIndex = requestIndex = memoizedIndex = 0;
    effects.length = 0;
    return exports.default(props);
  };
  return {
    Gitalk,
    requests,
    logs,
    exchanged,
    storage,
    clients,
    effects,
    states,
  };
};

test("401 clears a freshly exchanged session and pending authenticated requests", () => {
  const app = loadGitalk();
  const props = {
    clientID: "public",
    proxy: "/oauth/access_token",
    owner: "owner",
    repo: "repo",
    admin: ["owner"],
  };
  app.Gitalk(props);
  app.requests[0].options.onSuccess("fresh-token");
  app.requests[1].mutate({ login: "owner" });
  const privateComments = [{ id: 1 }];
  app.requests[4].options.onSuccess({ comments: privateComments });
  app.Gitalk(props);
  const client = app.clients.at(-1);
  assert.equal(client.token, "fresh-token");
  client.onUnauthorized();
  assert.equal(app.storage.has("GT_ACCESS_TOKEN"), false);
  assert.equal(app.requests[1].data, undefined);
  assert.equal(app.requests[0].cancelled, 0);
  assert.ok(app.requests[1].cancelled);
  assert.ok(app.requests[4].cancelled);
  assert.equal(app.states.includes(privateComments), false);
  app.Gitalk(props);
  assert.equal(app.clients.at(-1).token, undefined);
  assert.equal(app.requests[1].options.ready, false);
  app.requests[0].options.onSuccess("next-token");
  app.Gitalk(props);
  client.onUnauthorized();
  assert.equal(app.storage.get("GT_ACCESS_TOKEN"), "next-token");
});

test("invalid callbacks show an error without starting an exchange or storing a token", () => {
  const app = loadGitalk(() => {
    throw new Error("Invalid OAuth state");
  });
  app.Gitalk({
    clientID: "public",
    proxy: "/oauth/access_token",
    owner: "owner",
    repo: "repo",
    admin: ["owner"],
  });
  app.effects[0]();
  assert.equal(app.requests[0].runs.length, 0);
  assert.equal(app.storage.size, 0);
  assert.ok(
    app.states.some(
      (value) =>
        typeof value === "string" && value.includes("Invalid OAuth state"),
    ),
  );
});

test("a valid callback exchanges once and does not loop when the effect runs again", () => {
  let code = "grant";
  const app = loadGitalk(() => {
    const result = code;
    code = undefined;
    return result;
  });
  const props = {
    clientID: "public",
    proxy: "/oauth/access_token",
    owner: "owner",
    repo: "repo",
    admin: ["owner"],
  };
  app.Gitalk(props);
  app.effects[0]();
  app.effects[0]();
  assert.deepEqual(
    app.requests[0].runs.map((args) => args[0]),
    ["grant"],
  );
  app.requests[0].options.onSuccess("fresh-token");
  app.Gitalk(props);
  assert.equal(app.clients.at(-1).token, "fresh-token");
});

for (const auth of [
  { proxy: "/oauth/access_token" },
  { clientSecret: "explicit-secret" },
]) {
  test(`a validated callback replaces a cached token with ${Object.keys(auth)[0]}`, async () => {
    const service = loadUserService();
    const state = new URL(service.getAuthorizeUrl("public")).searchParams.get(
      "state",
    );
    service.location.search = `?code=grant&state=${state}`;
    const app = loadGitalk(() => service.consumeOAuthCallback("public"));
    const props = {
      clientID: "public",
      owner: "owner",
      repo: "repo",
      admin: ["owner"],
      ...auth,
    };
    app.storage.set("GT_ACCESS_TOKEN", "cached-token");
    app.Gitalk(props);
    const oldClient = app.clients.at(-1);

    app.effects[0]();
    assert.deepEqual(
      app.requests[0].runs.map((args) => args[0]),
      ["grant"],
    );
    assert.equal(service.location.search, "");
    assert.equal(service.storage.size, 0);

    oldClient.onUnauthorized();
    assert.equal(app.requests[0].cancelled, 0);
    const token = await app.requests[0].service("grant");
    app.requests[0].options.onSuccess(token);
    app.Gitalk(props);
    app.effects[0]();
    assert.equal(app.clients.at(-1).token, "component-token");
    assert.equal(app.requests[0].runs.length, 1);
    assert.equal(app.exchanged[0].clientSecret, auth.clientSecret);
    assert.equal(app.exchanged[0].proxy, auth.proxy);

    oldClient.onUnauthorized();
    assert.equal(app.storage.get("GT_ACCESS_TOKEN"), "component-token");
  });
}

test("a failed exchange preserves guest comments and pending public reads", () => {
  const app = loadGitalk();
  app.Gitalk({
    clientID: "public",
    proxy: "/oauth/access_token",
    owner: "owner",
    repo: "repo",
    admin: ["owner"],
  });
  const comments = [{ id: 1 }];
  app.requests[4].options.onSuccess({ comments });
  app.requests[0].options.onError(new Error("bad_verification_code"));
  assert.equal(
    app.states.some(
      (value) =>
        Array.isArray(value) &&
        value.length === comments.length &&
        value.every((comment, index) => comment === comments[index]),
    ),
    true,
  );
  assert.equal(app.requests[3].cancelled, 0);
  assert.equal(app.storage.size, 0);
});

const loadRequestService = (OctokitImplementation) => {
  const source = readFileSync(
    new URL("../lib/services/request.ts", import.meta.url),
    "utf8",
  );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    require: (path) => {
      if (path === "octokit") return { Octokit: OctokitImplementation };
      return { __esModule: true, default: { w: () => {} } };
    },
  });
  return exports.getOctokitInstance;
};

test("Octokit reports authenticated 401s to the session owner and rethrows errors", () => {
  let onError;
  let cleared = 0;
  const getOctokitInstance = loadRequestService(
    class {
      hook = {
        error: (_event, fn) => {
          onError = fn;
        },
      };
    },
  );
  getOctokitInstance("token", () => cleared++);
  const error = { status: 401 };
  assert.throws(
    () => onError(error),
    (value) => value === error,
  );
  assert.equal(cleared, 1);
  assert.throws(() => onError({ status: 403 }));
  assert.equal(cleared, 1);
  getOctokitInstance(undefined, () => cleared++);
  assert.throws(() => onError(error));
  assert.equal(cleared, 1);
});

test("real Octokit REST and GraphQL 401s both invalidate the session", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(JSON.stringify({ message: "Bad credentials" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
  );
  let cleared = 0;
  const octokit = loadRequestService(Octokit)("invalid-token", () => cleared++);
  await assert.rejects(octokit.request("GET /user"), { status: 401 });
  assert.equal(cleared, 1);
  await assert.rejects(octokit.graphql("query { viewer { login } }"), {
    status: 401,
  });
  assert.equal(cleared, 2);
});

for (const auth of [
  { proxy: "https://proxy.example/token" },
  { clientSecret: "explicit-secret" },
  { clientSecret: "explicit-secret", proxy: "" },
  { proxy: "https://proxy.example/token", clientSecret: "explicit-secret" },
]) {
  test(`Gitalk renders and enables token exchange with ${Object.keys(auth).join("+")}`, async () => {
    const { Gitalk, requests, logs, exchanged, storage } = loadGitalk();
    const rendered = Gitalk({
      clientID: "public",
      owner: "owner",
      repo: "repo",
      admin: ["owner"],
      ...auth,
    });
    assert.ok(rendered);
    assert.equal(requests[0].options.ready, true);
    assert.equal(await requests[0].service("grant"), "component-token");
    assert.equal(exchanged[0].proxy, auth.proxy);
    assert.equal(exchanged[0].code, "grant");
    requests[0].options.onSuccess("component-token");
    assert.equal(storage.get("GT_ACCESS_TOKEN"), "component-token");
    assert.equal(JSON.stringify(logs).includes("component-token"), false);
  });
}

test("Gitalk requires a proxy when no client secret is provided", () => {
  for (const auth of [{}, { proxy: "" }]) {
    const { Gitalk, requests } = loadGitalk();
    assert.equal(
      Gitalk({
        clientID: "public",
        owner: "owner",
        repo: "repo",
        admin: ["owner"],
        ...auth,
      }),
      null,
    );
    assert.equal(requests[0].options.ready, false);
  }
});
