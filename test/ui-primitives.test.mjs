import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";

import React from "react";
import ReactDOMServer from "react-dom/server.js";
import ts from "typescript";

import { loadSource } from "./helpers/source.mjs";

const require = createRequire(import.meta.url);
const cancelRequest = () => {};
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
      if (name === "ahooks")
        return (
          globals.ahooks ?? { useRequest: () => ({ cancel: cancelRequest }) }
        );
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
    document: { addEventListener() {}, removeEventListener() {} },
    ...globals,
  });
  return module.exports;
}

// A hook runner keeps each component instance's state and effect cleanup without
// introducing a DOM dependency; React itself still creates the rendered elements.
function mount(path, props, globals = {}) {
  let cursor;
  let pendingEffects;
  let hooks = [];
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
    render(next = props, attachRefs, instanceHooks = hooks) {
      hooks = instanceHooks;
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
    reactions: {
      ...loadSource("utils/reactions.ts").reactionsFromRest(),
      HEART: { viewerHasReacted: true, totalCount: 1 },
    },
  };
  let liked;
  let replied;
  const props = {
    comment,
    canReact: true,
    collapsedHeight: 100,
    onReaction: (...args) => {
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
  find(view, "gt-comment-menu-trigger").props.onClick();
  const menuView = instance.render();
  for (const name of ["reply", "collapse"]) {
    const button = find(menuView, `gt-comment-${name}`);
    assert.equal(button.type, "button");
    assert.equal(button.props.type, "button");
    assert.ok(button.props["aria-label"]);
  }
  const picker = (rendered) =>
    React.Children.toArray(
      find(rendered, "gt-comment-content").props.children,
    ).find((child) => child.type?.name === "Reactions");
  assert.equal(picker(view).props.reactions.HEART.viewerHasReacted, true);
  picker(view).props.onReaction(false, "HEART");
  assert.deepEqual(liked, [false, "HEART", comment]);
  find(menuView, "gt-comment-reply").props.onClick();
  assert.equal(replied, comment);
  find(view, "gt-comment-collapse").props.onClick();
  assert.equal(find(instance.render(), "gt-comment-collapse"), undefined);
  assert.equal(
    picker(instance.render({ ...props, reactionLoading: true })).props.loading,
    true,
  );
});

test("the editor has a persistent accessible name and a named login button", () => {
  const editor = mount("components/comment-textarea.tsx", { value: "Draft" });
  const view = editor.render();
  assert.equal(find(view, "gt-header-textarea").props["aria-label"], "comment");
  assert.ok(find(view, "gt-header-controls-tip"));
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

const editableComment = {
  id: 1,
  node_id: "IC_1",
  body: "Original **comment**",
  body_html: "<p>Original <strong>comment</strong></p>",
  created_at: "2026-10-15T00:00:00Z",
  html_url: "https://github.com/owner/repo/issues/1#issuecomment-1",
  user: { login: "author" },
  reactions: loadSource("utils/reactions.ts").reactionsFromRest(),
};

test("comment menu hides actions until opened and only offers Edit to the author", () => {
  const props = { comment: editableComment, isAuthor: true, onReply() {} };
  const row = mount("components/comment.tsx", props);
  let view = row.render();
  assert.equal(find(view, "gt-comment-edit"), undefined);
  assert.equal(find(view, "gt-comment-reply"), undefined);
  const trigger = find(view, "gt-comment-menu-trigger");
  assert.equal(trigger.props["aria-expanded"], false);
  trigger.props.onClick();
  view = row.render();
  assert.equal(find(view, "gt-comment-menu").props.role, "menu");
  assert.equal(find(view, "gt-comment-edit").props.role, "menuitem");
  assert.equal(find(view, "gt-comment-reply").props.role, "menuitem");
  view = row.render({ ...props, isAuthor: false });
  assert.equal(find(view, "gt-comment-edit"), undefined);
  row.unmount();
});

test("administrator labels are shown by default and can be hidden independently of highlighting", () => {
  const props = { comment: editableComment, isAdmin: true };
  const row = mount("components/comment.tsx", props);
  assert.equal(
    find(row.render(), "gt-comment-admin-label").props.children,
    "admin",
  );
  assert.equal(
    find(
      row.render({ ...props, showAdminLabel: false }),
      "gt-comment-admin-label",
    ),
    undefined,
  );
  assert.equal(
    find(row.render({ ...props, isAdmin: false }), "gt-comment-admin-label"),
    undefined,
  );
  row.unmount();
});

test("inline editing saves the draft, cancels locally and retains failed edits", async () => {
  const edits = [];
  const props = {
    comment: editableComment,
    isAuthor: true,
    onEdit: async (...args) => edits.push(args),
  };
  const row = mount("components/comment.tsx", props);
  const editor = (view) =>
    React.Children.toArray(
      find(view, "gt-comment-content").props.children,
    ).find((child) => child.type?.displayName === "CommentTextarea");
  const reactions = (view) =>
    React.Children.toArray(
      find(view, "gt-comment-content").props.children,
    ).find((child) => child.type?.name === "Reactions");
  const open = (next = props) => {
    find(row.render(next), "gt-comment-menu-trigger").props.onClick();
    find(row.render(next), "gt-comment-edit").props.onClick();
    return editor(row.render(next));
  };
  assert.ok(reactions(row.render()));
  let input = open();
  assert.equal(reactions(row.render()), undefined);
  assert.equal(input.props.value, editableComment.body);
  input.props.onValueChange("Updated comment");
  input = editor(row.render());
  assert.equal(input.props.value, "Updated comment");
  await input.props.onCreateComment("Updated comment");
  assert.deepEqual(edits, [[editableComment, "Updated comment"]]);
  assert.equal(editor(row.render()), undefined);
  assert.ok(reactions(row.render()));
  input = open();
  input.props.onValueChange("Discard this");
  editor(row.render()).props.onCancel();
  assert.equal(editor(row.render()), undefined);
  assert.ok(reactions(row.render()));
  const failed = {
    ...props,
    onEdit: async () => {
      throw new Error("Save failed");
    },
  };
  input = open(failed);
  input.props.onValueChange("Keep this draft");
  await editor(row.render(failed)).props.onCreateComment("Keep this draft");
  assert.equal(editor(row.render(failed)).props.value, "Keep this draft");
  assert.match(
    find(row.render(failed), "gt-comment-edit-error").props.children,
    /Save failed/,
  );
  assert.equal(editor(row.render({ ...failed, isAuthor: false })), undefined);
  row.unmount();
});

test("edit controls reuse preview and expose Save and Cancel without a second avatar", () => {
  const editor = mount("components/comment-textarea.tsx", {
    value: "Draft",
    user: editableComment.user,
    onCancel() {},
  });
  const view = editor.render();
  assert.equal(find(view, "gt-btn-public").props.text, "save");
  assert.equal(find(view, "gt-btn-cancel").props.text, "cancel");
  assert.ok(find(view, "gt-btn-preview"));
  assert.equal(find(view, "gt-header-controls-tip"), undefined);
  assert.equal(find(view, "gt-header-avatar"), undefined);
  assert.equal(find(view, "gt-header-textarea").props.autoFocus, true);
  editor.unmount();
});

test("comment menus manage keyboard focus, outside clicks and listener cleanup", () => {
  const listeners = new Set();
  const document = {
    addEventListener: (_type, callback) => listeners.add(callback),
    removeEventListener: (_type, callback) => listeners.delete(callback),
  };
  let triggerFocus = 0;
  const focused = [];
  const buttons = [0, 1].map((index) => ({ focus: () => focused.push(index) }));
  const inside = {};
  const props = { comment: editableComment, isAuthor: true, onReply() {} };
  const row = mount("components/comment.tsx", props, { document });
  const attach = (view) => {
    find(view, "gt-comment-menu-trigger").ref.current = {
      focus: () => triggerFocus++,
    };
    find(view, "gt-comment-menu-root").ref.current = {
      contains: (target) => target === inside,
    };
    const menu = find(view, "gt-comment-menu");
    if (menu) menu.ref.current = { querySelectorAll: () => buttons };
  };
  const render = () => row.render(props, attach);
  const key = (key, target = buttons[0]) => ({
    key,
    target,
    preventDefault() {},
    stopPropagation() {},
  });
  find(render(), "gt-comment-menu-trigger").props.onKeyDown(key("ArrowUp"));
  let view = render();
  assert.equal(focused.at(-1), 1);
  assert.equal(listeners.size, 1);
  find(view, "gt-comment-menu-root").props.onKeyDown(key("Home"));
  assert.equal(focused.at(-1), 0);
  find(view, "gt-comment-menu-root").props.onKeyDown(key("ArrowDown"));
  assert.equal(focused.at(-1), 1);
  for (const listener of listeners) listener({ target: inside });
  assert.ok(find(render(), "gt-comment-menu"));
  find(view, "gt-comment-menu-root").props.onKeyDown(key("Escape"));
  assert.equal(find(render(), "gt-comment-menu"), undefined);
  assert.equal(triggerFocus, 1);
  assert.equal(listeners.size, 0);
  find(render(), "gt-comment-menu-trigger").props.onClick();
  render();
  for (const listener of listeners) listener({ target: {} });
  assert.equal(find(render(), "gt-comment-menu"), undefined);
  find(render(), "gt-comment-menu-trigger").props.onClick();
  render();
  row.unmount();
  assert.equal(listeners.size, 0);
});

test("inline editors preview their current Markdown and return to the same draft", async () => {
  const requests = [];
  let html = "";
  let pending;
  const props = {
    value: "Original **draft**",
    user: editableComment.user,
    onCancel() {},
    onPreviewError() {},
    octokit: {
      request: async (route, params) => {
        requests.push({ route, params });
        return { data: `<p>${params.text}</p>` };
      },
    },
  };
  const editor = mount("components/comment-textarea.tsx", props, {
    ahooks: {
      useRequest: (service, options) => ({
        data: html,
        cancel: cancelRequest,
        run: (...params) => {
          pending = service(...params).then((result) => {
            html = result;
            options.onSuccess(result, params);
          });
        },
      }),
    },
  });
  find(editor.render(), "gt-btn-preview").props.onClick();
  await pending;
  let view = editor.render();
  assert.equal(requests[0].route, "POST /markdown");
  assert.equal(find(view, "gt-header-controls-tip"), undefined);
  assert.equal(requests[0].params.text, props.value);
  assert.equal(
    find(view, "gt-header-preview").props.dangerouslySetInnerHTML.__html,
    `<p>${props.value}</p>`,
  );
  assert.equal(find(view, "gt-header-textarea").props.style.display, "none");
  find(view, "gt-btn-preview").props.onClick();
  assert.equal(
    find(editor.render(), "gt-header-textarea").props.value,
    props.value,
  );
  const changed = { ...props, value: "Changed draft" };
  find(editor.render(changed), "gt-btn-preview").props.onClick();
  await pending;
  view = editor.render(changed);
  assert.equal(requests[1].params.text, changed.value);
  assert.equal(
    find(view, "gt-header-preview").props.dangerouslySetInnerHTML.__html,
    "<p>Changed draft</p>",
  );
  editor.unmount();
});

test("comment inputs resize on mount, growth, shrink and return from preview", () => {
  for (const editing of [false, true]) {
    const props = {
      value: "Existing\nmultiline\ncomment",
      ...(editing ? { onCancel() {} } : {}),
    };
    const editor = mount("components/comment-textarea.tsx", props, {
      ahooks: {
        useRequest: (_service, options) => ({
          cancel: cancelRequest,
          run: (...params) => options.onSuccess("", params),
        }),
      },
    });
    let contentHeight = 140;
    let height;
    const measurements = [];
    const textarea = {
      style: {
        get height() {
          return height;
        },
        set height(value) {
          height = value;
        },
      },
      get scrollHeight() {
        measurements.push(height);
        return contentHeight;
      },
    };
    const attach = (view) => find(view, "gt-header-textarea").ref(textarea);
    const render = (next = props) => editor.render(next, attach);
    render();
    assert.equal(height, "142px", "existing content is measured on mount");
    contentHeight = 800;
    render({ ...props, value: "Longer comment" });
    assert.equal(
      height,
      "802px",
      "CSS continues to enforce the shared maximum",
    );
    contentHeight = 60;
    render({ ...props, value: "Short" });
    assert.equal(height, "62px", "deleting content shrinks the textarea");
    find(render(), "gt-btn-preview").props.onClick();
    contentHeight = 0;
    render();
    assert.equal(height, "62px", "hidden textareas are not measured");
    contentHeight = 160;
    find(render(), "gt-btn-preview").props.onClick();
    render();
    assert.equal(
      height,
      "162px",
      "returning from preview measures visible content",
    );
    assert.ok(measurements.every((value) => value === "auto"));
    editor.unmount();
  }
});

test("mention list supports caret selection, keyboard navigation, IME and mouse selection", () => {
  let forwardedKeys = 0;
  let selected;
  const props = {
    value: "before @al after",
    comments: ["Alice", "Alfred", "alice", "Bob"].map((login) => ({
      user: { login },
    })),
    onValueChange: (value) => {
      selected = value;
    },
    onKeyDown: () => forwardedKeys++,
  };
  const editor = mount("components/comment-textarea.tsx", props);
  const textarea = { value: props.value, selectionStart: 10, selectionEnd: 10 };
  let view = editor.render();
  find(view, "gt-header-textarea").props.onSelect({ currentTarget: textarea });
  view = editor.render();
  const input = find(view, "gt-header-textarea");
  const list = find(view, "gt-mentions");
  const options = React.Children.toArray(list.props.children);
  assert.equal(list.props.role, "listbox");
  assert.equal(options.length, 2);
  assert.equal(input.props["aria-controls"], list.props.id);
  assert.equal(input.props["aria-activedescendant"], options[0].props.id);
  const key = (key, extra = {}) => ({
    key,
    nativeEvent: {},
    preventDefault() {},
    ...extra,
  });
  input.props.onKeyDown(key("ArrowDown"));
  view = editor.render();
  assert.equal(
    find(view, "gt-header-textarea").props["aria-activedescendant"],
    options[1].props.id,
  );
  find(view, "gt-header-textarea").props.onKeyDown(
    key("Enter", { nativeEvent: { isComposing: true } }),
  );
  assert.equal(selected, undefined);
  find(view, "gt-header-textarea").props.onKeyDown(key("Enter"));
  assert.equal(selected, "before @Alfred after");
  assert.equal(forwardedKeys, 0);
  assert.equal(find(editor.render(), "gt-mentions"), undefined);

  find(editor.render(), "gt-header-textarea").props.onSelect({
    currentTarget: textarea,
  });
  view = editor.render();
  let prevented = false;
  const option = React.Children.toArray(
    find(view, "gt-mentions").props.children,
  )[0];
  option.props.onMouseDown({
    preventDefault() {
      prevented = true;
    },
  });
  option.props.onClick();
  assert.equal(prevented, true);
  assert.equal(selected, "before @Alice after");
  editor.unmount();
});

test("mention dismissal, modified Enter and distinct editor IDs preserve editor behavior", () => {
  const values = [];
  const props = {
    value: "@a",
    comments: [{ user: { login: "Alice" } }],
    onValueChange: (value) => values.push(value),
  };
  const first = mount("components/comment-textarea.tsx", props);
  const target = { value: "@a", selectionStart: 2, selectionEnd: 2 };
  const open = (editor) => {
    find(editor.render(), "gt-header-textarea").props.onSelect({
      currentTarget: target,
    });
    return editor.render();
  };
  const a = open(first);
  // Reuse the loaded component module, as React does for sibling editors,
  // while giving the second instance its own hook state.
  first.render(props, undefined, []);
  const b = open(first);
  assert.notEqual(
    find(a, "gt-mentions").props.id,
    find(b, "gt-mentions").props.id,
  );
  find(b, "gt-header-textarea").props.onKeyDown({
    key: "Escape",
    nativeEvent: {},
    preventDefault() {},
  });
  assert.equal(find(first.render(), "gt-mentions"), undefined);
  const view = open(first);
  find(view, "gt-header-textarea").props.onKeyDown({
    key: "Enter",
    ctrlKey: true,
    nativeEvent: {},
    preventDefault() {},
  });
  assert.equal(values.length, 0);
  for (const key of ["Tab", "ArrowDown", "ArrowUp"]) {
    let prevented = false;
    find(view, "gt-header-textarea").props.onKeyDown({
      key,
      shiftKey: true,
      nativeEvent: {},
      preventDefault() {
        prevented = true;
      },
    });
    assert.equal(prevented, false, `Shift+${key} keeps its native behavior`);
    assert.equal(values.length, 0);
  }
  first.unmount();
});

test("completing an unchanged mention restores the caret without reopening suggestions", () => {
  let selected;
  const props = {
    value: "@Alice suffix",
    comments: [{ user: { login: "Alice" } }],
    onValueChange: (value) => {
      selected = value;
    },
  };
  const editor = mount("components/comment-textarea.tsx", props);
  let focused = 0;
  let caret;
  const target = {
    value: props.value,
    style: {},
    scrollHeight: 80,
    selectionStart: 2,
    selectionEnd: 2,
    focus() {
      focused++;
    },
    setSelectionRange(start, end) {
      caret = [start, end];
      this.selectionStart = start;
      this.selectionEnd = end;
    },
  };
  const attach = (view) => find(view, "gt-header-textarea").ref(target);
  let view = editor.render(props, attach);
  find(view, "gt-header-textarea").props.onSelect({ currentTarget: target });
  view = editor.render(props, attach);
  find(view, "gt-header-textarea").props.onKeyDown({
    key: "Enter",
    nativeEvent: {},
    preventDefault() {},
  });
  assert.equal(selected, props.value);
  view = editor.render(props, attach);
  assert.deepEqual(caret, [6, 6]);
  assert.equal(focused, 1);
  find(view, "gt-header-textarea").props.onSelect({ currentTarget: target });
  assert.equal(find(editor.render(props, attach), "gt-mentions"), undefined);
  editor.unmount();
});

test("all eight reaction controls expose exact counts, viewer states and content", () => {
  const { REACTIONS, reactionsFromRest } = loadSource("utils/reactions.ts");
  const reactions = reactionsFromRest();
  REACTIONS.forEach((r, i) => {
    reactions[r.content] = {
      totalCount: 150 + i,
      viewerHasReacted: i % 2 === 0,
    };
  });
  const actions = [];
  const props = {
    reactions,
    canReact: true,
    onReaction: (...args) => actions.push(args),
  };
  const comment = mount("components/reactions.tsx", props);
  const buttons = React.Children.toArray(
    find(comment.render(), "gt-comment-reactions").props.children,
  ).filter((child) => child.props.className === "gt-comment-reaction");
  assert.equal(buttons.length, 8);
  buttons.forEach((button, i) => {
    assert.equal(button.props["aria-pressed"], i % 2 === 0);
    assert.match(button.props["aria-label"], new RegExp(String(150 + i)));
    button.props.onClick();
    assert.deepEqual(actions[i], [i % 2 !== 0, REACTIONS[i].content]);
  });
  comment.unmount();
});

test("reaction picker hides empty counts and offers all eight reactions in its menu", () => {
  const { REACTIONS, reactionsFromRest } = loadSource("utils/reactions.ts");
  const reactions = reactionsFromRest();
  reactions.HEART = { totalCount: 1, viewerHasReacted: true };
  const actions = [];
  const props = {
    reactions,
    canReact: true,
    onReaction: (...args) => actions.push(args),
  };
  const picker = mount("components/reactions.tsx", props, {
    document: { addEventListener() {}, removeEventListener() {} },
  });
  let view = picker.render();
  const chips = React.Children.toArray(view.props.children).filter(
    (child) => child.props.className === "gt-comment-reaction",
  );
  assert.equal(chips.length, 1);
  assert.equal(chips[0].props["data-reaction"], "HEART");
  assert.equal(find(view, "gt-reaction-menu"), undefined);
  const trigger = find(view, "gt-reaction-add");
  assert.equal(trigger.props.type, "button");
  assert.equal(trigger.props["aria-haspopup"], "menu");
  assert.equal(trigger.props["aria-expanded"], false);
  trigger.props.onClick();
  view = picker.render();
  assert.equal(find(view, "gt-reaction-add").props["aria-expanded"], true);
  const menu = find(view, "gt-reaction-menu");
  assert.equal(menu.props.role, "menu");
  const options = React.Children.toArray(menu.props.children);
  assert.equal(options.length, 8);
  options.forEach((option, index) => {
    assert.equal(option.props["data-reaction"], REACTIONS[index].content);
    assert.equal(option.props.role, "menuitemcheckbox");
    assert.equal(
      option.props["aria-checked"],
      REACTIONS[index].content === "HEART",
    );
  });
  options
    .find((option) => option.props["data-reaction"] === "HEART")
    .props.onClick();
  assert.deepEqual(actions.pop(), [false, "HEART"]);
  assert.equal(find(picker.render(), "gt-reaction-menu"), undefined);
  find(picker.render(), "gt-reaction-add").props.onClick();
  const reopened = picker.render();
  React.Children.toArray(
    find(reopened, "gt-reaction-menu").props.children,
  )[0].props.onClick();
  assert.deepEqual(actions.pop(), [true, "THUMBS_UP"]);
  const empty = picker.render({ ...props, reactions: reactionsFromRest() });
  assert.equal(
    React.Children.toArray(empty.props.children).filter(
      (child) => child.props.className === "gt-comment-reaction",
    ).length,
    0,
  );
  picker.unmount();
});

test("horizontal reaction menu manages keyboard focus, outside clicks and cleanup", () => {
  const listeners = new Set();
  const document = {
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
  };
  const inside = {};
  const focused = [];
  const buttons = Array.from({ length: 8 }, (_, index) => ({
    focus: () => focused.push(index),
  }));
  let triggerFocus = 0;
  const props = {
    reactions: loadSource("utils/reactions.ts").reactionsFromRest(),
    canReact: true,
    onReaction() {},
  };
  const picker = mount("components/reactions.tsx", props, { document });
  const attach = (view) => {
    find(view, "gt-reaction-add").ref.current = { focus: () => triggerFocus++ };
    find(view, "gt-reaction-picker").ref.current = {
      contains: (target) => target === inside,
    };
    const menu = find(view, "gt-reaction-menu");
    if (menu) menu.ref.current = { querySelectorAll: () => buttons };
  };
  const render = () => picker.render(props, attach);
  const key = (key) => ({ key, preventDefault() {} });
  let view = render();
  find(view, "gt-reaction-add").props.onKeyDown(key("ArrowUp"));
  view = render();
  assert.equal(focused.at(-1), 7);
  assert.equal(listeners.size, 1);
  find(view, "gt-reaction-picker").props.onKeyDown(key("ArrowRight"));
  view = render();
  assert.equal(focused.at(-1), 0);
  find(view, "gt-reaction-picker").props.onKeyDown(key("End"));
  view = render();
  assert.equal(focused.at(-1), 7);
  for (const listener of listeners) listener({ target: inside });
  assert.ok(find(render(), "gt-reaction-menu"));
  assert.equal(listeners.size, 1);
  find(view, "gt-reaction-picker").props.onKeyDown(key("Escape"));
  assert.equal(find(render(), "gt-reaction-menu"), undefined);
  assert.equal(triggerFocus, 1);
  assert.equal(listeners.size, 0);
  find(render(), "gt-reaction-add").props.onClick();
  render();
  for (const listener of listeners) listener({ target: {} });
  assert.equal(find(render(), "gt-reaction-menu"), undefined);
  assert.equal(triggerFocus, 1);
  find(render(), "gt-reaction-add").props.onClick();
  view = render();
  let prevented = false;
  find(view, "gt-reaction-picker").props.onKeyDown({
    key: "Tab",
    shiftKey: true,
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(prevented, false);
  find(view, "gt-reaction-picker").props.onBlur({
    currentTarget: { contains: () => false },
    relatedTarget: {},
  });
  assert.equal(find(render(), "gt-reaction-menu"), undefined);
  find(render(), "gt-reaction-add").props.onClick();
  render();
  picker.unmount();
  assert.equal(listeners.size, 0);
});

test("loading disables both reaction chips and menu choices", () => {
  const reactions = loadSource("utils/reactions.ts").reactionsFromRest({
    heart: 1,
  });
  let calls = 0;
  const props = { reactions, canReact: true, onReaction: () => calls++ };
  const picker = mount("components/reactions.tsx", props, {
    document: { addEventListener() {}, removeEventListener() {} },
  });
  find(picker.render(), "gt-reaction-add").props.onClick();
  const view = picker.render({ ...props, loading: true });
  const chips = React.Children.toArray(view.props.children).filter(
    (child) => child.props.className === "gt-comment-reaction",
  );
  assert.equal(find(view, "gt-reaction-add").props["aria-disabled"], true);
  assert.equal(find(view, "gt-reaction-add").props.disabled, undefined);
  assert.equal(chips[0].props.disabled, true);
  chips[0].props.onClick();
  for (const option of React.Children.toArray(
    find(view, "gt-reaction-menu").props.children,
  )) {
    assert.equal(option.props.disabled, true);
    option.props.onClick();
  }
  assert.equal(calls, 0);
  picker.unmount();
});

test("anonymous reactions are read-only and an open menu disappears on logout", () => {
  const listeners = new Set();
  const document = {
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
  };
  const reactions = loadSource("utils/reactions.ts").reactionsFromRest({
    heart: 3,
  });
  let calls = 0;
  const props = { reactions, canReact: false, onReaction: () => calls++ };
  const picker = mount("components/reactions.tsx", props, { document });
  let view = picker.render();
  assert.equal(find(view, "gt-reaction-add"), undefined);
  const count = find(view, "gt-comment-reaction");
  assert.equal(count.type, "span");
  assert.equal(count.props["aria-label"], "Heart: 3");
  assert.equal(count.props.onClick, undefined);
  view = picker.render({ ...props, canReact: true });
  find(view, "gt-reaction-add").props.onClick();
  view = picker.render({ ...props, canReact: true });
  assert.ok(find(view, "gt-reaction-menu"));
  assert.equal(listeners.size, 1);
  view = picker.render(props);
  assert.equal(find(view, "gt-reaction-add"), undefined);
  assert.equal(find(view, "gt-reaction-menu"), undefined);
  assert.equal(listeners.size, 0);
  view = picker.render({ ...props, canReact: true });
  assert.equal(find(view, "gt-reaction-menu"), undefined);
  find(view, "gt-comment-reaction").props.onClick();
  assert.equal(calls, 1);
  picker.unmount();
});

test("comment reaction permission follows the current logged-in user", () => {
  const reactions = loadSource("utils/reactions.ts").reactionsFromRest({
    heart: 2,
  });
  const comment = {
    id: 1,
    body_html: "",
    created_at: "2026-10-17",
    html_url: "https://github.com/o/r",
    user: { login: "author" },
    reactions,
  };
  for (const user of [undefined, { login: "reader" }]) {
    const list = mount("components/comments-list.tsx", {
      comments: [comment],
      commentsCount: 1,
      admin: [],
      user,
      onReaction() {},
    });
    const view = list.render();
    const animated = React.Children.toArray(view.props.children).find(
      (child) => child.type?.name === "AnimatedComments",
    );
    const item = React.Children.toArray(animated.props.children)[0];
    const renderedComment = item.type(item.props);
    assert.equal(renderedComment.props.canReact, !!user);
    const row = mount("components/comment.tsx", renderedComment.props);
    const content = find(row.render(), "gt-comment-content");
    const picker = React.Children.toArray(content.props.children).find(
      (child) => child.type?.name === "Reactions",
    );
    assert.equal(picker.props.canReact, !!user);
    row.unmount();
    list.unmount();
  }
});

test("removing the last reaction retains focus on the available picker trigger", () => {
  const reactions = loadSource("utils/reactions.ts").reactionsFromRest();
  reactions.HEART = { totalCount: 1, viewerHasReacted: true };
  let focus;
  const trigger = {
    focus: () => {
      focus = "trigger";
    },
  };
  const actions = [];
  const props = {
    reactions,
    canReact: true,
    onReaction: (...args) => actions.push(args),
  };
  const picker = mount("components/reactions.tsx", props);
  const attach = (view) => {
    find(view, "gt-reaction-add").ref.current = trigger;
  };
  const view = picker.render(props, attach);
  focus = "heart";
  find(view, "gt-comment-reaction").props.onClick();
  assert.equal(focus, "trigger");
  assert.deepEqual(actions, [[false, "HEART"]]);
  let next = picker.render({ ...props, loading: true }, attach);
  assert.equal(find(next, "gt-reaction-add").props.disabled, undefined);
  assert.equal(find(next, "gt-reaction-add").props["aria-disabled"], true);
  find(next, "gt-reaction-add").props.onClick();
  assert.equal(
    find(
      picker.render({ ...props, loading: true }, attach),
      "gt-reaction-menu",
    ),
    undefined,
  );
  next = picker.render(
    {
      ...props,
      reactions: loadSource("utils/reactions.ts").reactionsFromRest(),
      loading: false,
    },
    attach,
  );
  assert.equal(find(next, "gt-comment-reaction"), undefined);
  assert.equal(find(next, "gt-reaction-add").props["aria-disabled"], false);
  assert.equal(focus, "trigger");
  picker.unmount();
});

test("anonymous users can choose either comment sort direction from the popup", () => {
  const directions = [];
  const menu = mount(
    "components/meta.tsx",
    {
      commentsCount: 5,
      pagerDirection: "last",
      onPagerDirectionChange: (direction) => directions.push(direction),
      onLogin() {},
    },
    { document: { addEventListener() {}, removeEventListener() {} } },
  );
  find(menu.render(), "gt-user-inner").props.onClick();
  const popup = menu.render();
  const ascending = find(popup, "gt-action-sortasc");
  const descending = find(popup, "gt-action-sortdesc");
  assert.ok(ascending);
  assert.ok(descending);
  ascending.props.onClick();
  descending.props.onClick();
  assert.deepEqual(directions, ["first", "last"]);
  assert.ok(find(popup, "gt-action-login"));
  menu.unmount();
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
  const url = new URL(
    getAuthorizeUrl(
      "client+with space&=",
      { owner: "owner", repo: "repo", id: "article" },
      "",
    ),
  );
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
