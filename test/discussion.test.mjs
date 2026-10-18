import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import test from "node:test";
import vm from "node:vm";

import ts from "typescript";

import { loadSource } from "./helpers/source.mjs";

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
        calls.push({ route: "graphql", query, params, resolve, reject });
      }),
  };
  const storage = new Map(authenticated ? [["GT_ACCESS_TOKEN", "token"]] : []);
  const context = vm.createContext({
    console,
    URL,
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
    if (name === "./utils/reactions") return loadSource("utils/reactions.ts");
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
    if (name === "./services/graphql/comment") {
      const graphqlSource = readFileSync(
        new URL("../lib/services/graphql/comment.ts", import.meta.url),
        "utf8",
      );
      const { outputText } = ts.transpileModule(graphqlSource, {
        compilerOptions: { module: ts.ModuleKind.CommonJS },
      });
      const exports = {};
      vm.runInNewContext(outputText, { exports });
      return exports;
    }
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

test("failed POST rows retry their captured body and preserve a newer draft", async () => {
  const app = await openArticle({ authenticated: true });
  app.type("Original comment");
  const first = app.component("comment-textarea").onCreateComment();
  await app.settle();
  assert.equal(
    app.component("comments-list").pendingComments[0].status,
    "sending",
  );
  app.calls
    .find((call) => call.route === submitRoute)
    .reject(new Error("POST failed"));
  await first;
  await app.settle();
  const pending = app.component("comments-list").pendingComments[0];
  assert.equal(pending.status, "failed");
  app.type("New draft");
  const retry = app.component("comments-list").onRetry(pending);
  const post = app.calls.filter((call) => call.route === submitRoute).at(-1);
  assert.equal(post.params.body, "Original comment");
  post.resolve({
    status: 201,
    data: { id: 12, node_id: "IC_new", body: post.params.body },
  });
  await retry;
  await app.settle();
  assert.equal(app.component("comments-list").pendingComments.length, 0);
  assert.equal(app.component("comment-textarea").value, "New draft");
  assert.equal(
    app.component("comments-list").comments.filter((c) => c.id === 12).length,
    1,
  );
  app.unmount();
});

test("a read failing after successful POST never makes the committed comment retryable", async () => {
  const app = await openArticle({ authenticated: true });
  app.type("Committed");
  const submission = app.component("comment-textarea").onCreateComment();
  app.calls
    .find((call) => call.route === submitRoute)
    .resolve({
      status: 201,
      data: { id: 13, node_id: "IC_new", body: "Committed" },
    });
  await submission;
  await app.settle();
  app.component("comments-list").onGetComments();
  app.calls
    .filter((call) => call.route === "graphql")
    .at(-1)
    .reject(new Error("Refresh failed"));
  await app.settle();
  assert.equal(app.component("comments-list").pendingComments.length, 0);
  assert.equal(app.component("comment-textarea").value, "");
  await app.component("comment-textarea").onCreateComment();
  assert.equal(
    app.calls.filter((call) => call.route === submitRoute).length,
    1,
  );
  assert.equal(
    app.component("comments-list").comments.filter((c) => c.id === 13).length,
    1,
  );
  app.unmount();
});
const issueResponse = (number) => ({
  status: 200,
  data: { number, comments: 3 },
});
const openArticle = async ({ issueComments = 3, ...options } = {}) => {
  const app = mountGitalk(options);
  await app.settle();
  app.calls
    .findLast((call) => call.route === issueRoute)
    .resolve({
      ...issueResponse(1),
      data: { ...issueResponse(1).data, comments: issueComments },
    });
  await app.settle();
  return app;
};
const hotkey = () => ({ ctrlKey: true, keyCode: 13, preventDefault() {} });

test("the rendered load-more control follows pagination metadata, independent of totals", () => {
  const source = readFileSync(
    new URL("../lib/components/comments-list.tsx", import.meta.url),
    "utf8",
  );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  });
  const react = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useContext: () => ({ polyglot: { t: (key) => key } }),
  };
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    require: (name) =>
      name === "react"
        ? { __esModule: true, default: react, ...react }
        : { __esModule: true, default: name },
  });
  for (const [commentsCount, hasMoreComments] of [
    [0, true],
    [50, false],
  ]) {
    const rendered = exports.default({
      comments: [],
      commentsCount,
      hasMoreComments,
      admin: [],
    });
    assert.equal(
      rendered.children.some(
        (child) => child?.props?.className === "gt-comments-controls",
      ),
      hasMoreComments,
    );
  }
});

const commentPage = ({
  author = null,
  count = 1,
  hasMore = false,
  reacted = false,
  hearts = 0,
} = {}) => ({
  repository: {
    issue: {
      comments: {
        totalCount: count,
        nodes: [
          {
            id: "IC_comment",
            databaseId: 9007199254740993n,
            author,
            reactionGroups: [
              {
                content: "HEART",
                reactors: { totalCount: hearts },
                viewerHasReacted: reacted,
              },
            ],
          },
        ],
        pageInfo: {
          startCursor: "start",
          endCursor: "end",
          hasPreviousPage: hasMore,
          hasNextPage: hasMore,
        },
      },
    },
  },
});

const editRoute = "PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}";

const openEditableArticle = async () => {
  const app = await openArticle({ authenticated: true });
  const page = commentPage({
    author: { login: "ADMIN", avatarUrl: "avatar", url: "" },
    hearts: 5,
  });
  page.repository.issue.comments.nodes[0].body = "Original comment";
  page.repository.issue.comments.nodes[0].bodyHTML = "<p>Original comment</p>";
  app.calls.find((call) => call.route === "graphql").resolve(page);
  await app.settle();
  return app;
};

test("editing updates only the saved comment body and preserves reactions, counts and the composer", async () => {
  const app = await openEditableArticle();
  app.type("Unsent composer draft");
  const list = app.component("comments-list");
  assert.equal(list.showAdminLabel, true);
  const editing = list.onEdit(list.comments[0], "Updated **comment**");
  await app.settle();
  assert.equal(app.component("comments-list").editLoading, true);
  const request = app.calls.find((call) => call.route === editRoute);
  assert.equal(request.params.owner, "owner");
  assert.equal(request.params.repo, "repo");
  assert.equal(request.params.comment_id, 9007199254740993n);
  assert.equal(request.params.body, "Updated **comment**");
  assert.match(request.params.headers.accept, /full/);
  request.resolve({
    data: {
      body: request.params.body,
      body_html: "<p>Updated <strong>comment</strong></p>",
    },
  });
  await editing;
  await app.settle();
  const updated = app.component("comments-list");
  assert.equal(updated.comments[0].body, "Updated **comment**");
  assert.equal(
    updated.comments[0].body_html,
    "<p>Updated <strong>comment</strong></p>",
  );
  assert.equal(updated.comments[0].reactions.HEART.totalCount, 5);
  assert.equal(updated.commentsCount, 1);
  assert.equal(updated.editLoading, false);
  assert.equal(
    app.component("comment-textarea").value,
    "Unsent composer draft",
  );
  assert.equal(app.createdComments.length, 0);
  app.switchArticle({ showAdminLabel: false });
  assert.equal(app.component("comments-list").showAdminLabel, false);
  app.unmount();
});

test("failed edits preserve the original body and can be retried", async () => {
  const app = await openEditableArticle();
  const comment = app.component("comments-list").comments[0];
  const editing = app.component("comments-list").onEdit(comment, "Updated");
  const failed = assert.rejects(editing, /Save failed/);
  app.calls
    .find((call) => call.route === editRoute)
    .reject(new Error("Save failed"));
  await failed;
  await app.settle();
  assert.equal(
    app.component("comments-list").comments[0].body,
    "Original comment",
  );
  assert.equal(app.component("comments-list").editLoading, false);
  const retry = app.component("comments-list").onEdit(comment, "Updated");
  app.calls
    .filter((call) => call.route === editRoute)
    .at(-1)
    .resolve({ data: { body: "Updated", body_html: "<p>Updated</p>" } });
  await retry;
  await app.settle();
  assert.equal(app.component("comments-list").comments[0].body, "Updated");
  app.unmount();
});

test("a newly submitted comment can be edited without reloading", async () => {
  const app = await openEditableArticle();
  app.type("New comment");
  const creating = app.component("comment-textarea").onCreateComment();
  app.calls
    .find((call) => call.route === submitRoute)
    .resolve({
      status: 201,
      data: {
        id: 42,
        node_id: "IC_new",
        body: "New comment",
        body_html: "<p>New comment</p>",
        user: { login: "admin" },
      },
    });
  await creating;
  await app.settle();
  const comment = app
    .component("comments-list")
    .comments.find((comment) => comment.id === 42);
  const editing = app
    .component("comments-list")
    .onEdit(comment, "Edited new comment");
  app.calls
    .find((call) => call.route === editRoute)
    .resolve({
      data: {
        body: "Edited new comment",
        body_html: "<p>Edited new comment</p>",
      },
    });
  await editing;
  await app.settle();
  assert.equal(
    app.component("comments-list").comments.find((comment) => comment.id === 42)
      .body,
    "Edited new comment",
  );
  assert.equal(app.component("comments-list").commentsCount, 2);
  assert.equal(app.createdComments.length, 1);
  app.unmount();
});

test("an edit for the old article cannot replace the new article's comments", async () => {
  const app = await openEditableArticle();
  const list = app.component("comments-list");
  const cancelled = assert.rejects(
    list.onEdit(list.comments[0], "Old article edit"),
    /cancelled|superseded/,
  );
  const editing = app.calls.find((call) => call.route === editRoute);
  app.switchArticle({ number: 2 }, false);
  editing.resolve({
    data: { body: "Old article edit", body_html: "<p>Old article edit</p>" },
  });
  await cancelled;
  await app.settle();
  app.calls
    .filter((call) => call.route === issueRoute)
    .at(-1)
    .resolve(issueResponse(2));
  await app.settle();
  const page = commentPage({ author: { login: "admin" } });
  page.repository.issue.comments.nodes[0].body = "New article comment";
  app.calls
    .filter((call) => call.route === "graphql")
    .at(-1)
    .resolve(page);
  await app.settle();
  assert.equal(
    app.component("comments-list").comments[0].body,
    "New article comment",
  );
  app.unmount();
});

test("edits reject another author's comment and blank bodies before making a request", async () => {
  const app = await openEditableArticle();
  const comment = app.component("comments-list").comments[0];
  await assert.rejects(
    app.component("comments-list").onEdit(comment, "  "),
    /empty/,
  );
  app.switchArticle({ number: 2 });
  await app.settle();
  app.calls
    .filter((call) => call.route === issueRoute)
    .at(-1)
    .resolve(issueResponse(2));
  await app.settle();
  app.calls
    .filter((call) => call.route === "graphql")
    .at(-1)
    .resolve(commentPage({ author: { login: "someone-else" } }));
  await app.settle();
  const other = app.component("comments-list").comments[0];
  await assert.rejects(
    app.component("comments-list").onEdit(other, "Updated"),
    /own comments/,
  );
  assert.equal(app.calls.filter((call) => call.route === editRoute).length, 0);
  app.unmount();
});

test("a deleted GraphQL author uses the configured user without losing the page", async () => {
  const defaultUser = { login: "deleted", avatar_url: "avatar", html_url: "" };
  const app = await openArticle({ authenticated: true, defaultUser });
  app.calls.find((call) => call.route === "graphql").resolve(commentPage());
  await app.settle();
  const list = app.component("comments-list");
  assert.equal(list.comments.length, 1);
  assert.equal(list.comments[0].id, 9007199254740993n);
  assert.deepEqual({ ...list.comments[0].user }, defaultUser);
  app.unmount();
});

for (const { content } of loadSource("utils/reactions.ts").REACTIONS) {
  test(`${content} can be added and removed without losing other reaction states`, async () => {
    const app = await openArticle({ authenticated: true });
    const page = commentPage();
    const groups = loadSource("utils/reactions.ts").REACTIONS.map((r) => ({
      content: r.content,
      viewerHasReacted: false,
      reactors: { totalCount: 150 },
    }));
    page.repository.issue.comments.nodes[0].reactionGroups = groups;
    app.calls.find((call) => call.route === "graphql").resolve(page);
    await app.settle();
    assert.equal(
      app.calls.filter((call) => call.route === "graphql").length,
      1,
    );
    for (const add of [true, false]) {
      const pending = app
        .component("comments-list")
        .onReaction(add, content, 9007199254740993n);
      // Repeated actions before the disabled state rerenders send no second mutation.
      void app
        .component("comments-list")
        .onReaction(add, content, 9007199254740993n);
      const mutations = app.calls.filter(
        (call) => call.route === "graphql" && call.query.includes("mutation"),
      );
      assert.equal(mutations.length, add ? 1 : 2);
      const mutation = mutations.at(-1);
      assert.equal(mutation.params.content, content);
      mutation.resolve({
        reaction: {
          subject: {
            reactionGroups: groups.map((group) =>
              group.content === content
                ? {
                    ...group,
                    viewerHasReacted: add,
                    reactors: { totalCount: add ? 151 : 150 },
                  }
                : group,
            ),
          },
        },
      });
      await pending;
      await app.settle();
      const states = app.component("comments-list").comments[0].reactions;
      assert.equal(states[content].viewerHasReacted, add);
      for (const group of groups)
        assert.equal(
          states[group.content].totalCount,
          group.content === content && add ? 151 : 150,
        );
    }
    app.unmount();
  });
}

test("a deleted REST author uses the configured user inside the user field", async () => {
  const defaultUser = { login: "deleted", avatar_url: "avatar", html_url: "" };
  const app = await openArticle({ defaultUser });
  app.calls
    .find((call) => call.route === commentsRoute)
    .resolve({
      status: 200,
      headers: {},
      data: [{ id: 1, user: null }],
    });
  await app.settle();
  assert.deepEqual(
    { ...app.component("comments-list").comments[0].user },
    defaultUser,
  );
  app.unmount();
});

for (const perPage of [0, -1, 1.5, NaN, Infinity, -Infinity]) {
  test(`invalid page size ${perPage} requests a valid default page`, async () => {
    const app = await openArticle({ authenticated: true, perPage });
    assert.equal(
      app.calls.find((call) => call.route === "graphql").params.pageSize,
      10,
    );
    app.unmount();
  });
}

for (const [perPage, expected] of [
  [1, 1],
  [100, 100],
  [101, 100],
]) {
  test(`page size ${perPage} requests ${expected} comments`, async () => {
    const app = await openArticle({ perPage });
    assert.equal(
      app.calls.find((call) => call.route === commentsRoute).params.per_page,
      expected,
    );
    app.unmount();
  });
}

test("changing page size restarts pagination with the new size", async () => {
  const app = await openArticle({ authenticated: true });
  app.calls
    .find((call) => call.route === "graphql")
    .resolve(commentPage({ hasMore: true }));
  await app.settle();
  app.switchArticle({ perPage: 20 });
  await app.settle();
  const next = app.calls.filter((call) => call.route === "graphql").at(-1);
  assert.equal(next.params.pageSize, 20);
  assert.equal(next.params.cursor, undefined);
  assert.equal(app.component("comments-list").comments.length, 0);
  app.unmount();
});

for (const pagerDirection of ["first", "last"]) {
  test(`GraphQL ${pagerDirection} pagination follows server metadata and current total`, async () => {
    const app = await openArticle({ authenticated: true, pagerDirection });
    app.calls
      .find((call) => call.route === "graphql")
      .resolve(commentPage({ count: 20, hasMore: true }));
    await app.settle();
    assert.equal(app.component("comments-list").hasMoreComments, true);
    assert.equal(app.component("comments-list").commentsCount, 20);
    app.component("comments-list").onGetComments();
    const next = app.calls.filter((call) => call.route === "graphql").at(-1);
    assert.equal(
      next.params.cursor,
      pagerDirection === "last" ? "start" : "end",
    );
    next.resolve(commentPage({ count: 1 }));
    await app.settle();
    assert.equal(app.component("comments-list").hasMoreComments, false);
    assert.equal(app.component("comments-list").commentsCount, 1);
    app.unmount();
  });
}

for (const issueComments of [0, 50]) {
  test(`REST pagination follows next links when the initial count is ${issueComments}`, async () => {
    const app = await openArticle({ issueComments, pagerDirection: "first" });
    app.calls
      .find((call) => call.route === commentsRoute)
      .resolve({
        status: 200,
        headers: {
          link: '<https://api.github.com/comments?page=2>; rel="next", <https://api.github.com/comments?page=2>; rel="last"',
        },
        data: [{ id: 1 }],
      });
    await app.settle();
    assert.equal(app.component("comments-list").hasMoreComments, true);
    app.component("comments-list").onGetComments();
    app.calls
      .filter((call) => call.route === commentsRoute)
      .at(-1)
      .resolve({ status: 200, headers: {}, data: [] });
    await app.settle();
    assert.equal(app.component("comments-list").hasMoreComments, false);
    app.unmount();
  });
}

const restPage = (ids, links = {}) => ({
  status: 200,
  headers: {
    link: Object.entries(links)
      .map(
        ([relation, page]) =>
          `<https://api.github.com/comments?page=${page}>; rel="${relation}"`,
      )
      .join(", "),
  },
  data: ids.map((id) => ({ id })),
});

test("anonymous newest-first pagination starts at the final page and walks backward", async () => {
  const app = await openArticle({ issueComments: 5, perPage: 2 });
  const last = app.calls.find((call) => call.route === commentsRoute);
  assert.equal(last.params.page, 3);
  last.resolve(restPage([5], { prev: 2, first: 1 }));
  await app.settle();
  assert.deepEqual(
    Array.from(
      app.component("comments-list").comments,
      (comment) => comment.id,
    ),
    [5],
  );
  assert.equal(app.component("comments-list").hasMoreComments, true);
  app.component("comments-list").onGetComments();
  const previous = app.calls.at(-1);
  assert.equal(previous.params.page, 2);
  previous.resolve(restPage([3, 4], { prev: 1, next: 3, last: 3 }));
  await app.settle();
  app.component("comments-list").onGetComments();
  assert.equal(app.calls.at(-1).params.page, 1);
  app.calls.at(-1).resolve(restPage([1, 2], { next: 2, last: 3 }));
  await app.settle();
  const list = app.component("comments-list");
  assert.deepEqual(
    Array.from(list.comments, (comment) => comment.id),
    [5, 4, 3, 2, 1],
  );
  assert.equal(list.hasMoreComments, false);
  assert.equal(list.commentsCount, 5);
  app.unmount();
});

test("anonymous newest-first pagination discovers newer pages from Link when the count is stale", async () => {
  const app = await openArticle({ issueComments: 0, perPage: 2 });
  app.calls
    .find((call) => call.route === commentsRoute)
    .resolve(restPage([1, 2], { next: 2, last: 3 }));
  await app.settle();
  const last = app.calls.at(-1);
  assert.equal(last.params.page, 3);
  assert.equal(app.component("comments-list").comments.length, 0);
  last.resolve(restPage([5], { prev: 2, first: 1 }));
  await app.settle();
  assert.deepEqual(
    Array.from(
      app.component("comments-list").comments,
      (comment) => comment.id,
    ),
    [5],
  );
  app.unmount();
});

test("anonymous pagination follows the server's previous page and deduplicates overlapping comments", async () => {
  const app = await openArticle({ issueComments: 8, perPage: 2 });
  app.calls
    .find((call) => call.route === commentsRoute)
    .resolve(restPage([7, 8], { prev: 2, first: 1 }));
  await app.settle();
  app.component("comments-list").onGetComments();
  assert.equal(app.calls.at(-1).params.page, 2);
  app.calls.at(-1).resolve(restPage([6, 7], { prev: 1, next: 4 }));
  await app.settle();
  assert.deepEqual(
    Array.from(
      app.component("comments-list").comments,
      (comment) => comment.id,
    ),
    [8, 7, 6],
  );
  app.unmount();
});

for (const [issueComments, links] of [
  [5, { prev: 2, last: 2 }],
  [5, {}],
  [200000, {}],
  [200000, { prev: 99999 }],
]) {
  test(`an empty deleted final REST page is skipped (${issueComments}, ${JSON.stringify(links)})`, async () => {
    const app = await openArticle({ issueComments, perPage: 2 });
    app.calls
      .find((call) => call.route === commentsRoute)
      .resolve(restPage([], links));
    await app.settle();
    if (!links.last) {
      assert.equal(app.calls.at(-1).params.page, 1);
      app.calls.at(-1).resolve(restPage([1, 2], { next: 2, last: 2 }));
      await app.settle();
    }
    assert.equal(app.calls.at(-1).params.page, 2);
    app.calls.at(-1).resolve(restPage([3, 4], { prev: 1, first: 1 }));
    await app.settle();
    assert.deepEqual(
      Array.from(
        app.component("comments-list").comments,
        (comment) => comment.id,
      ),
      [4, 3],
    );
    assert.equal(app.component("comments-list").hasMoreComments, true);
    assert.equal(
      app.calls.filter((call) => call.route === commentsRoute).length,
      links.last ? 2 : 3,
    );
    app.unmount();
  });
}

test("a direction change restarts anonymous pagination at the oldest page", async () => {
  const app = await openArticle({ issueComments: 5, perPage: 2 });
  app.calls
    .find((call) => call.route === commentsRoute)
    .resolve(restPage([5], { prev: 2 }));
  await app.settle();
  app.component("meta").onPagerDirectionChange("first");
  await app.settle();
  const first = app.calls.at(-1);
  assert.equal(first.params.page, 1);
  assert.equal(app.component("comments-list").comments.length, 0);
  first.resolve(restPage([1, 2], { next: 2, last: 3 }));
  await app.settle();
  assert.deepEqual(
    Array.from(
      app.component("comments-list").comments,
      (comment) => comment.id,
    ),
    [1, 2],
  );
  app.unmount();
});

test("anonymous newest-first pagination stops when an empty first page has no links", async () => {
  const app = await openArticle({ issueComments: 0 });
  app.calls.find((call) => call.route === commentsRoute).resolve(restPage([]));
  await app.settle();
  assert.equal(app.component("comments-list").comments.length, 0);
  assert.equal(app.component("comments-list").hasMoreComments, false);
  assert.equal(
    app.calls.filter((call) => call.route === commentsRoute).length,
    1,
  );
  app.unmount();
});

test("a throwing onCreateComment callback cannot preserve a successfully submitted draft for retry", async () => {
  const app = await openArticle({
    authenticated: true,
    onCreateComment: () => {
      throw new Error("Consumer callback failed");
    },
  });
  app.type("already posted");
  const pending = app.component("comment-textarea").onCreateComment();
  app.calls
    .find((call) => call.route === submitRoute)
    .resolve({ status: 201, data: { id: 30 } });
  await pending;
  await app.settle();
  assert.equal(app.component("comment-textarea").value, "");
  assert.deepEqual(
    Array.from(
      app.component("comments-list").comments,
      (comment) => comment.id,
    ),
    [30],
  );
  assert.equal(app.component("comments-list").commentsCount, 4);
  await app.component("comment-textarea").onCreateComment();
  assert.equal(
    app.calls.filter((call) => call.route === submitRoute).length,
    1,
  );
  app.unmount();
});

test("a throwing count callback cannot prevent a discussion from loading", async () => {
  let calls = 0;
  const app = await openArticle({
    updateCountCallback: () => {
      calls += 1;
      throw new Error("Consumer count failed");
    },
  });
  assert.ok(calls > 0);
  assert.ok(app.component("comments-list"));
  app.unmount();
});

for (const [like, hearts] of [
  [true, 1],
  [false, 150],
]) {
  test(`${like ? "an already existing heart stays idempotent" : "a heart beyond the first 100 can be removed"}`, async () => {
    const app = await openArticle({ authenticated: true });
    app.calls
      .find((call) => call.route === "graphql")
      .resolve(commentPage({ reacted: !like, hearts }));
    await app.settle();
    app.component("comments-list").onReaction(like, "HEART", 9007199254740993n);
    const mutation = app.calls
      .filter((call) => call.route === "graphql")
      .at(-1);
    assert.equal(mutation.params.subjectId, "IC_comment");
    assert.match(
      mutation.query,
      new RegExp(like ? "addReaction" : "removeReaction"),
    );
    mutation.resolve({
      reaction: {
        subject: {
          reactionGroups: [
            {
              content: "HEART",
              reactors: { totalCount: hearts },
              viewerHasReacted: like,
            },
          ],
        },
      },
    });
    await app.settle();
    const comment = app.component("comments-list").comments[0];
    assert.equal(comment.reactions.HEART.totalCount, hearts);
    assert.equal(comment.reactions.HEART.viewerHasReacted, like);
    assert.equal(app.component("comments-list").reactionLoading, false);
    app.unmount();
  });
}

for (const pagerDirection of ["first", "last"]) {
  test(`a later ${pagerDirection} page preserves a reaction completed while loading`, async () => {
    const app = await openArticle({ authenticated: true, pagerDirection });
    app.calls
      .find((call) => call.route === "graphql")
      .resolve(commentPage({ hasMore: true }));
    await app.settle();
    app.component("comments-list").onReaction(true, "HEART", 9007199254740993n);
    const mutation = app.calls
      .filter((call) => call.route === "graphql")
      .at(-1);
    app.component("comments-list").onGetComments();
    const pendingPage = app.calls
      .filter((call) => call.route === "graphql")
      .at(-1);
    mutation.resolve({
      reaction: {
        subject: {
          reactionGroups: [
            {
              content: "HEART",
              reactors: { totalCount: 1 },
              viewerHasReacted: true,
            },
          ],
        },
      },
    });
    await app.settle();
    assert.equal(
      app.component("comments-list").comments[0].reactions.HEART.totalCount,
      1,
    );
    const nextPage = commentPage({ count: 2 });
    nextPage.repository.issue.comments.nodes[0].id = "IC_second";
    nextPage.repository.issue.comments.nodes[0].databaseId = 9007199254740994n;
    pendingPage.resolve(nextPage);
    await app.settle();
    const list = app.component("comments-list");
    assert.deepEqual(
      Array.from(list.comments, (comment) => comment.id),
      [9007199254740993n, 9007199254740994n],
    );
    assert.equal(list.comments[0].reactions.HEART.totalCount, 1);
    assert.equal(list.comments[0].reactions.HEART.viewerHasReacted, true);
    app.unmount();
  });
}

test("a page started before submission cannot lower the new comment count", async () => {
  const app = await openArticle({ authenticated: true, perPage: 1 });
  app.calls
    .find((call) => call.route === "graphql")
    .resolve(commentPage({ count: 2, hasMore: true }));
  await app.settle();
  app.component("comments-list").onGetComments();
  const pendingPage = app.calls
    .filter((call) => call.route === "graphql")
    .at(-1);
  app.type("new comment");
  const submission = app.component("comment-textarea").onCreateComment();
  app.calls
    .find((call) => call.route === submitRoute)
    .resolve({ status: 201, data: { id: 30, node_id: "IC_local" } });
  await submission;
  await app.settle();
  assert.equal(app.component("comments-list").commentsCount, 3);
  const nextPage = commentPage({ count: 2 });
  nextPage.repository.issue.comments.nodes[0].id = "IC_second";
  nextPage.repository.issue.comments.nodes[0].databaseId = 9007199254740994n;
  pendingPage.resolve(nextPage);
  await app.settle();
  assert.equal(app.component("comments-list").comments.length, 3);
  assert.equal(app.component("comments-list").commentsCount, 3);
  app.unmount();
});

test("a fresh total after a local submission can reflect server deletions", async () => {
  const app = await openArticle({ authenticated: true, perPage: 1 });
  app.calls
    .find((call) => call.route === "graphql")
    .resolve(commentPage({ count: 20, hasMore: true }));
  await app.settle();
  app.type("new comment");
  const submission = app.component("comment-textarea").onCreateComment();
  app.calls
    .find((call) => call.route === submitRoute)
    .resolve({ status: 201, data: { id: 30, node_id: "IC_local" } });
  await submission;
  await app.settle();
  assert.equal(app.component("comments-list").commentsCount, 21);
  app.component("comments-list").onGetComments();
  const nextPage = commentPage({ count: 2 });
  nextPage.repository.issue.comments.nodes = [];
  app.calls
    .filter((call) => call.route === "graphql")
    .at(-1)
    .resolve(nextPage);
  await app.settle();
  assert.equal(app.component("comments-list").commentsCount, 2);
  app.unmount();
});

test("failed pages preserve the loaded comments and can be retried", async () => {
  const app = await openArticle({ authenticated: true });
  app.calls
    .find((call) => call.route === "graphql")
    .resolve(commentPage({ hasMore: true }));
  await app.settle();
  app.component("comments-list").onGetComments();
  app.calls
    .filter((call) => call.route === "graphql")
    .at(-1)
    .reject(new Error("offline"));
  await app.settle();
  assert.equal(app.component("comments-list").comments.length, 1);
  assert.equal(app.component("comments-list").getCommentsLoading, false);
  assert.equal(app.component("comments-list").hasMoreComments, true);
  app.component("comments-list").onGetComments();
  app.calls
    .filter((call) => call.route === "graphql")
    .at(-1)
    .resolve(commentPage());
  await app.settle();
  assert.equal(app.component("comments-list").hasMoreComments, false);
  app.unmount();
});

test("failed reactions preserve the count and release loading for a retry", async () => {
  const app = await openArticle({ authenticated: true });
  app.calls
    .find((call) => call.route === "graphql")
    .resolve(commentPage({ hearts: 150, reacted: true }));
  await app.settle();
  app.component("comments-list").onReaction(false, "HEART", 9007199254740993n);
  app.calls
    .filter((call) => call.route === "graphql")
    .at(-1)
    .reject(new Error("offline"));
  await app.settle();
  assert.equal(
    app.component("comments-list").comments[0].reactions.HEART.totalCount,
    150,
  );
  assert.equal(app.component("comments-list").reactionLoading, false);
  app.component("comments-list").onReaction(false, "HEART", 9007199254740993n);
  app.calls
    .filter((call) => call.route === "graphql")
    .at(-1)
    .resolve({
      reaction: {
        subject: {
          reactionGroups: [
            {
              content: "HEART",
              reactors: { totalCount: 149 },
              viewerHasReacted: false,
            },
          ],
        },
      },
    });
  await app.settle();
  assert.equal(
    app.component("comments-list").comments[0].reactions.HEART.totalCount,
    149,
  );
  app.unmount();
});

test("switching articles cancels an old pending reaction", async () => {
  const app = await openArticle({ authenticated: true });
  app.calls.find((call) => call.route === "graphql").resolve(commentPage());
  await app.settle();
  app.component("comments-list").onReaction(true, "HEART", 9007199254740993n);
  const oldReaction = app.calls
    .filter((call) => call.route === "graphql")
    .at(-1);
  app.switchArticle({ number: 2 });
  app.calls
    .findLast(
      (call) => call.route === issueRoute && call.params.issue_number === 2,
    )
    .resolve(issueResponse(2));
  await app.settle();
  app.calls
    .filter((call) => call.route === "graphql")
    .at(-1)
    .resolve(commentPage({ hearts: 7 }));
  await app.settle();
  oldReaction.resolve({
    reaction: {
      subject: {
        reactionGroups: [
          {
            content: "HEART",
            reactors: { totalCount: 1 },
            viewerHasReacted: true,
          },
        ],
      },
    },
  });
  await app.settle();
  assert.equal(
    app.component("comments-list").comments[0].reactions.HEART.totalCount,
    7,
  );
  assert.equal(app.component("comments-list").reactionLoading, false);
  app.unmount();
});

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
    .findLast(
      (call) => call.route === issueRoute && call.params.issue_number === 2,
    )
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
  const app = await openArticle({ pagerDirection: "first" });
  const oldPage = app.calls.find((call) => call.route === commentsRoute);
  app.switchArticle({ number: 2 });
  app.calls
    .findLast(
      (call) => call.route === issueRoute && call.params.issue_number === 2,
    )
    .resolve(issueResponse(2));
  await app.settle();
  const newPage = app.calls.find(
    (call) => call.route === commentsRoute && call.params.issue_number === 2,
  );
  newPage.resolve(restPage([20], { next: 2 }));
  await app.settle();
  oldPage.resolve(restPage([10], { next: 99 }));
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
        nodes: [
          { databaseId: id, author: { login: "author" }, reactionGroups: [] },
        ],
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
    .findLast(
      (call) => call.route === issueRoute && call.params.issue_number === 2,
    )
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
    .findLast(
      (call) => call.route === issueRoute && call.params.issue_number === 2,
    )
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
    .findLast((call) => call.route === listRoute)
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
    .findLast(
      (call) => call.route === issueRoute && call.params.issue_number === 2,
    )
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
