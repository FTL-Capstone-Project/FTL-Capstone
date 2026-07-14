# Orbis — Auth + Data Layer (Michael's slice)

This is the foundation that unblocks David (check-link/verdict) and Ozias (reports/notifications):
**Clerk auth + role model, the Prisma data layer, the Clerk→DB webhook sync, and the app shell.**

## What's here

### Data layer
- `src/prisma/schema.prisma` — the 7-table model from project_plan.md §5 (Organization, User,
  Submission, Indicator, OrgReview, Campaign, Notification) with FK indexes and a
  `reviewedByUser` relation (so reports can show "Scored by {analyst}").
  - **Score direction:** `aiScore` / `humanScore` are a **0–100 safety score (100 = safe)**.
- `src/prisma/seed.js` — realistic demo data (Acme Inc., an analyst/member/individual, safe +
  suspicious + dangerous indicators, submissions, two-phase reviews, a campaign, notifications).
- `src/db.js` — the shared PrismaClient.

### Auth + roles
- `src/middleware/roles.js` — **pure** role logic (no Clerk/DB). `deriveRole()` maps Clerk context
  → `individual | member | analyst`. **"admin" is not a role** — it's the Clerk `org:admin`
  permission, surfaced as `req.user.isAdmin`.
- `src/middleware/auth.js` — `requireAuth` middleware. Real mode verifies the Clerk session
  (via `clerkMiddleware()` in index.js) and **lazily creates/refreshes the mirror User row**
  (the webhook backstop, §11 Q9). Dev-stub mode (no Clerk keys) injects a fake individual so the
  team can build locally. `makeRequireAuth({...})` is exported for tests.
- `src/middleware/requireAnalyst.js` — analyst-only guard (admins pass, since admin = analyst+manage).
- `src/features/users/users.service.js` — `resolveUser`, `ensureOrganization`, and
  `applyClerkEvent` (all take a Prisma client → unit-testable with a mock).

### Clerk → DB sync (webhook)
- `src/features/webhooks/clerkEvents.js` — **pure** `mapClerkEvent()` (event → normalized action).
- `src/features/webhooks/webhooks.routes.js` — `POST /api/webhooks/clerk` verifies the svix
  signature (`CLERK_WEBHOOK_SECRET`) then applies the mapped event. Keeps Ozias's `/inbound-email` stub.

### App entry
- `src/index.js` — `createApp()` wires middleware in the right order: **raw body for the Clerk
  webhook** (svix needs it) → `express.json()` → CORS → `clerkMiddleware()` (real mode only) →
  routers → error handler. Only calls `listen()` when not under test.
- `src/config/env.js` — the one place env vars are read (loads `.env` via dotenv);
  `env.clerkEnabled` toggles real-vs-stub auth.

### Client shell (`client/src/`)
- `components/AppShell.jsx` — collapsible sidebar (toggled by the logo), **role-aware nav**
  (`config/constants.js` → `NAV_BY_ROLE`), New check / Search / RECENTS / Settings, org switcher
  (org/analyst), topbar with inbox / bell / `UserButton`.
- `lib/useOrbisRole.js` — client mirror of `deriveRole` (Clerk hooks → role + isAdmin).
- `lib/useApi.js` — binds the Clerk session token into `lib/api.js` so components never touch headers.

## Auth model (decided)
- **Individuals:** Clerk personal accounts (email/pw + Google/Apple). Self-signup, `org_id = NULL`.
- **Orgs:** Clerk Organizations. An **admin** creates the org and invites members + analysts
  (invites / domain auto-join). Members/analysts cannot self-create an org.
- **Role source of truth:** Clerk. `deriveRole` maps org:admin → analyst, other org members →
  member, no-org → individual; mirrored to `users.role`. Enterprise SSO/SAML = stretch.

## Tests
`npm -w server test` — **36 tests, no DB or live Clerk required** (Prisma is mocked; Clerk is
stubbed/injected). Covers role derivation, webhook event mapping, the user service, both guards,
`requireAuth` (stub + real-mocked), and the app routes (health, webhook signature, protected route)
via supertest.

## Running it live (needs a Postgres URL)
This environment has no local Postgres, so migrate/seed weren't run here. To go live:
1. Get a free Postgres (Neon / Supabase / Render) and put its URL in `server/.env` → `DATABASE_URL`.
2. `npm -w server exec prisma migrate dev --schema src/prisma/schema.prisma --name init`
3. `npm -w server run prisma:seed`
4. Clerk keys are already in `server/.env` (copied from your client `.env.local`). For webhooks,
   create a Clerk webhook endpoint → `…/api/webhooks/clerk`, copy its signing secret into
   `CLERK_WEBHOOK_SECRET`. Until then the app runs (dev-stub auth) and the webhook route returns 503.
5. `npm run dev` (root) starts client + server together.
