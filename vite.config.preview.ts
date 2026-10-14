import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  base: "/gitalk-react/",
  build: { outDir: "out" },
  server: {
    proxy: {
      "/oauth/access_token": "http://127.0.0.1:3000",
    },
  },
  plugins: [react()],
});
