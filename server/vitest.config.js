import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.js"],
    // Tests run with no live DB/Clerk; env is forced in setup.
    setupFiles: ["./src/test/setup.js"],
  },
});
