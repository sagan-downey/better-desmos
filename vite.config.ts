import { defineConfig } from "vitest/config";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [viteSingleFile({ outputFileName: "better-desmos.html" })],
  test: {
    include: ["src/**/*.test.ts"],
  },
});
