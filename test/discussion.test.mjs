import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import test from "node:test";
import vm from "node:vm";

import ts from "typescript";

// Run the component and the installed ahooks implementation with controlled
// effects and network responses, without a browser or another test dependency.
const mountGitalk = ({ authenticated = false, ...initialProps } = {}) => {
  const slots = [];
  const effects = [];
  const layoutEffects = [];
  const timers = new Set();
  const calls = [];
  const createdIssues = [];
  const createdComments = [];
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
      if (route === "GET /user") {
        return Promise.resolve({ status: 200, data: { login: "admin" } });
      }
      return new Promise((resolve, reject) => {
        calls.push({ route, params, resolve, reject });
      });
    },
    graphql: (query, params) =>
      new Promise((resolve, reject) => {
        calls.push({ route: "graphql", params, resolve, reject });
      }),
  };
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
  context.exports = {};
  context.require = (name) => {
    if (name === "react") return { __esModule: true, ...react, default: react };
    if (name === "ahooks") return { useRequest, useMemoizedFn };
    if (name === "classnames") return { __esModule: true, default: () => "gt" };
    if (name === "./constants") {
      return {
        ACCESS_TOKEN_KEY: "GT_ACCESS_TOKEN",
        DEFAULT_LABELS: ["Gitalk"],
        DEFAULT_USER: {},
      };
    }
    if (name === "./i18n") {
      return { __esModule: true, default: () => ({ t: (key) => key }) };
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
const commentsRoute =
  "GET /repos/{owner}/{repo}/issues/{issue_number}/comments";
const submitRoute = "POST /repos/{owner}/{repo}/issues/{issue_number}/comments";
const issueResponse = (number) => ({
  status: 200,
  data: { number, comments: 3 },
});
const openArticle = async (options) => {
  const app = mountGitalk(options);
  await app.settle();
  app.calls.find((call) => call.route === issueRoute).resolve(issueResponse(1));
  await app.settle();
  return app;
};
const hotkey = () => ({ ctrlKey: true, keyCode: 13, preventDefault() {} });

for (const next of [
  { owner: "another-owner" },
  { repo: "another-repo" },
  { id: "another-article" },
  { labels: ["another-label"] },
]) {
  test(`changing ${Object.keys(next)[0]} cancels the old article's issue`, async () => {
    const app = mountGitalk();
    const oldRequest = app.calls.find((call) => call.route === issueRoute);
    app.switchArticle(next);
    const requests = app.calls.filter((call) => call.route === issueRoute);
    assert.equal(requests.length, 2);
    requests[1].resolve(issueResponse(1));
    await app.settle();
    oldRequest.resolve({ status: 200, data: { number: 1, comments: 71 } });
    await app.settle();
    assert.equal(app.component("comments-list").commentsCount, 3);
    app.unmount();
  });
}

test("an old issue response cannot replace the new article", async () => {
  const app = mountGitalk();
  const first = app.calls.find((call) => call.route === issueRoute);
  app.switchArticle({ number: 2 });
  const second = app.calls.find((call) => call.params?.issue_number === 2);
  second.resolve(issueResponse(2));
  await app.settle();
  first.resolve(issueResponse(1));
  await app.settle();
  assert.deepEqual(
    app.calls
      .filter((call) => call.route === commentsRoute)
      .map((call) => call.params.issue_number),
    [2],
  );
  app.unmount();
});

test("scope changes cancel old responses before passive effects run", async () => {
  const app = mountGitalk();
  const oldRequest = app.calls.find((call) => call.route === issueRoute);
  app.switchArticle({ number: 2 }, false);
  oldRequest.resolve(issueResponse(1));
  await app.settle(false);
  assert.equal(app.component("comments-list"), undefined);
  await app.settle();
  app.calls
    .find((call) => call.route === issueRoute && call.params.issue_number === 2)
    .resolve(issueResponse(2));
  await app.settle();
  assert.deepEqual(
    app.calls
      .filter((call) => call.route === commentsRoute)
      .map((call) => call.params.issue_number),
    [2],
  );
  app.unmount();
});

test("an old REST page cannot change the new article's comments or page", async () => {
  const app = await openArticle();
  const oldPage = app.calls.find((call) => call.route === commentsRoute);
  app.switchArticle({ number: 2 });
  app.calls
    .find((call) => call.route === issueRoute && call.params.issue_number === 2)
    .resolve(issueResponse(2));
  await app.settle();
  const newPage = app.calls.find(
    (call) => call.route === commentsRoute && call.params.issue_number === 2,
  );
  newPage.resolve({ status: 200, data: [{ id: 20 }] });
  await app.settle();
  oldPage.resolve({ status: 200, data: [{ id: 10 }] });
  await app.settle();
  assert.deepEqual(
    Array.from(
      app.component("comments-list").comments,
      (comment) => comment.id,
    ),
    [20],
  );
  app.component("comments-list").onGetComments();
  assert.equal(app.calls.at(-1).params.page, 2);
  app.unmount();
});

test("a draft edited during submission survives the response", async () => {
  const app = await openArticle({ authenticated: true });
  app.type("draft A");
  const pending = app.component("comment-textarea").onCreateComment();
  app.type("draft B");
  const submission = app.calls.find((call) => call.route === submitRoute);
  assert.equal(submission.params.body, "draft A");
  submission.resolve({ status: 201, data: { id: 30 } });
  await pending;
  await app.settle();
  assert.equal(app.component("comment-textarea").value, "draft B");
  assert.equal(app.createdComments.length, 1);
  app.unmount();
});

test("button and hotkey cannot submit twice before loading rerenders", async () => {
  const app = await openArticle({ authenticated: true });
  app.type("draft");
  const editor = app.component("comment-textarea");
  const pending = editor.onCreateComment();
  editor.onKeyDown(hotkey());
  editor.onKeyDown(hotkey());
  assert.equal(
    app.calls.filter((call) => call.route === submitRoute).length,
    1,
  );
  for (const call of app.calls.filter((call) => call.route === submitRoute)) {
    call.resolve({ status: 201, data: { id: 30 } });
  }
  await pending;
  await app.settle();
  assert.equal(app.component("comment-textarea").value, "");
  app.unmount();
});

const graphqlPage = (id, cursor) => ({
  repository: {
    issue: {
      comments: {
        nodes: [{ databaseId: id, author: { login: "author" } }],
        pageInfo: { startCursor: cursor },
      },
    },
  },
});

test("an old GraphQL page cannot overwrite the new article's cursor", async () => {
  const app = await openArticle({ authenticated: true });
  const oldPage = app.calls.find((call) => call.route === "graphql");
  app.switchArticle({ number: 2 });
  app.calls
    .find((call) => call.route === issueRoute && call.params.issue_number === 2)
    .resolve(issueResponse(2));
  await app.settle();
  app.calls
    .find((call) => call.route === "graphql" && call.params.id === 2)
    .resolve(graphqlPage(20, "new-cursor"));
  await app.settle();
  oldPage.resolve(graphqlPage(10, "old-cursor"));
  await app.settle();
  app.component("comments-list").onGetComments();
  assert.equal(app.calls.at(-1).params.cursor, "new-cursor");
  app.unmount();
});

test("an edited draft is preserved even if its text returns to the submitted text", async () => {
  const app = await openArticle({ authenticated: true });
  app.type("draft A");
  const pending = app.component("comment-textarea").onCreateComment();
  app.type("draft B");
  app.type("draft A");
  app.calls
    .find((call) => call.route === submitRoute)
    .resolve({ status: 201, data: { id: 30 } });
  await pending;
  await app.settle();
  assert.equal(app.component("comment-textarea").value, "draft A");
  app.unmount();
});

test("hotkey requires a logged-in user and nonblank content", async () => {
  for (const authenticated of [false, true]) {
    const app = await openArticle({ authenticated });
    app.type(authenticated ? "   \n" : "draft");
    app.component("comment-textarea").onKeyDown(hotkey());
    assert.equal(
      app.calls.filter((call) => call.route === submitRoute).length,
      0,
    );
    app.unmount();
  }
});

test("a failed submission preserves the draft and permits retry", async () => {
  const app = await openArticle({ authenticated: true });
  app.type("draft");
  const pending = app.component("comment-textarea").onCreateComment();
  app.calls
    .find((call) => call.route === submitRoute)
    .reject(new Error("offline"));
  await assert.doesNotReject(pending);
  await app.settle();
  assert.equal(app.component("comment-textarea").value, "draft");
  const retry = app.component("comment-textarea").onCreateComment();
  const submissions = app.calls.filter((call) => call.route === submitRoute);
  assert.equal(submissions.length, 2);
  submissions[1].resolve({ status: 201, data: { id: 30 } });
  await retry;
  await app.settle();
  assert.equal(app.component("comment-textarea").value, "");
  app.unmount();
});

test("a submission for the old article cannot modify the new article", async () => {
  const app = await openArticle({ authenticated: true });
  app.type("old draft");
  const pending = app.component("comment-textarea").onCreateComment();
  app.switchArticle({ number: 2 });
  app.calls
    .find((call) => call.route === issueRoute && call.params.issue_number === 2)
    .resolve(issueResponse(2));
  await app.settle();
  app.type("new draft");
  app.calls
    .find((call) => call.route === submitRoute)
    .resolve({ status: 201, data: { id: 30 } });
  await assert.doesNotReject(pending);
  await app.settle();
  assert.equal(app.component("comment-textarea").value, "new draft");
  assert.equal(app.createdComments.length, 0);
  assert.equal(app.component("comments-list").comments.length, 0);
  app.unmount();
});

test("an old issue creation cannot initialize the new article", async () => {
  const app = mountGitalk({
    authenticated: true,
    number: undefined,
    id: "first",
  });
  await app.settle();
  const listRoute = "GET /repos/{owner}/{repo}/issues";
  app.calls
    .find((call) => call.route === listRoute)
    .resolve({ status: 200, data: [] });
  await app.settle();
  const creation = app.calls.find(
    (call) => call.route === "POST /repos/{owner}/{repo}/issues",
  );
  assert.ok(creation);
  app.switchArticle({ id: "second" });
  app.calls
    .filter((call) => call.route === listRoute)
    .at(-1)
    .resolve({ status: 200, data: [issueResponse(2).data] });
  await app.settle();
  creation.resolve({ status: 201, data: issueResponse(1).data });
  await app.settle();
  assert.equal(app.createdIssues.length, 0);
  assert.ok(
    app.calls
      .filter((call) => call.route === "graphql")
      .every((call) => call.params.id === 2),
  );
  app.unmount();
});

test("a late old submission cannot release a new article's submission lock", async () => {
  const app = await openArticle({ authenticated: true });
  app.type("old draft");
  const oldPending = app.component("comment-textarea").onCreateComment();
  const oldSubmission = app.calls.find((call) => call.route === submitRoute);
  app.switchArticle({ number: 2 });
  app.calls
    .find((call) => call.route === issueRoute && call.params.issue_number === 2)
    .resolve(issueResponse(2));
  await app.settle();
  app.type("new draft");
  const editor = app.component("comment-textarea");
  const newPending = editor.onCreateComment();
  oldSubmission.resolve({ status: 201, data: { id: 30 } });
  await oldPending;
  editor.onKeyDown(hotkey());
  const submissions = app.calls.filter((call) => call.route === submitRoute);
  assert.equal(submissions.length, 2);
  submissions[1].resolve({ status: 201, data: { id: 40 } });
  await newPending;
  await app.settle();
  assert.deepEqual(
    Array.from(app.createdComments, (comment) => comment.id),
    [40],
  );
  assert.equal(app.component("comment-textarea").value, "");
  app.unmount();
});
