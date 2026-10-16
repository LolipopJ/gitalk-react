import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => {
  const full = mode === "full";

  return {
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    resolve: {
      alias: full
        ? [
            {
              find: "react",
              replacement: resolve(
                import.meta.dirname,
                "node_modules/react-latest",
              ),
            },
            {
              find: "react-dom",
              replacement: resolve(
                import.meta.dirname,
                "node_modules/react-dom-latest",
              ),
            },
          ]
        : [],
    },
    build: {
      emptyOutDir: false,
      lib: {
        entry: resolve(
          import.meta.dirname,
          full ? "lib/browser-full.ts" : "lib/browser.ts",
        ),
        name: "Gitalk",
        formats: ["iife"],
        fileName: () => (full ? "gitalk.browser.full.js" : "gitalk.browser.js"),
      },
      rollupOptions: {
        external: full ? [] : ["react", "react-dom"],
        output: {
          globals: { react: "React", "react-dom": "ReactDOM" },
          exports: "default",
        },
      },
    },
    plugins: [react({ jsxRuntime: "classic" })],
  };
});
