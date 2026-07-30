---
description: Pre-push gate — rebase on origin/main, run both suites, stage only my files, FF-merge
---

# /ship — the pre-push gate

The repeat workflow I ran by hand on every one of my ~70 commits, encoded once. My CLAUDE.md gives
standing authorization to push and fast-forward-merge to `main`, but only behind five guardrails.
Doing those from memory every time is exactly how a teammate's file gets swept into my commit, or a
red suite lands on `main`. This makes the guardrails mechanical instead of remembered.

Run through these IN ORDER. **Stop and report at the first failure — never push red, never force.**

## 1. Don't let `main` drift under me
```
git fetch --all
git log --oneline origin/main -3
```
Report whether my branch is behind. If it is, rebase onto `origin/main` (not merge — I want a clean
fast-forward at the end, and a merge commit makes that impossible).

## 2. Both suites green
```
npm -w server test
npm -w client test
```
Report the pass counts for each. **If anything fails, stop here and tell me** — do not stage, do not
push. Note: the server suite has one known intermittent timing test; if the ONLY failure is that one,
say so explicitly and re-run to confirm, rather than silently treating it as green.

## 3. Stage ONLY my files
```
git status --short
```
List every changed path and say who owns it (mine = reports / notifications / insights / campaigns /
webhooks-inbound-email / reputation / verdict scoring; David = submissions, indicators-submit, llm;
Michael = auth, roles, schema, seed, Clerk webhook).

Stage by **explicit path only**. Never `git add -A`, never `git add .` — a concurrent session or a
teammate's uncommitted work must not ride along in my commit. If any file is ambiguous, ask before
staging it.

## 4. Shared-seam check
If the diff touches a **field name, an API response shape, or a shared component**, run the
`merge-guard` subagent first and report what it found. Adopting a teammate's existing name now is
free; reconciling at merge time is not.

## 5. Commit + fast-forward merge
Write a commit message in my usual style: a plain-English subject describing the BEHAVIOR change (not
the files), then a body explaining *why* and the test counts. End with the Co-Authored-By trailer.

Merge to `main` **only as a clean fast-forward**. If it can't fast-forward cleanly, stop and tell me —
never force, never create a merge commit.

## 6. Tell me what landed
The commit SHAs, a one-line summary each, and the final test counts.
