import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["__tests__/**/*.test.ts", "__tests__/**/*.spec.ts"],
    coverage: {
      reporter: ["text", "json", "html"],
      include: ["lib/modules/**", "lib/backupPayload.ts", "lib/featureFlags.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
