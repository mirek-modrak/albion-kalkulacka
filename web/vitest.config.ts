import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@albion/jadro": fileURLToPath(new URL("../jadro/src/index.ts", import.meta.url)),
    },
  },
  test: { globals: true, environment: "node" },
});
