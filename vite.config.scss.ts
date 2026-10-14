import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: false,
    rollupOptions: {
      input: {
        "gitalk-dark": resolve(
          import.meta.dirname,
          "lib/themes/gitalk-dark.scss",
        ),
        "gitalk-light": resolve(
          import.meta.dirname,
          "lib/themes/gitalk-light.scss",
        ),
      },
      output: {
        assetFileNames: "[name][extname]",
      },
    },
  },
  plugins: [],
});
