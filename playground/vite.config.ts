import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  server: {
    host: "0.0.0.0",
  },
  resolve: {
    alias: {
      "@lib": resolve(__dirname, "../src"),
    },
  },
  build: {
    outDir: resolve(__dirname, "../dist-playground"),
    emptyOutDir: true,
  },
  optimizeDeps: {
    exclude: ["@jsquash/webp", "@jsquash/png", "@jsquash/jpeg", "@jsquash/resize"],
  },
});
