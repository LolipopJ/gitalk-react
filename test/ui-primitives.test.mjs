import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";

import React from "react";
import ReactDOMServer from "react-dom/server.js";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { renderToStaticMarkup } = ReactDOMServer;
const context = {
  polyglot: { t: (key) => key },
  relativeTimeFormat: new Intl.RelativeTimeFormat("en"),
};

function load(path, react = React, globals = {}) {
  const filename = new URL(`../lib/${path}`, import.meta.url);
  const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
  });
  const module = { exports: {} };
  vm.runInNewContext(outputText, {
    module,
    exports: module.exports,
    require: (name) => {
      if (name === "react") return react;
      if (name === "ahooks") return { useRequest: () => ({}) };
      if (name === "../contexts/I18nContext") return {};
      if (name === "../constants")
        return {
          DEFAULT_AVATAR: "default.png",
          HOMEPAGE: "https://example.com",
        };
      if (name.endsWith("?raw")) return "<svg />";
      if (name.startsWith(".")) {
        const nested = [".tsx", ".ts"]
          .map((ext) => new URL(`${name}${ext}`, filename))
          .find(existsSync);
        assert.ok(nested, `Cannot resolve ${name} from ${filename}`);
        return load(nested.pathname.split("/lib/")[1], react, globals);
      }
      return require(name);
    },
    Intl,
    URL,
    URLSearchParams,
    ...globals,
  });
  return module.exports;
}

// A hook runner keeps each component instance's state and effect cleanup without
// introducing a DOM dependency; React itself still creates the rendered elements.
function mount(path, props, globals = {}) {
  let cursor;
  let pendingEffects;
  const hooks = [];
  const react = {
    ...React,
    useContext: () => context,
    useState(initial) {
      const index = cursor++;
      if (!hooks[index])
        hooks[index] = {
          value: typeof initial === "function" ? initial() : initial,
        };
      return [
        hooks[index].value,
        (next) => {
          hooks[index].value =
            typeof next === "function" ? next(hooks[index].value) : next;
        },
      ];
    },
    useRef(initial) {
      const index = cursor++;
      return (hooks[index] ??= { current: initial });
    },
    useMemo: (fn) => fn(),
    useEffect(fn, deps) {
      const index = cursor++;
      const previous = hooks[index];
      if (
        !previous ||
        !deps ||
        deps.some((dep, i) => !Object.is(dep, previous.deps[i]))
      ) {
        pendingEffects.push(() => {
          previous?.cleanup?.();
          hooks[index] = { deps, cleanup: fn() };
        });
      }
    },
  };
  react.useLayoutEffect = react.useEffect;
  const Component = load(path, react, globals).default;
  return {
    render(next = props, attachRefs) {
      cursor = 0;
      pendingEffects = [];
      const result =
        typeof Component === "function"
          ? Component(next)
          : Component.render(next, null);
      attachRefs?.(result);
      for (const run of pendingEffects) run();
      return result;
    },
    hooks,
    unmount() {
      for (const hook of hooks) hook?.cleanup?.();
    },
  };
}

function find(element, className) {
  if (!React.isValidElement(element)) return;
  if (element.props.className?.split(" ").includes(className)) return element;
  for (const child of React.Children.toArray(element.props.children)) {
    const match = find(child, className);
    if (match) return match;
  }
}

test("shared buttons do not submit host forms unless explicitly requested", () => {
  const Button = load("components/button.tsx").default;
  const html = renderToStaticMarkup(
    React.createElement(
      "form",
      null,
      React.createElement(Button, { text: "Preview" }),
      React.createElement(Button, { text: "Submit", type: "submit" }),
    ),
  );
  assert.match(html, /<button[^>]*type="button"[^>]*><span[^>]*>Preview/);
  assert.match(html, /<button[^>]*type="submit"[^>]*><span[^>]*>Submit/);
});

test("menu actions use native keyboard-operable buttons", () => {
  const Action = load("components/action.tsx").default;
  const element = Action({ text: "Log out" });
  assert.equal(element.type, "button");
  assert.equal(element.props.type, "button");
});

test("avatars follow new sources and recover after a failed source", () => {
  const avatar = mount("components/avatar.tsx", { src: "a.png" });
  const image = (element) => element.props.children;
  assert.equal(image(avatar.render()).props.src, "a.png");
  assert.equal(image(avatar.render({ src: "b.png" })).props.src, "b.png");
  image(avatar.render({ src: "b.png" })).props.onError();
  assert.equal(image(avatar.render({ src: "b.png" })).props.src, "default.png");
  assert.equal(image(avatar.render({ src: "c.png" })).props.src, "c.png");
  assert.equal(
    image(avatar.render({ src: "c.png", defaultSrc: "new-default.png" })).props
      .src,
    "c.png",
  );
});

test("comment actions and expansion use named buttons and reflect like state", () => {
  const comment = {
    body_html: "<p>Comment</p>",
    created_at: "2026-10-15T00:00:00Z",
    html_url: "https://github.com/owner/repo/issues/1#issuecomment-1",
    user: { login: "user" },
    reactionsHeart: { viewerHasReacted: true, totalCount: 1 },
  };
  let liked;
  let replied;
  const props = {
    comment,
    collapsedHeight: 100,
    onLike: (...args) => {
      liked = args;
    },
    onReply: (value) => {
      replied = value;
    },
  };
  const instance = mount("components/comment.tsx", props);
  instance.render(props, (view) => {
    view.ref.current = { clientHeight: 200, querySelector() {} };
  });
  const view = instance.render();
  for (const name of ["like", "reply", "collapse"]) {
    const button = find(view, `gt-comment-${name}`);
    assert.equal(button.type, "button");
    assert.equal(button.props.type, "button");
    assert.ok(button.props["aria-label"]);
  }
  const like = find(view, "gt-comment-like");
  assert.equal(like.props["aria-pressed"], true);
  like.props.onClick();
  assert.deepEqual(liked, [false, comment]);
  find(view, "gt-comment-reply").props.onClick();
  assert.equal(replied, comment);
  find(view, "gt-comment-collapse").props.onClick();
  assert.equal(find(instance.render(), "gt-comment-collapse"), undefined);
  assert.equal(
    find(instance.render({ ...props, likeLoading: true }), "gt-comment-like")
      .props.disabled,
    true,
  );
});

test("the editor has a persistent accessible name and a named login button", () => {
  const editor = mount("components/comment-textarea.tsx", { value: "Draft" });
  const view = editor.render();
  assert.equal(find(view, "gt-header-textarea").props["aria-label"], "comment");
  const login = find(view, "gt-avatar-github");
  assert.equal(login.type, "button");
  assert.equal(login.props.type, "button");
  assert.equal(login.props["aria-label"], "login-with-github");
  assert.equal(
    find(
      editor.render({ value: "Draft", "aria-label": "Custom label" }),
      "gt-header-textarea",
    ).props["aria-label"],
    "Custom label",
  );
});

test("popup listeners survive rerenders and are removed on close and unmount", () => {
  const listeners = new Map();
  const document = {
    addEventListener(type, fn) {
      const set = listeners.get(type) ?? new Set();
      set.add(fn);
      listeners.set(type, set);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
  };
  const props = {
    commentsCount: 0,
    onLogin() {},
    onLogout() {},
    onPagerDirectionChange() {},
  };
  const menu = mount("components/meta.tsx", props, { document });
  let view = menu.render();
  const svg = { className: { baseVal: "icon" } };
  let trigger = find(view, "gt-user-inner");
  trigger.ref.current = { contains: (target) => target === svg };
  assert.equal(trigger.type, "button");
  assert.equal(trigger.props["aria-expanded"], false);
  trigger.props.onClick({ preventDefault() {}, stopPropagation() {} });
  view = menu.render();
  const popupContent = {};
  find(view, "gt-popup").ref.current = {
    contains: (target) => target === popupContent,
  };
  menu.render({ ...props, commentsCount: 1 });
  assert.equal(find(view, "gt-user-inner").props["aria-expanded"], true);
  assert.equal(listeners.get("click")?.size, 1);
  for (const fn of listeners.get("click")) fn({ target: svg });
  assert.equal(
    find(menu.render(), "gt-user-inner").props["aria-expanded"],
    true,
  );
  for (const fn of listeners.get("click")) fn({ target: popupContent });
  assert.equal(
    find(menu.render(), "gt-user-inner").props["aria-expanded"],
    true,
  );
  // The count/Issue link is inside the same Meta, outside both disclosure parts.
  for (const fn of [...listeners.get("click")]) fn({ target: {} });
  assert.equal(
    find(menu.render(), "gt-user-inner").props["aria-expanded"],
    false,
  );
  assert.equal(listeners.get("click")?.size, 0);
  find(menu.render(), "gt-user-inner").props.onClick({
    preventDefault() {},
    stopPropagation() {},
  });
  menu.render();
  menu.unmount();
  assert.equal(listeners.get("click")?.size, 0);
});

test("Escape closes the popup and returns focus to its trigger", () => {
  const props = {
    commentsCount: 0,
    onLogin() {},
    onLogout() {},
    onPagerDirectionChange() {},
  };
  const menu = mount("components/meta.tsx", props, {
    document: { addEventListener() {}, removeEventListener() {} },
  });
  let view = menu.render();
  const trigger = find(view, "gt-user-inner");
  let focused = false;
  if (trigger.ref)
    trigger.ref.current = {
      focus() {
        focused = true;
      },
    };
  trigger.props.onClick({ preventDefault() {}, stopPropagation() {} });
  view = menu.render();
  assert.equal(typeof view.props.onKeyDown, "function");
  view.props.onKeyDown({ key: "Escape", preventDefault() {} });
  assert.equal(
    find(menu.render(), "gt-user-inner").props["aria-expanded"],
    false,
  );
  assert.equal(focused, true);
});

test("authorization URLs encode client values and preserve the full redirect URL", () => {
  const redirect =
    "https://example.com/?q=a+b&token=a=b&bad=%ZZ&repeat=1&repeat=2";
  const { getAuthorizeUrl } = load("services/user.ts", React, {
    crypto: { getRandomValues: (bytes) => bytes.fill(7) },
    sessionStorage: { setItem() {} },
    window: { location: { href: redirect } },
  });
  const url = new URL(getAuthorizeUrl("client+with space&="));
  assert.equal(url.searchParams.get("client_id"), "client+with space&=");
  assert.equal(url.searchParams.get("redirect_uri"), redirect);
  assert.equal(
    new URL(url.searchParams.get("redirect_uri")).searchParams.get("q"),
    "a b",
  );
  assert.equal(
    new URL(url.searchParams.get("redirect_uri")).searchParams.get("token"),
    "a=b",
  );
  assert.deepEqual(
    new URL(url.searchParams.get("redirect_uri")).searchParams.getAll("repeat"),
    ["1", "2"],
  );
  assert.equal(
    new URL(url.searchParams.get("redirect_uri")).searchParams.get("bad"),
    "%ZZ",
  );
});
