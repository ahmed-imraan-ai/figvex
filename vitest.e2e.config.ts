import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

// Browser tests: build first (npm run build), then `npm run test:e2e`.
// They start `vite preview` and drive Chrome through puppeteer-core.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "node",
      include: ["tests/e2e/**/*.test.ts"],
      testTimeout: 180_000,
      hookTimeout: 120_000,
      fileParallelism: false,
    },
  }),
);
