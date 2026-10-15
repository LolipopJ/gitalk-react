import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import ts from "typescript";

const require = createRequire(import.meta.url);
const load = (filename) => {
  const module = { exports: {} };
  const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
      target: ts.ScriptTarget.ES2020,
    },
  });
  vm.runInNewContext(outputText, {
    module,
    exports: module.exports,
    require: (name) => {
      if (name === "../constants") return { DEFAULT_LANG: "en" };
      if (name.endsWith(".json"))
        return require(resolve(dirname(filename), name));
      return require(name);
    },
    Intl,
    Date,
  });
  return module.exports;
};

const { default: i18n } = load(
  fileURLToPath(new URL("../lib/i18n/index.ts", import.meta.url)),
);

test("regional language tags use the available base translation", () => {
  for (const [requested, expected] of [
    ["fr-FR", "fr"],
    ["de-DE", "de"],
    ["ja-JP", "ja"],
    ["pt-BR", "pt"],
    ["es-ES", "es"],
    ["FR-fr", "fr"],
    ["fr-FR-u-nu-latn", "fr"],
  ]) {
    assert.equal(i18n(requested).t("comment"), i18n(expected).t("comment"));
    assert.equal(i18n(requested).locale(), expected);
  }
});

test("Chinese language tags retain simplified and traditional translations", () => {
  for (const [requested, expected] of [
    ["zh-CN", "zh-CN"],
    ["zh-SG", "zh-CN"],
    ["zh-TW", "zh-TW"],
    ["zh-HK", "zh-HK"],
    ["zh-MO", "zh-TW"],
    ["zh-Hans", "zh-CN"],
    ["zh-Hant", "zh-TW"],
    ["zh-Hant-HK", "zh-TW"],
    ["zh-Hans-TW", "zh-CN"],
  ]) {
    assert.equal(i18n(requested).t("comment"), i18n(expected).t("comment"));
    assert.equal(i18n(requested).locale(), expected);
  }
});

test("unsupported and invalid language tags use English", () => {
  for (const language of [
    "it-IT",
    "",
    "invalid_tag",
    "constructor",
    "toString",
  ]) {
    assert.equal(i18n(language).t("comment"), i18n("en").t("comment"));
    assert.equal(i18n(language).locale(), "en");
  }
});

const { formatRelativeTime } = load(
  fileURLToPath(new URL("../lib/utils/date.ts", import.meta.url)),
);
const now = Date.parse("2026-10-15T12:00:00Z");
const date = (seconds) => new Date(now + seconds * 1000).toISOString();

test("relative dates select useful units for past, present, and future", () => {
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [seconds, expected] of [
    [0, "now"],
    [-0.1, "now"],
    [-45, "45 seconds ago"],
    [-59, "59 seconds ago"],
    [-60, "1 minute ago"],
    [-90, "2 minutes ago"],
    [-3600, "1 hour ago"],
    [-86400, "yesterday"],
    [-30 * 86400, "last month"],
    [-365 * 86400, "last year"],
    [90, "in 2 minutes"],
    [86400, "tomorrow"],
  ]) {
    assert.equal(formatRelativeTime(date(seconds), formatter, now), expected);
  }
});

test("relative dates use the same language as regional translations", () => {
  for (const requested of ["fr-FR", "ja-JP", "zh-Hant", "ur-PK", "it-IT"]) {
    const formatter = new Intl.RelativeTimeFormat(i18n(requested).locale(), {
      numeric: "auto",
    });
    assert.equal(
      formatRelativeTime(date(-120), formatter, now),
      formatter.format(-2, "minute"),
    );
  }
});

test("relative dates parse equivalent ISO timestamps with timezone offsets", () => {
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  assert.equal(
    formatRelativeTime("2026-10-15T19:58:00+08:00", formatter, now),
    "2 minutes ago",
  );
});
