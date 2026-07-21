import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Client-side test runner. Uses jsdom so React components can render in a fake
// browser, and the same @vitejs/plugin-react as dev so JSX compiles.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true, // describe/it/expect without importing them
    include: ["src/**/*.test.{js,jsx}"],
    setupFiles: ["./src/test/setup.js"],
  },
});
