import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules/**", ".next/**", "e2e/**"],
    coverage: {
      provider: "v8",
      include: [
        "app/api/**/*.ts",
        "lib/**/*.ts"
      ],
      exclude: [
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/*.d.ts",
        "e2e/**",
        "types/**",
        ".next/**"
      ],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 75,
        branches: 75
      }
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./")
    }
  }
});
