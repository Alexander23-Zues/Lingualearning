import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from '@tailwindcss/vite';
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    cssMinify: false,
    sourcemap: false,
    manifest: true,
    rolldownOptions: { input: { index: resolve("index.html"), offline: resolve("offline.html"), adventure: resolve('adventure-preview.html') } },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.js"],
    restoreMocks: true,
  },
});
