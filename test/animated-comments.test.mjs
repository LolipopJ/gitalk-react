import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

import React from "react";
import ts from "typescript";

const { outputText } = ts.transpileModule(
  readFileSync(
    new URL("../lib/components/animated-comments.tsx", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
      target: ts.ScriptTarget.ES2020,
    },
  },
);
const exports = {};
vm.runInNewContext(outputText, {
  exports,
  require: () => React,
});
const AnimatedComments = exports.default;
const children = (...keys) =>
  keys.map((key) => React.createElement("p", { key }, key));
const mount = (...keys) => {
  const list = new AnimatedComments({ children: children(...keys) });
  list.setState = (next) => {
    list.state = {
      ...list.state,
      ...(typeof next === "function" ? next(list.state) : next),
    };
  };
  return list;
};
const update = (list, ...keys) => {
  list.props = { children: children(...keys) };
  list.state = {
    ...list.state,
    ...AnimatedComments.getDerivedStateFromProps(list.props, list.state),
  };
};

test("completed entry animations do not restart when rows are reordered", () => {
  const list = mount("a", "b");
  for (const row of list.render().props.children) {
    assert.match(row.props.className, /entering/);
    const target = {};
    row.props.onAnimationEnd({
      target,
      currentTarget: target,
      animationName: "gt-comment-enter",
    });
  }
  update(list, "b", "a", "c");
  const rows = list.render().props.children;
  assert.ok(
    rows.slice(0, 2).every((row) => !row.props.className.includes("entering")),
  );
  assert.match(rows[2].props.className, /entering/);
});

test("removed comments remain until their own exit animation finishes", () => {
  const list = mount("a", "b");
  update(list, "b");
  const rows = list.render().props.children;
  assert.equal(rows.length, 2);
  const leaving = rows.find((row) => row.key === "a");
  assert.match(leaving.props.className, /leaving/);
  const event = {
    target: {},
    currentTarget: {},
    animationName: "gt-comment-leave",
  };
  leaving.props.onAnimationEnd(event);
  assert.equal(
    list.state.items.length,
    2,
    "nested animations cannot remove the row",
  );
  event.target = event.currentTarget;
  leaving.props.onAnimationEnd(event);
  assert.deepEqual(
    Array.from(list.state.items, (item) => item.key),
    ["b"],
  );
});

test("reordering retains keys and reappearing comments cancel pending removal", () => {
  const list = mount("a", "b");
  update(list, "b");
  const leaving = list.render().props.children.find((row) => row.key === "a");
  update(list, "b", "a", "c");
  const target = {};
  leaving.props.onAnimationEnd({
    target,
    currentTarget: target,
    animationName: "gt-comment-leave",
  });
  assert.deepEqual(
    Array.from(list.state.items, (item) => item.key),
    ["b", "a", "c"],
  );
  assert.ok(
    list
      .render()
      .props.children.every((row) => !row.props.className.includes("leaving")),
  );
});

test("layout snapshots drive CSS transforms and keep exits at their old positions", () => {
  const list = mount("a", "b");
  const transforms = [];
  const node = (key, top) => ({
    dataset: { key },
    offsetTop: top,
    getBoundingClientRect: () => ({ top }),
    style: {
      set transform(value) {
        transforms.push([key, value]);
      },
    },
  });
  const a = node("a", 0);
  const b = node("b", 100);
  list.container.current = {
    children: [a, b],
    getBoundingClientRect: () => ({ top: 0 }),
    offsetHeight: 200,
  };
  const snapshot = list.getSnapshotBeforeUpdate();
  update(list, "b");
  b.offsetTop = 0;
  list.container.current.children = [b, a];
  list.componentDidUpdate({}, {}, snapshot);
  assert.ok(
    transforms.some(([key, value]) => key === "b" && value.includes("100px")),
  );
  assert.equal(transforms.at(-1)[1], "");
  assert.equal(a.style.top, "0px");
});
