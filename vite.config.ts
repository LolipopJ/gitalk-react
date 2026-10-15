import { copyFile } from "node:fs/promises";

import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

import packageJson from "./package.json" with { type: "json" };

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  build: {
    lib: {
      entry: resolve(import.meta.dirname, "lib/gitalk.tsx"),
      fileName: "gitalk",
      formats: ["es", "cjs"],
    },
    rollupOptions: {
      external: [
        "react/jsx-runtime",
        ...Object.keys(packageJson.peerDependencies),
      ],
      output: {
        banner: '"use client";',
        exports: "named",
        footer: (chunk) =>
          chunk.fileName.endsWith(".cjs")
            ? "module.exports = Object.assign(module.exports.default, { Gitalk: module.exports.Gitalk });"
            : "",
      },
    },
  },
  plugins: [
    react(),
    dts({
      tsconfigPath: "tsconfig.lib.json",
      bundleTypes: true,
      outDirs: [{ dir: "dist", moduleFormat: "esm" }],
      afterBuild: () =>
        copyFile(
          resolve(import.meta.dirname, "types/gitalk.d.cts"),
          resolve(import.meta.dirname, "dist/gitalk.d.cts"),
        ),
    }),
    mode === "analyze" && visualizer({ open: true }),
  ],
}));
