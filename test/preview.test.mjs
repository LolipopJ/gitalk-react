import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = ts.createSourceFile(
  "App.tsx",
  readFileSync(join(root, "dev/App.tsx"), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let initializer;
ts.forEachChild(source, (statement) => {
  if (!ts.isVariableStatement(statement)) return;
  for (const declaration of statement.declarationList.declarations) {
    if (declaration.name.getText(source) === "GITALK_BASE_OPTIONS") {
      initializer = declaration.initializer;
    }
  }
});
assert.ok(initializer, "preview configuration must exist");

for (const { name, production, proxy } of [
  {
    name: "production preset",
    production: true,
    proxy: "https://oauth.example/oauth/access_token",
  },
  {
    name: "development server proxy",
    production: false,
    proxy: "https://oauth.example/oauth/access_token",
  },
  { name: "development client secret", production: false, proxy: "" },
]) {
  test(`preview uses ${name} and excludes server secrets`, () => {
    const outDir = mkdtempSync(join(tmpdir(), "gitalk-preview-"));
    const frontendSecret = "PREVIEW_CLIENT_SECRET";
    const serverSecret = "SERVER_SECRET_MUST_NOT_BE_BUNDLED";
    const env = {
      VITE_CLIENT_ID: "preview-client",
      VITE_PROXY: proxy,
      VITE_CLIENT_SECRET: frontendSecret,
      VITE_REPO_OWNER: "preview-owner",
      VITE_REPO_NAME: "preview-repo",
      VITE_ADMIN: '["preview-admin"]',
    };
    try {
      const config = vm.runInNewContext(
        `(${initializer.getText(source).replaceAll("import.meta.env", "env")})`,
        { env: { ...env, PROD: production } },
      );
      if (production) {
        assert.equal(config.proxy, undefined);
        assert.equal(typeof config.clientSecret, "string");
        assert.ok(config.clientSecret);
        assert.notEqual(config.clientSecret, frontendSecret);
        assert.notEqual(config.clientID, env.VITE_CLIENT_ID);
      } else {
        assert.equal(config.clientID, env.VITE_CLIENT_ID);
        assert.equal(config.owner, env.VITE_REPO_OWNER);
        assert.equal(config.repo, env.VITE_REPO_NAME);
        assert.deepEqual(Array.from(config.admin), ["preview-admin"]);
        if (proxy) {
          assert.equal(config.proxy, proxy);
          assert.equal(config.clientSecret, undefined);
        } else {
          assert.equal(config.proxy, undefined);
          assert.equal(config.clientSecret, frontendSecret);
        }
      }
      const result = spawnSync(
        process.execPath,
        [
          "node_modules/vite/bin/vite.js",
          "build",
          "--config",
          "vite.config.preview.ts",
          "--outDir",
          outDir,
        ],
        {
          cwd: root,
          encoding: "utf8",
          timeout: 30000,
          env: {
            ...process.env,
            ...env,
            NODE_ENV: production ? "production" : "development",
            GITHUB_CLIENT_SECRET: serverSecret,
          },
        },
      );
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const assets = readdirSync(join(outDir, "assets"))
        .filter((name) => name.endsWith(".js"))
        .map((name) => readFileSync(join(outDir, "assets", name), "utf8"))
        .join("\n");
      assert.equal(
        assets.includes(serverSecret),
        false,
        "server secret leaked into preview",
      );
      if (production) {
        assert.equal(
          assets.includes(proxy),
          false,
          "production must ignore development proxy configuration",
        );
        assert.equal(
          assets.includes(frontendSecret),
          false,
          "production must ignore development client secret configuration",
        );
        assert.ok(
          assets.includes(config.clientID),
          "production client ID must reach the browser",
        );
        assert.ok(
          assets.includes(config.clientSecret),
          "production preset uses the client-secret flow",
        );
      } else {
        assert.ok(
          assets.includes(env.VITE_CLIENT_ID),
          "development client ID must reach the browser",
        );
        assert.ok(
          assets.includes(proxy || frontendSecret),
          "selected development credentials must reach the browser",
        );
      }
    } finally {
      assert.equal(dirname(outDir), tmpdir());
      rmSync(outDir, { recursive: true, force: true });
    }
  });
}
