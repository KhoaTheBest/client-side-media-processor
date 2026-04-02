import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  server: {
    host: "0.0.0.0",
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "FrontendAssetProcessor",
      fileName: "frontend-asset-processor",
      formats: ["es"],
    },
    rollupOptions: {
      external: ["mediabunny"],
    },
  },
  optimizeDeps: {
    exclude: ["@jsquash/webp", "@jsquash/png", "@jsquash/jpeg", "@jsquash/resize"],
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/__tests__/setup.ts"],
  },
});
