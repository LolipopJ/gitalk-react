import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import test from "node:test";
import vm from "node:vm";

import { RequestError } from "octokit";
import ts from "typescript";

import { loadSource } from "./helpers/source.mjs";

// Run the component and the installed ahooks implementation with controlled
// effects and network responses, without a browser or another test dependency.
const mountGitalk = ({
  authenticated = false,
  preview = false,
  ...initialProps
} = {}) => {
  const slots = [];
  const effects = [];
  const layoutEffects = [];
  const timers = new Set();
  const calls = [];
  const createdIssues = [];
  const createdComments = [];
  const previewErrors = [];
  let index = 0;
  let dirty = true;
  let tree;
  let props = {
    clientID: "client",
    proxy: "https://oauth.example/token",
    owner: "owner",
    repo: "repo",
    admin: ["admin"],
    number: 1,
    onCreateIssue: (issue) => createdIssues.push(issue),
    onCreateComment: (comment) => createdComments.push(comment),
    ...initialProps,
  };
  const sameDeps = (a, b) =>
    !!a &&
    !!b &&
    a.length === b.length &&
    a.every((v, i) => Object.is(v, b[i]));
  const useState = (initial) => {
    const slotIndex = index++;
    if (!slots[slotIndex]) {
      const slot = {
        value: typeof initial === "function" ? initial() : initial,
      };
      slot.set = (value) => {
        const next = typeof value === "function" ? value(slot.value) : value;
        if (!Object.is(next, slot.value)) {
          slot.value = next;
          dirty = true;
        }
      };
      slots[slotIndex] = slot;
    }
    return [slots[slotIndex].value, slots[slotIndex].set];
  };
  const useRef = (initial) => {
    const slotIndex = index++;
    return (slots[slotIndex] ??= { current: initial });
  };
  const useMemo = (fn, deps) => {
    const slotIndex = index++;
    if (!sameDeps(slots[slotIndex]?.deps, deps)) {
      slots[slotIndex] = { deps, value: fn() };
    }
    return slots[slotIndex].value;
  };
  const queueEffect = (queue, fn, deps) => {
    const slotIndex = index++;
    if (!sameDeps(slots[slotIndex]?.deps, deps)) {
      const previous = slots[slotIndex];
      const slot = (slots[slotIndex] = { deps });
      queue.push({ previous, slot, fn });
    }
  };
  const react = {
    useState,
    forwardRef: (render) => (props) => render(props, null),
    useContext: () => ({ polyglot: { t: (key) => key } }),
    useRef,
    useMemo,
    useCallback: (fn, deps) => useMemo(() => fn, deps),
    useEffect: (fn, deps) => queueEffect(effects, fn, deps),
    useLayoutEffect: (fn, deps) => queueEffect(layoutEffects, fn, deps),
    createElement: (type, props, ...children) => ({ type, props, children }),
  };
  const setTimeout = (fn) => {
    timers.add(fn);
    return fn;
  };
  const clearTimeout = (fn) => timers.delete(fn);
  const octokit = {
    request: (route, params) => {
      return new Promise((resolve, reject) => {
        calls.push({ route, params, resolve, reject });
      });
    },
    graphql: (query, params) =>
      new Promise((resolve, reject) => {
        calls.push({ route: "graphql", params, resolve, reject });
      }),
  };
  if (preview) {
    props = {
      value: "**draft**",
      octokit,
      onLogin() {},
      async onCreateComment() {},
      createCommentLoading: false,
      onPreviewError: (error) => previewErrors.push(error),
      ...initialProps,
    };
  }
  const storage = new Map(authenticated ? [["GT_ACCESS_TOKEN", "token"]] : []);
  const context = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    location: { host: "site.example", pathname: "/article" },
    window: {
      location: { origin: "https://site.example", pathname: "/article" },
    },
    navigator: { language: "en" },
    document: { title: "Article", querySelector: () => null },
    localStorage: {
      getItem: (key) => storage.get(key),
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    process,
  });
  const modules = new Map();
  const require = createRequire(import.meta.url);
  const loadAhooks = (filename) => {
    if (modules.has(filename)) return modules.get(filename).exports;
    const module = { exports: {} };
    modules.set(filename, module);
    const localRequire = createRequire(filename);
    const load = (name) => {
      if (name === "react") return react;
      const resolved = localRequire.resolve(name);
      return resolved.includes(`${join("ahooks", "lib")}`)
        ? loadAhooks(resolved)
        : localRequire(name);
    };
    const fn = vm.runInContext(
      `(function(require, module, exports) { ${readFileSync(filename, "utf8")}\n})`,
      context,
      { filename },
    );
    fn(load, module, module.exports);
    return module.exports;
  };
  const useRequest = loadAhooks(
    join(dirname(require.resolve("ahooks")), "useRequest/src/useRequest.js"),
  ).default;
  const useMemoizedFn = loadAhooks(
    join(dirname(require.resolve("ahooks")), "useMemoizedFn/index.js"),
  ).default;
  const source = readFileSync(
    new URL(
      preview ? "../lib/components/comment-textarea.tsx" : "../lib/gitalk.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
      target: ts.ScriptTarget.ES2020,
    },
  });
  context.exports = {};
  context.require = (name) => {
    if (name === "./utils/storage")
      return loadSource("utils/storage.ts", {
        globals: { localStorage: context.localStorage },
      });
    if (name === "./utils/reactions") return loadSource("utils/reactions.ts");
    if (name === "react") return { __esModule: true, ...react, default: react };
    if (name === "ahooks") return { useRequest, useMemoizedFn };
    if (name === "classnames") return { __esModule: true, default: () => "gt" };
    if (name === "octokit") return require(name);
    if (name === "./constants") {
      return {
        ACCESS_TOKEN_KEY: "GT_ACCESS_TOKEN",
        DEFAULT_LABELS: ["Gitalk"],
        DEFAULT_USER: {},
      };
    }
    if (name === "./i18n") {
      return {
        __esModule: true,
        default: () => ({ t: (key) => key, locale: () => "en" }),
      };
    }
    if (name === "./utils/compatibility") {
      return { supportsCSSVariables: () => true, supportsES2020: () => true };
    }
    if (name === "./services/user")
      return { consumeOAuthCallback: () => undefined };
    if (name === "./utils/logger") {
      return { __esModule: true, default: { i() {}, s() {}, w() {}, e() {} } };
    }
    if (name === "./services/request") {
      return { __esModule: true, default: () => octokit };
    }
    if (name === "./services/graphql/comment")
      return { getIssueCommentsQL: () => "query" };
    if (name === "./contexts/I18nContext") {
      return { __esModule: true, default: { Provider: "provider" } };
    }
    return { __esModule: true, default: name };
  };
  vm.runInContext(outputText, context);
  const Gitalk = context.exports.default;
  const flushEffects = (queue) => {
    const pending = queue.splice(0);
    for (const effect of pending) effect.previous?.cleanup?.();
    for (const effect of pending) effect.slot.cleanup = effect.fn();
  };
  const render = (flushPassive = true) => {
    let renders = 0;
    while (dirty || (flushPassive && effects.length)) {
      assert.ok(renders++ < 30, "effects must settle");
      if (dirty) {
        dirty = false;
        index = 0;
        tree = Gitalk(props);
        flushEffects(layoutEffects);
      }
      if (flushPassive) flushEffects(effects);
    }
  };
  const settle = async (flushPassive = true) => {
    for (let i = 0; i < 8; i++) {
      await Promise.resolve();
      render(flushPassive);
      if (flushPassive) {
        const pending = [...timers];
        timers.clear();
        for (const fn of pending) fn();
      }
    }
    render(flushPassive);
  };
  const component = (name) => {
    const find = (node) => {
      if (!node || typeof node !== "object") return;
      if (node.type === `./components/${name}`) return node.props;
      for (const child of node.children?.flat(Infinity) ?? []) {
        const result = find(child);
        if (result) return result;
      }
    };
    return find(tree);
  };
  render();
  return {
    calls,
    previewErrors,
    tree: () => tree,
    createdIssues,
    createdComments,
    settle,
    component,
    switchArticle: (next, flushPassive = true) => {
      props = { ...props, ...next };
      dirty = true;
      render(flushPassive);
    },
    type: (text) => {
      component("comment-textarea").onChange({ target: { value: text } });
      render();
    },
    unmount: () => {
      for (const slot of slots) slot?.cleanup?.();
      timers.clear();
    },
  };
};

const issueRoute = "GET /repos/{owner}/{repo}/issues/{issue_number}";
const issuesRoute = "GET /repos/{owner}/{repo}/issues";
const createIssueRoute = "POST /repos/{owner}/{repo}/issues";
const findNode = (node, predicate) => {
  if (!node || typeof node !== "object") return undefined;
  if (predicate(node)) return node;
  for (const child of node.children?.flat(Infinity) ?? []) {
    const result = findNode(child, predicate);
    if (result) return result;
  }
};
const alertText = (app) =>
  findNode(app.tree(), (node) => node.props?.className === "gt-error")
    ?.children[0];
const requestError = (status, message) =>
  new RequestError(message, status, {
    request: { method: "GET", url: "https://api.github.com", headers: {} },
  });

for (const authenticated of [false, true]) {
  test(`closed issues found by label remain the discussion without duplicate initialization (${authenticated})`, async () => {
    const app = mountGitalk({ authenticated, number: undefined });
    if (authenticated) {
      app.calls
        .find((call) => call.route === "GET /user")
        .resolve({ status: 200, data: { login: "admin" } });
      await app.settle();
    }
    const lookup = app.calls
      .filter((call) => call.route === issuesRoute)
      .at(-1);
    lookup.resolve({
      status: 200,
      data:
        lookup.params.state === "all"
          ? [{ number: 7, state: "closed", comments: 0 }]
          : [],
    });
    await app.settle();
    assert.equal(app.component("meta")?.issue?.number, 7);
    assert.equal(
      app.calls.filter((call) => call.route === createIssueRoute).length,
      0,
    );
    app.unmount();
  });
}

test("a throwing onCreateIssue callback does not report successful initialization as a failure", async () => {
  const app = mountGitalk({
    authenticated: true,
    number: undefined,
    onCreateIssue: () => {
      throw new Error("Consumer issue failed");
    },
  });
  app.calls
    .find((call) => call.route === "GET /user")
    .resolve({ status: 200, data: { login: "admin" } });
  await app.settle();
  app.calls
    .filter((call) => call.route === issuesRoute)
    .at(-1)
    .resolve({ status: 200, data: [] });
  await app.settle();
  app.calls
    .find((call) => call.route === createIssueRoute)
    .resolve({ status: 201, data: { number: 7, comments: 0 } });
  await app.settle();
  assert.equal(app.component("meta")?.issue?.number, 7);
  assert.equal(alertText(app), undefined);
  app.unmount();
});

test("a missing numbered issue is handled as an uninitialized discussion", async () => {
  const app = mountGitalk({ createIssueManually: true });
  app.calls
    .find((call) => call.route === issueRoute)
    .reject(requestError(404, "Not Found"));
  await app.settle();
  assert.equal(alertText(app), undefined);
  assert.ok(
    findNode(app.tree(), (node) => node.props?.className === "gt-no-init"),
  );
  app.unmount();
});

test("failed repository lookup reports the error without creating an issue", async () => {
  const app = mountGitalk({ authenticated: true, number: undefined });
  app.calls
    .find((call) => call.route === "GET /user")
    .resolve({ status: 200, data: { login: "admin" } });
  await app.settle();
  app.calls
    .filter((call) => call.route === issuesRoute)
    .at(-1)
    .reject(requestError(404, "Repository not found"));
  await app.settle();
  assert.equal(alertText(app), "Repository not found");
  assert.equal(
    app.calls.filter((call) => call.route === createIssueRoute).length,
    0,
  );
  app.unmount();
});

test("automatic initialization waits for administrator details after an empty lookup", async () => {
  const app = mountGitalk({ authenticated: true, number: undefined });
  app.calls
    .find((call) => call.route === issuesRoute)
    .resolve({ status: 200, data: [] });
  await app.settle();
  assert.equal(
    app.calls.filter((call) => call.route === createIssueRoute).length,
    0,
  );
  app.calls
    .find((call) => call.route === "GET /user")
    .resolve({ status: 200, data: { login: "admin" } });
  await app.settle();
  const lookups = app.calls.filter((call) => call.route === issuesRoute);
  assert.equal(lookups.length, 2);
  lookups[1].resolve({ status: 200, data: [] });
  await app.settle();
  assert.equal(
    app.calls.filter((call) => call.route === createIssueRoute).length,
    1,
  );
  app.calls
    .find((call) => call.route === createIssueRoute)
    .resolve({ status: 201, data: { number: 2, comments: 0 } });
  await app.settle();
  assert.equal(app.createdIssues.length, 1);
  app.unmount();
});

test("a failed user lookup is visible to the user", async () => {
  const app = mountGitalk({ authenticated: true });
  app.calls
    .find((call) => call.route === "GET /user")
    .reject(requestError(403, "API rate limit exceeded"));
  await app.settle();
  assert.equal(alertText(app), "API rate limit exceeded");
  app.unmount();
});

test("a rejected markdown preview reaches the preview error callback", async () => {
  const app = mountGitalk({ preview: true });
  findNode(app.tree(), (node) =>
    node.props?.className?.includes("gt-btn-preview"),
  ).props.onClick();
  await app.settle();
  assert.equal(
    findNode(app.tree(), (node) => node.type === "textarea").props.style
      .display,
    undefined,
  );
  const failure = requestError(422, "Invalid markdown request");
  app.calls.find((call) => call.route === "POST /markdown").reject(failure);
  await app.settle();
  assert.equal(app.previewErrors.length, 1);
  assert.equal(app.previewErrors[0], failure);
  assert.equal(
    findNode(app.tree(), (node) => node.type === "textarea").props.style
      .display,
    undefined,
  );
  app.unmount();
});

const previewButton = (app) =>
  findNode(app.tree(), (node) =>
    node.props?.className?.includes("gt-btn-preview"),
  ).props;
const previewHtml = (app) =>
  findNode(app.tree(), (node) =>
    node.props?.className?.includes("gt-header-preview"),
  ).props;

test("preview opens only on success and a failed refresh keeps the draft editable", async () => {
  const app = mountGitalk({ preview: true });
  previewButton(app).onClick();
  await app.settle();
  assert.equal(previewHtml(app).style.display, "none");
  app.calls[0].resolve({ data: "<p>First preview</p>" });
  await app.settle();
  assert.equal(previewHtml(app).style.display, undefined);
  assert.equal(
    previewHtml(app).dangerouslySetInnerHTML.__html,
    "<p>First preview</p>",
  );
  previewButton(app).onClick();
  await app.settle();
  app.switchArticle({ value: "Changed draft" });
  previewButton(app).onClick();
  await app.settle();
  app.calls[1].reject(new Error("Preview failed"));
  await app.settle();
  assert.equal(previewHtml(app).style.display, "none");
  assert.equal(previewButton(app).text, "preview");
  app.unmount();
});

for (const outcome of ["resolve", "reject"]) {
  test(`closing a pending preview ignores its late ${outcome}`, async () => {
    const app = mountGitalk({ preview: true });
    previewButton(app).onClick();
    await app.settle();
    assert.equal(previewButton(app).text, "edit");
    previewButton(app).onClick();
    await app.settle();
    app.calls[0][outcome](
      outcome === "resolve" ? { data: "old" } : new Error("old error"),
    );
    await app.settle();
    assert.equal(previewHtml(app).style.display, "none");
    assert.equal(previewHtml(app).dangerouslySetInnerHTML.__html, "");
    assert.equal(app.previewErrors.length, 0);
    previewButton(app).onClick();
    await app.settle();
    assert.equal(
      app.calls.length,
      2,
      "cancelled HTML must not populate the cache",
    );
    app.calls[1].resolve({ data: "new" });
    await app.settle();
    assert.equal(previewHtml(app).style.display, undefined);
    assert.equal(previewHtml(app).dangerouslySetInnerHTML.__html, "new");
    app.unmount();
  });
}

test("a newer preview wins when an older cancelled render finishes last", async () => {
  const app = mountGitalk({ preview: true });
  previewButton(app).onClick();
  await app.settle();
  previewButton(app).onClick();
  await app.settle();
  app.switchArticle({ value: "New draft" });
  previewButton(app).onClick();
  await app.settle();
  app.calls[1].resolve({ data: "new" });
  await app.settle();
  app.calls[0].resolve({ data: "old" });
  await app.settle();
  assert.equal(previewHtml(app).dangerouslySetInnerHTML.__html, "new");
  previewButton(app).onClick();
  await app.settle();
  previewButton(app).onClick();
  await app.settle();
  assert.equal(app.calls.length, 2);
  assert.equal(previewHtml(app).dangerouslySetInnerHTML.__html, "new");
  app.unmount();
});

test("editing the draft invalidates a pending preview", async () => {
  const app = mountGitalk({ preview: true });
  previewButton(app).onClick();
  await app.settle();
  app.switchArticle({ value: "New draft" });
  app.calls[0].resolve({ data: "old" });
  await app.settle();
  assert.equal(previewHtml(app).style.display, "none");
  assert.equal(previewButton(app).isLoading, false);
  assert.equal(previewButton(app).text, "preview");
  app.unmount();
});

for (const failure of [
  requestError(403, "Forbidden"),
  new Error("Network failed"),
]) {
  test(`failed issue lookup reports ${failure.message} without initialization`, async () => {
    const app = mountGitalk({ authenticated: true });
    app.calls
      .find((call) => call.route === "GET /user")
      .resolve({ status: 200, data: { login: "admin" } });
    await app.settle();
    app.calls
      .filter((call) => call.route === issueRoute)
      .at(-1)
      .reject(failure);
    await app.settle();
    assert.equal(alertText(app), failure.message);
    assert.equal(
      app.calls.filter((call) => call.route === createIssueRoute).length,
      0,
    );
    app.unmount();
  });
}

test("only a numbered issue 404 allows automatic creation", async () => {
  const app = mountGitalk({ authenticated: true });
  app.calls
    .find((call) => call.route === "GET /user")
    .resolve({ status: 200, data: { login: "admin" } });
  await app.settle();
  app.calls
    .filter((call) => call.route === issueRoute)
    .at(-1)
    .reject(requestError(404, "Not Found"));
  await app.settle();
  assert.equal(alertText(app), undefined);
  assert.equal(
    app.calls.filter((call) => call.route === createIssueRoute).length,
    1,
  );
  app.calls
    .find((call) => call.route === createIssueRoute)
    .reject(requestError(422, "Issue validation failed"));
  await app.settle();
  assert.equal(alertText(app), "Issue validation failed");
  app.unmount();
});

for (const options of [
  { createIssueManually: true, login: "admin" },
  { login: "reader" },
]) {
  test(`missing issues require automatic mode and an administrator (${JSON.stringify(options)})`, async () => {
    const { login, ...props } = options;
    const app = mountGitalk({
      authenticated: true,
      number: undefined,
      ...props,
    });
    app.calls
      .find((call) => call.route === "GET /user")
      .resolve({ status: 200, data: { login } });
    await app.settle();
    app.calls
      .filter((call) => call.route === issuesRoute)
      .at(-1)
      .resolve({ status: 200, data: [] });
    await app.settle();
    assert.equal(
      app.calls.filter((call) => call.route === createIssueRoute).length,
      0,
    );
    app.unmount();
  });
}
