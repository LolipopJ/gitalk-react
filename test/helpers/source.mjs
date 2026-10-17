import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

import ts from "typescript";

export const loadSource = (path, overrides = {}) => {
  const filename = new URL(`../../lib/${path}`, import.meta.url);
  const module = { exports: {} };
  const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  });
  vm.runInNewContext(outputText, {
    module,
    exports: module.exports,
    require: (name) => {
      if (name in overrides) return overrides[name];
      if (name.startsWith(".")) {
        const nested = new URL(`${name}.ts`, filename);
        return loadSource(nested.pathname.split("/lib/")[1], overrides);
      }
      return createRequire(filename)(name);
    },
    console,
    ...overrides.globals,
  });
  return module.exports;
};
