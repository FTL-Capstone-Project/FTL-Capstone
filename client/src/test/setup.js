// Runs once before the client test suite (see vitest.config.js setupFiles).
// Adds friendly DOM matchers (toBeInTheDocument, toHaveTextContent, ...) and
// clears localStorage between tests so the conversations store starts empty.
import "@testing-library/jest-dom";
import { afterEach, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";

beforeEach(() => {
  localStorage.clear();
});

// Unmount anything a test rendered so components don't leak between tests.
afterEach(() => {
  cleanup();
});
