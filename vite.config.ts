import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

import { peerDependencies } from "./package.json";

// https://vite.dev/config/
export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "lib/gitalk.tsx"),
      name: "Gitalk",
      fileName: "gitalk",
    },
    rollupOptions: {
      external: ["react/jsx-runtime", ...Object.keys(peerDependencies)],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
          "react/jsx-runtime": "jsx",
        },
      },
    },
  },
  plugins: [
    react(),
    dts({
      tsconfigPath: "tsconfig.app.json",
      rollupTypes: true,
    }),
    visualizer({
      open: true,
    }),
  ],
});
