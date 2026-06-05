import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "apps/tamamo",
  publicDir: "../../public",
  plugins: [react()],
  build: {
    outDir: "../../dist/tamamo",
    emptyOutDir: true
  },
  server: {
    fs: {
      allow: ["../.."]
    }
  }
});
