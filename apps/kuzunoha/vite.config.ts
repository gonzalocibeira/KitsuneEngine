import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "apps/kuzunoha",
  plugins: [react()],
  build: {
    outDir: "../../dist/kuzunoha",
    emptyOutDir: true
  },
  server: {
    fs: {
      allow: ["../.."]
    }
  }
});
