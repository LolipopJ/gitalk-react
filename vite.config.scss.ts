import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: false,
    rollupOptions: {
      input: {
        "gitalk-dark": resolve(__dirname, "lib/themes/gitalk-dark.scss"),
        "gitalk-light": resolve(__dirname, "lib/themes/gitalk-light.scss"),
      },
      output: {
        assetFileNames: "[name][extname]",
      },
    },
  },
  plugins: [],
});
