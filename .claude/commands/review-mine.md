---
description: The REVIEW step of plan-execute-review — audit my working diff before I ship it
---

# /review-mine — close the loop

Plan mode covers *plan*. The validation-loop hook covers *execute* (tests run on every edit). This is
the **review** step, which I was doing ad-hoc and inconsistently. Encoding it means the loop actually
closes every time instead of when I remember.

Review **only my working diff** (`git diff` + `git diff --staged`), not the whole repo. Go in this
order and report findings most-severe first.

## 1. Correctness — does it do what I said it does?
Read the diff against its stated intent. Look specifically for:
- A **comment that lies** — claims behavior the code doesn't have. I have actually shipped this bug
  (a CSS-escaping comment that claimed to escape `(`, `)`, `'` when `encodeURIComponent` leaves them
  alone), so it is a real failure mode for me, not a hypothetical.
- Off-by-one / wrong-window date maths — my insights charts count "this week", and I've gotten the
  week boundary wrong before. UTC everywhere.
- A new code path with **no test**.

## 2. The security posture I hold myself to
- **The LLM proposes; code decides.** If this diff lets a model output reach a number, a query field,
  or an identity decision without passing a whitelist or a deterministic check, flag it. Prompt
  injection must not be able to move a score.
- **A `From` header is a claim, not identity.** Any new trust in unverified email headers gets flagged.
- **No server-side fetch of a user-submitted URL** without an exact hostname allowlist — that's
  instant SSRF (localhost, 169.254.169.254, internal IPs).
- Prisma queries stay parameterized; no string-concatenated SQL.
- No internal error details leaked to the client.

## 3. False-positive cost — the question I keep having to re-learn
If this diff changes **scoring or a security control**, answer explicitly: *what legitimate input does
this now flag that it didn't before?* My scorer once had 44 false positives and 0 false negatives, so
over-flagging is my known bias. A new control that rejects honest traffic is a regression even when
the security logic is right. Say which direction the error moved.

## 4. Team style (from .claude/rules/code-style.md)
Arrow functions only, double quotes, file extensions in imports, real `lucide-react` icons never
emojis, `event.preventDefault()` on form submits, feature-folder layout, correct status codes
(200/201/400/404/500), one-line owner header on new feature files.

## 5. Smallest-reasonable-change
Flag anything I rewrote or reformatted that I didn't need to touch — that's merge pain for Michael and
David.

## Output
For each finding: the file:line, one sentence on the defect, and a concrete failure scenario (inputs →
wrong result). Then a **verdict: ship / fix first**. If it's clean, say so plainly — don't invent
findings to look thorough.
