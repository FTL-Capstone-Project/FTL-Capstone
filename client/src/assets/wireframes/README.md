# Wireframe reference (design source)

The Figma wireframe export for Orbis, kept here next to `../orbo/` so all design assets live
in one place under `client/src/assets/`. These are **reference only** (not shipped/imported by
the app) — the real UI is built in `client/src/features/`. When building a screen, match it to
its wireframe here.

Organized by role, mirroring the three product experiences (see `planning/project_plan.md` §2/§4):

| Folder | Role | Screens inside |
|---|---|---|
| `Personal/` | Individual | SignIn, CreateAccount, Home (+ Chat / Pending / Report response states), Reports (+ modal overlay), Dashboard |
| `Organizational/` | Organization Member | SignIn, Home (+ Pending / Report response + safe card), Reports (+ modal overlay), Dashboard |
| `Analyst/` | Security Analyst | Dashboard, Reports (+ modal overlay), AskOrbo (+ 5 chart-building variants: Report, Stats, Dashboard, HeatMap, Campaign Stats) |
| _(top level)_ | All roles | Landing page, CreateTeam (Step 1 / Step 2), Report Response Cards (Safe / Suspicious / Danger) |

Notes:
- `Enterprise` is an empty placeholder committed alongside the export (enterprise SSO is a stretch — see the Decisions Log); no screens yet.
- Palette + tokens live in `client/src/theme/tokens.css`. A wireframe is a layout guide, not a
  pixel spec — the goal is "clearly the same design, on-brand," not pixel-identical to Figma.
- The original PDF export also lives in `planning/wireframes/Figma Wireframes PDF.pdf`.
