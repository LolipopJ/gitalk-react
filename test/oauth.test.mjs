import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

import ts from "typescript";

const loadUserService = (fetch) => {
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
    window: { location: { href: "https://site.example/article" } },
    require: (path) => {
      if (path === "../utils/query") {
        return {
          stringifySearchQuery: (query) =>
            new URLSearchParams(query).toString(),
        };
      }
      if (path === "../constants") {
        return {
          DEFAULT_PROXY:
            "https://cors-anywhere.azm.workers.dev/https://github.com/login/oauth/access_token",
        };
      }
      throw new Error(`Unexpected import: ${path}`);
    },
  });
  return exports;
};

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

const loadGitalk = () => {
  const requests = [];
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
    useEffect: () => {},
    useMemo: (fn) => fn(),
    useRef: () => ({ current: null }),
    useState: (initial) => [initial, () => {}],
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
          useRequest: (service, options) => {
            requests.push({ service, options });
            return { loading: false, run: () => {}, mutate: () => {} };
          },
        };
      if (path === "classnames")
        return { __esModule: true, default: () => "gt-container" };
      if (path === "./constants")
        return {
          ACCESS_TOKEN_KEY: "GT_ACCESS_TOKEN",
          DATE_FNS_LOCALE_MAP: {},
          DEFAULT_LABELS: ["Gitalk"],
        };
      if (path === "./i18n")
        return { __esModule: true, default: () => ({ t: (key) => key }) };
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
          getAccessToken: async (options) => {
            exchanged.push(options);
            return "component-token";
          },
        };
      if (path === "./services/request")
        return { __esModule: true, default: () => ({}) };
      if (path === "./contexts/I18nContext")
        return { __esModule: true, default: { Provider: "provider" } };
      return { __esModule: true, default: () => null };
    },
  });
  return { Gitalk: exports.default, requests, logs, exchanged, storage };
};

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
