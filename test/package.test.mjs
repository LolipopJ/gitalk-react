import assert from "node:assert/strict";
import { execFileSync, execSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
let consumer;
let installed;
let manifest;

before(() => {
  const temporaryRoot = join(root, "node_modules/.tmp");
  mkdirSync(temporaryRoot, { recursive: true });
  consumer = mkdtempSync(join(temporaryRoot, "package-consumer-"));
  const output = execSync("npm pack --ignore-scripts --dry-run=false --json", {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, npm_config_pack_destination: consumer },
  });
  const [{ filename }] = JSON.parse(output);
  installed = join(consumer, "node_modules/gitalk-react");
  mkdirSync(installed, { recursive: true });
  const tar =
    process.platform === "win32"
      ? join(process.env.SystemRoot, "System32/tar.exe")
      : "tar";
  execFileSync(tar, [
    "-xf",
    join(consumer, filename),
    "-C",
    installed,
    "--strip-components=1",
  ]);
  writeFileSync(join(consumer, "package.json"), '{"type":"module"}');
  manifest = JSON.parse(readFileSync(join(installed, "package.json"), "utf8"));
});

after(() => {
  if (consumer) rmSync(consumer, { recursive: true, force: true });
});

test("packed ESM and CommonJS consumers resolve and check public types", () => {
  const files = ["mts", "cts"].map((extension) => {
    const filename = join(consumer, `consumer.${extension}`);
    writeFileSync(
      filename,
      `import Gitalk, { Gitalk as NamedGitalk, type GitalkProps } from "gitalk-react";
import { createElement } from "react";
const props: GitalkProps = { clientID: "id", owner: "owner", repo: "repo", admin: ["owner"] };
createElement(Gitalk, props);
createElement(NamedGitalk, props);
// @ts-expect-error clientID must remain a string, not any
const invalid: GitalkProps = { ...props, clientID: 123 };
`,
    );
    return filename;
  });
  const directConsumer = join(consumer, "direct.cts");
  writeFileSync(
    directConsumer,
    `import Gitalk = require("gitalk-react");
import { createElement } from "react";
const props: Gitalk.GitalkProps = { clientID: "id", owner: "owner", repo: "repo", admin: ["owner"] };
createElement(Gitalk, props);
createElement(Gitalk.Gitalk, props);
// @ts-expect-error the callable CommonJS export must retain its prop types
createElement(Gitalk, { ...props, clientID: 123 });
`,
  );
  files.push(directConsumer);
  const program = ts.createProgram(files, {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    noEmit: true,
    types: [],
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(
    diagnostics.length,
    0,
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (path) => path,
      getCurrentDirectory: () => consumer,
      getNewLine: () => "\n",
    }),
  );
});

test("both packed entry points retain the client boundary", () => {
  for (const condition of ["import", "require"]) {
    const filename = manifest.exports["."][condition].default;
    assert.match(
      readFileSync(resolve(installed, filename), "utf8").slice(0, 80),
      /^\s*["']use client["'];/,
      `${condition} must preserve the use client directive`,
    );
  }
});

test("the packed CommonJS export is callable and exposes itself as Gitalk", (context) => {
  // Import shape only; this component does not support rendering on the server.
  context.mock.method(console, "error", () => {});
  const require = createRequire(join(consumer, "consumer.cjs"));
  const Gitalk = require("gitalk-react");
  assert.equal(typeof Gitalk, "function");
  assert.equal(Gitalk.Gitalk, Gitalk);
});

test("all exported styles are included in the tarball", () => {
  for (const [name, filename] of Object.entries(manifest.exports)) {
    if (name.endsWith(".css")) {
      assert.ok(readFileSync(resolve(installed, filename), "utf8").length);
    }
  }
});
