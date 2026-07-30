---
description: Trace one feature end-to-end through the PERN stack, beginner-first
argument-hint: [feature or route, e.g. "the analyst verdict" or "PATCH /api/indicators/:id/review"]
---

# /explain-flow — trace it through the whole stack

I don't open my teammates' files, so I lose sight of how my slice connects to theirs. This is the
question I ask most often, encoded: **take $ARGUMENTS and trace it end-to-end.**

Use the `flow-tracer` subagent (it's read-only and built for exactly this). Follow the request the
whole way and back:

```
React component  →  client/src/lib/api.js  →  Express route  →  service  →  Prisma  →  Postgres
                 ←                        ←                 ←          ←
```

For each hop, tell me:

1. **What this piece does** on its own — the component / route / helper, in one sentence.
2. **Where the seam is** — which file hands off to which, and the exact shape of the data crossing
   that boundary (the JSON the route returns, the props the component takes).
3. **Whose code it is** — mine (reports / notifications / insights / campaigns / inbound-email /
   scoring), David's (submit + verdict AI), or Michael's (auth + schema + shell). Say explicitly
   where MY slice starts and stops.
4. **Why it's built this way** — the full-stack concept it demonstrates (state, props, an API call, a
   query, error handling) and any `planning/project_plan.md` decision behind it.

Keep it beginner-friendly and brief — plain language, short sentences. I'm learning full-stack for
the first time, and the goal is that I can explain this flow out loud to someone else afterward,
without notes.

End with a **one-paragraph plain-English summary** of the whole path, and name the single file where
a bug in this flow would most likely live.
