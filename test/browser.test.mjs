import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

import React from "react";
import ts from "typescript";

function loadBrowser(full = false, modern = false) {
  const source = new URL(
    full ? "../lib/browser-full.ts" : "../lib/browser.ts",
    import.meta.url,
  );
  assert.ok(existsSync(source), "the browser constructor entry must exist");
  const containers = new Map([
    ["first", { id: "first" }],
    ["second", { id: "second" }],
  ]);
  const mounted = new Map();
  const unmounted = [];
  const modernRoots = [];
  const component = () => null;
  function loadModule(file) {
    const output = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
      },
    }).outputText;
    const exports = {};
    vm.runInNewContext(output, {
      exports,
      document: { getElementById: (id) => containers.get(id) ?? null },
      require(name) {
        if (name === "react") return React;
        if (name === "react-dom") {
          assert.equal(
            full,
            false,
            "the full build must not use ReactDOM.render",
          );
          return {
            createRoot: modern
              ? (container) => {
                  modernRoots.push(container);
                  return {
                    render(element) {
                      mounted.set(container, element);
                    },
                    unmount() {
                      mounted.delete(container);
                      unmounted.push(container);
                    },
                  };
                }
              : undefined,
            render(element, container) {
              mounted.set(container, element);
            },
            unmountComponentAtNode(container) {
              mounted.delete(container);
              unmounted.push(container);
            },
          };
        }
        if (name === "react-dom-latest/client") {
          assert.equal(full, true);
          return {
            createRoot(container) {
              modernRoots.push(container);
              return {
                render(element) {
                  mounted.set(container, element);
                },
                unmount() {
                  mounted.delete(container);
                  unmounted.push(container);
                },
              };
            },
          };
        }
        if (name === "./browser-root")
          return loadModule(new URL("../lib/browser-root.ts", import.meta.url));
        if (name === "./gitalk")
          return { default: component, __esModule: true };
        throw new Error(`Unexpected dependency: ${name}`);
      },
    });
    return exports;
  }
  return {
    Gitalk: loadModule(source).default,
    containers,
    mounted,
    unmounted,
    modernRoots,
    component,
  };
}

const options = {
  clientID: "id",
  proxy: "/oauth",
  owner: "owner",
  repo: "repo",
  admin: ["owner"],
};

test("the browser constructor mounts the component with its options", () => {
  const { Gitalk, containers, mounted, component } = loadBrowser();
  const gitalk = new Gitalk(options);
  gitalk.render("first");
  const element = mounted.get(containers.get("first"));
  assert.equal(element.type, component);
  assert.deepEqual(element.props, options);
});

test("rendering again updates the same mount and moving releases the old mount", () => {
  const { Gitalk, containers, mounted, unmounted } = loadBrowser();
  const gitalk = new Gitalk(options);
  gitalk.render("first");
  gitalk.render("first");
  assert.equal(mounted.size, 1);
  assert.equal(unmounted.length, 0);
  gitalk.render("second");
  assert.equal(mounted.has(containers.get("first")), false);
  assert.equal(mounted.has(containers.get("second")), true);
  assert.deepEqual(unmounted, [containers.get("first")]);
});

test("a missing container fails without removing the existing mount", () => {
  const { Gitalk, containers, mounted, unmounted } = loadBrowser();
  const gitalk = new Gitalk(options);
  gitalk.render("first");
  assert.throws(() => gitalk.render("missing"), /container.*missing/i);
  assert.equal(mounted.has(containers.get("first")), true);
  assert.equal(unmounted.length, 0);
});

test("destroy releases the mount once and the instance can render again", () => {
  const { Gitalk, containers, mounted, unmounted } = loadBrowser();
  const gitalk = new Gitalk(options);
  gitalk.destroy();
  gitalk.render("first");
  gitalk.destroy();
  gitalk.destroy();
  assert.equal(mounted.size, 0);
  assert.deepEqual(unmounted, [containers.get("first")]);
  gitalk.render("second");
  assert.equal(mounted.has(containers.get("second")), true);
});

test("the full constructor reuses a modern root and releases it on move and destroy", () => {
  const { Gitalk, containers, mounted, unmounted, modernRoots } =
    loadBrowser(true);
  const gitalk = new Gitalk(options);
  gitalk.render("first");
  gitalk.render("first");
  assert.deepEqual(modernRoots, [containers.get("first")]);
  assert.equal(mounted.size, 1);
  assert.throws(() => gitalk.render("missing"), /container.*missing/i);
  assert.equal(mounted.has(containers.get("first")), true);
  gitalk.render("second");
  assert.deepEqual(modernRoots, [
    containers.get("first"),
    containers.get("second"),
  ]);
  assert.deepEqual(unmounted, [containers.get("first")]);
  gitalk.destroy();
  gitalk.destroy();
  assert.equal(mounted.size, 0);
  assert.deepEqual(unmounted, [
    containers.get("first"),
    containers.get("second"),
  ]);
});

test("the shared-runtime browser constructor prefers createRoot when available", () => {
  const { Gitalk, containers, mounted, unmounted, modernRoots } = loadBrowser(
    false,
    true,
  );
  const gitalk = new Gitalk(options);
  gitalk.render("first");
  gitalk.render("first");
  assert.deepEqual(modernRoots, [containers.get("first")]);
  gitalk.destroy();
  assert.equal(mounted.size, 0);
  assert.deepEqual(unmounted, [containers.get("first")]);
});

test("both CDN scripts are IIFEs exposing the constructor", () => {
  for (const name of ["gitalk.browser.js", "gitalk.browser.full.js"]) {
    const file = new URL(`../dist/${name}`, import.meta.url);
    assert.ok(existsSync(file), `${name} must be built`);
    const code = readFileSync(file, "utf8");
    assert.match(code, /\bvar Gitalk\s*=/);
    assert.doesNotMatch(
      code,
      /process\.env|\bimport\s*(?:\(|["'{*])|\bexport\s/,
    );
  }
});
