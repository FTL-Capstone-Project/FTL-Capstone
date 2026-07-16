# Team code style — keep it consistent across all of us

This file is shared (committed to git under `.claude/rules/`), so every teammate's Claude Code
session loads it automatically. The goal: Michael, David, and Ozias all write in one voice, so the
codebase reads like it was written by one person and merges stay clean.

**Rule of thumb:** match the surrounding code. These conventions describe what the codebase already
does — when in doubt, open a neighboring file and copy its style rather than inventing a new one.

## JavaScript

- **Arrow functions, always.** Use `const name = (args) => { ... }`, never the `function` keyword —
  not for helpers, not for React components, not for route handlers. (The whole project is arrow-only.)
  - React component: `const Foo = (props) => { ... }` then `export default Foo;` at the bottom.
  - Exported helper: `export const doThing = (x) => { ... }`.
  - Reminder: arrow consts are **not hoisted**, so define a helper *above* the code that calls it.
- **`async`/`await`** for anything asynchronous (DB calls, fetches). Avoid `.then()` chains.
- **Double quotes** for strings.
- **Include the file extension in imports** — `import x from "./thing.js"` / `"./Thing.jsx"` (this is
  an ESM project; extensionless imports break at runtime).
- **Meaningful, plain-English names.** Single letters only for short loop counters / tiny callbacks.

## Comments

- Write comments in **plain English**, aimed at a beginner full-stack student.
- Explain the **why** and any gotchas — not a restatement of what the line obviously does.
- Keep them short. Prefer a clear name over a comment that explains a bad one.
- Every feature file starts with a one-line owner header, e.g. `// ── feature: reports · owner: Ozias ──`.

## Backend (Express + Prisma)

- Organize by feature folder: `server/src/features/<name>/` with `*.routes.js` + `*.service.js`.
- Use correct HTTP status codes: 200 GET, 201 create, 400 bad request, 404 not found, 500 server error.
- Use Prisma (parameterized) queries — never build SQL by concatenating user input.
- Don't leak internal error details to the client; log server-side, return a safe message.

## Frontend (React)

- Function-as-arrow components only; one component per file where reasonable.
- **Real icons, never emojis** in the UI — use `lucide-react` (`import { Bell } from "lucide-react"`).
  Emojis are fine in code comments, never rendered on screen.
- Check the wireframe in `client/src/assets/wireframes/` before building a screen.
- Forms: call `event.preventDefault()` on submit.

## Working together (avoid merge pain)

- Make the **smallest reasonable change**; don't rewrite whole files or reformat code you aren't editing.
- Before touching a shared seam (a field name, an API response shape, a shared component), check
  teammates' branches (`git fetch --all`, `git branch -r`) and adopt what they've already named.
- `git pull` before you start and before you push, so `main` doesn't drift under you.

## No lint/format tooling yet

There's no ESLint or Prettier in the repo, so these conventions are enforced by habit + review, not
automatically. If we ever add Prettier, it should be configured to match the above (double quotes,
arrow style) so it doesn't churn existing files.
