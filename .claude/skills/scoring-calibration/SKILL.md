---
name: scoring-calibration
description: Use when changing how Orbis scores anything (email body/sender legs, link verdict, reputation floor, combine/reconcile rules, signal weights, thresholds) or when investigating a false positive ("this safe email got flagged") or false negative ("this scam scored safe"). Enforces corpus-first measurement before any threshold is touched.
---

# Scoring calibration — measure before you tune

Owner: Ozias. This encodes the method that took Orbis email scoring from **44 false positives / 0 false
negatives** down to ~1 defensible review, without weakening real phishing detection.

## Why this skill exists

The instinct when a safe email gets flagged is to lower a threshold. That instinct is wrong, and it's
wrong in a way that hides the damage: **loosening a threshold converts today's visible false positives
into tomorrow's invisible false negatives.** A false positive is annoying and reported. A false
negative is a user getting phished and nobody filing a bug. They are not symmetric costs, so they must
not get a symmetric fix.

So: never adjust a number until you've measured the corpus and named the *mechanism*.

## The method

### 1. Measure first, on a real corpus
Do not reason about one anecdote. Run the **actual deterministic code** over a corpus of realistic
cases spanning every archetype (legit transactional, marketing, newsletters, personal, internal, plus
each phishing family: impersonation, credential harvest, payment fraud, malware attachment).

Harnesses that already exist — use them, don't rebuild:
- `scripts/verify-email-scoring.mjs` — runs the REAL pipeline (real DNS, real LLM, real backstops)
  against a corpus of messages we've actually seen. Costs real quota. `--only=<case>` to narrow.
- The unit suites mock the LLM. They prove the **wiring** is right; they can never prove a real email
  gets a sane score. Both layers are required and neither substitutes for the other.

Report the result as **two separate counts, never one accuracy number**: false positives (safe →
flagged) and false negatives (scam → safe). One number hides the direction of the error, and the
direction is the whole point.

### 2. Root-cause to mechanisms, not to cases
44 failures did not need 44 fixes — they collapsed into 3 mechanisms:

1. **A ceiling borrowed from a different context.** `NO_SIGNAL_CEILING=65` came from the *image* path,
   where sender and link genuinely can't be verified. In *email*, sender and link are separately
   scored legs, so the same ceiling made SAFE literally unreachable for clean text mail (21 cases).
2. **An uncorroborated escalation.** A "crown-jewel" ask (credentials/payment) hard-ceilinged to 20 —
   firing on ordinary transactional mail, because it could not distinguish **"we sent you a code"**
   (legit delivery) from **"give us your password at this link"** (solicitation) (18 cases).
3. **Worst-of `min` combining.** One review-band leg (a benign ESP tracking link at 52-68, an
   unknown-but-resolving sender at 65) vetoed two clean legs — conflating *unverified* with
   *suspicious* (4 cases).

Group failures by mechanism before writing any fix. If you can't name the mechanism, you don't yet
understand the bug and any threshold change is a guess.

### 3. Fix context-aware, never blunt
The fix is **not** "lower the ceiling". Each mechanism gets a fix that preserves detection:

- **Gate escalation behind corroboration.** A lone crown-jewel with a clean sender AND a safe link
  keeps its raw score. It escalates only when the body self-corroborates (a 2nd crown-jewel or a hard
  non-soft signal), or the sender leg is suspicious (< 55), or a link leg is dangerous (< 50). See
  `crownCeilingApplies` in `server/src/features/webhooks/emailAnalysis.js`.
- **Keep worst-of strict where it matters.** Any DANGEROUS leg (< 35) still dominates absolutely — a
  real scam can never read safer than its worst leg. Only a *single* marginal leg (65-69) backed by at
  least one clean leg gets rounded up. See `reconcileLegScores`.
- **Let context decide what a signal means.** A clean body is neutral in the email path (sender and
  link are scored separately) even though it's capped in the image path.

### 4. Prefer deterministic signals over asking the model
If a signal can be **computed**, never let the LLM guess it. The model was firing `link_mismatch` and
`sender_mismatch` on benign marketing mail and tanking scores to ~10. Both are provable from the
message itself:
- `detectSenderMismatch` — does the display name claim a brand its address domain doesn't own?
- `detectLinkMismatch` — does an anchor's visible text name a different registered domain than its href?
- `assessAuthResults` — DKIM/DMARC **fail** is the strongest available forgery evidence.

Strip guessable-but-unverifiable signals from what the model may return, compute them in code, and
feed them into the same deterministic scorer. **Code owns the number; prompt injection can't move it.**
Keep these as pure functions so they're unit-testable.

### 5. Ask what a security control costs honest traffic
Every new control needs this answered out loud: *what legitimate input does this now reject?*

The canonical example: **SPF is deliberately ignored** in the forged-sender check, because SPF almost
always fails on a legitimately *forwarded* email — the forwarder isn't in the original domain's SPF
record. Gating on it would have rejected nearly every real forward. Likewise, **absent headers are not
forgery**: a thin plain-text relay sends no auth headers at all, so only *positive* evidence acts.

### 6. Positive signals must be unfakeable
Orbis scoring was purely subtractive, so a legitimate-but-niche site could only lose points and never
earn trust — then its weak leg vetoed the whole verdict. A trust floor has to rest on something a
fresh scam domain **cannot fabricate**: membership in a pre-compiled popularity list (Tranco) plus a
curated allowlist — not domain age or DKIM-pass, which a brand-new phishing domain can satisfy on its
own domain.

Critically: strip **shared-hosting / shortener / UGC domains** (`bit.ly`, `pages.dev`, `github.io`,
`amazonaws.com`) from the trust layers, so `evil-phish.pages.dev` is never trusted because `pages.dev`
ranks high. Apply that denylist at **both generation time and runtime** from one shared constant
(`NEVER_REPUTABLE` in `server/src/services/reputation.js`) so the two can never drift.

## Never do these

- Change a threshold, weight, or ceiling before running the corpus.
- Report a single "accuracy" number instead of FP and FN counts separately.
- Weaken lookalike / impersonation detection — that archetype had **0 failures**, so it is load-bearing.
- Let an LLM output become a score, a query field, or an identity decision unchecked.
- Fix a false positive without stating which false negative the fix might create.

## After the change

Re-run the corpus and report the before/after as FP and FN counts side by side. Then note the **known
FN gaps still thin** and not yet failing: attachment/macro malware (weight likely too low), off-list
brand/government impersonation (list-bound by nature), zero-day clean-copy links, non-English
phishing, and plain-text forwards (no HTML or headers, so the sender leg judges the *forwarder's*
address rather than the original sender). Naming the gaps you didn't close is part of the deliverable.
