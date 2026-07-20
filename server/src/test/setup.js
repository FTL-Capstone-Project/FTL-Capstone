// Test setup — force a hermetic env so tests never touch a real DB or Clerk.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:test@localhost:5432/test";
// Force Clerk keys EMPTY (not deleted) so requireAuth defaults to dev-stub.
// Must be empty-but-present: config/env.js runs `import "dotenv/config"`, and dotenv
// will NOT override a key already present in process.env — so setting "" here keeps
// the real keys in server/.env from leaking into the test run. Individual tests that
// exercise real Clerk flows inject their own mocks via makeRequireAuth().
process.env.CLERK_SECRET_KEY = "";
process.env.CLERK_PUBLISHABLE_KEY = "";
process.env.CLERK_WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET || "whsec_testsecret";
// Allow the dev-stub in tests (Clerk keys are intentionally empty above). Real code
// now fails closed unless this is explicitly set — tests are a legitimate opt-in.
process.env.ORBIS_DEV_STUB = "1";
