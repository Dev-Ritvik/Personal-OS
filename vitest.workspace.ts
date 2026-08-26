import { defineWorkspace } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const alias = { "@": path.resolve(root, "./src") };

export default defineWorkspace([
  {
    test: {
      name: "unit",
      environment: "node",
      include: ["src/**/*.test.ts"],
    },
    resolve: { alias },
  },
  {
    test: {
      name: "integration",
      environment: "node",
      include: ["tests/integration/**/*.test.ts"],
      setupFiles: ["tests/integration/setup-env.ts"],
      testTimeout: 30_000,
      hookTimeout: 90_000,
      pool: "forks",
      poolOptions: { forks: { singleFork: true } },
    },
    resolve: { alias },
  },
]);
