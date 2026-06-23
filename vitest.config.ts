import path from "node:path";
import { fileURLToPath } from "node:url";

import { configDefaults, defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "jsdom",
    exclude: [...configDefaults.exclude, "tests/smoke/**"],
    globals: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(dirname, "src"),
    },
  },
});
