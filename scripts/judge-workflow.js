export const meta = {
  name: 'email-report-judge',
  description: 'Blind 2-judge panel over Orbis email reports; flag judge/label disagreements for adjudication',
  phases: [
    { title: 'Judge', detail: 'two independent judges rate each report, blind to the ground-truth label' },
    { title: 'Reconcile', detail: 'flag disagreements (judge-vs-judge, judge-vs-label) for manual review' },
  ],
}

// args = the tier1-results.json array (passed in verbatim by the invoker).
const REPORTS = Array.isArray(args) ? args : (args && Array.isArray(args.results) ? args.results : [])
if (!REPORTS.length) { log('no reports passed in args — nothing to judge'); return { error: 'no reports' } }

const VERDICT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['verdictLevel', 'reasonsAccurate', 'reasonsContradict', 'usefulForUser', 'hallucination', 'notes'],
  properties: {
    verdictLevel: { type: 'string', enum: ['SAFE', 'REVIEW', 'DANGER'], description: 'the level YOU (judge) think this email deserves, from the email + report alone' },
    reasonsAccurate: { type: 'boolean', description: 'do the report’s "why" rows accurately describe THIS email?' },
    reasonsContradict: { type: 'boolean', description: 'do any rows contradict each other or the headline verdict?' },
    usefulForUser: { type: 'boolean', description: 'would this report actually help a non-expert decide what to do?' },
    hallucination: { type: 'boolean', description: 'does the report claim something not supported by the email (invented link, wrong brand, etc.)?' },
    notes: { type: 'string', description: 'one brutally-honest sentence: the single biggest problem with this report, or "solid" if none' },
  },
}

// A judge sees the EMAIL and the REPORT — never the ground-truth label or the leg scores. It decides
// the level itself, so a judge-vs-label disagreement is a real signal (not the judge parroting us).
const judgePrompt = (r, lens) => `You are a skeptical phishing-triage reviewer. ${lens}
You are shown a forwarded email and the automated safety report a tool produced for it. Judge the REPORT on its merits — you do NOT know the "correct" answer, so decide for yourself what level the email deserves and whether the report is accurate and useful.

EMAIL (as the user forwarded it):
${(r.emailPreview || '(email text not included)').slice(0, 2500)}

THE TOOL'S REPORT:
- Verdict level shown to user: ${r.got} (safety score ${r.score}/100; 100=safe)
- Title: ${r.title}
- Plain-English verdict: ${r.verdict}
- Confidence: ${r.confidence}
- "Why" rows: ${JSON.stringify(r.evidence)}

Rate it. Be blunt — this feeds a false-positive/false-negative audit, so do not be charitable.`

phase('Judge')
const LENSES = {
  correctness: 'Focus on whether the VERDICT LEVEL is right — would a security expert agree an ordinary user should treat it this way?',
  usefulness: 'Focus on whether a NON-EXPERT (a student, a retiree) could actually act on this report — is the "why" clear, specific, and non-contradictory?',
}

const judged = await pipeline(
  REPORTS,
  // Stage 1: two independent judges per report, concurrently.
  (r, orig, i) => parallel([
    () => agent(judgePrompt(r, LENSES.correctness), { label: `judge-c:${r.id}`, phase: 'Judge', schema: VERDICT_SCHEMA }),
    () => agent(judgePrompt(r, LENSES.usefulness), { label: `judge-u:${r.id}`, phase: 'Judge', schema: VERDICT_SCHEMA }),
  ]).then((votes) => ({ r, votes: votes.filter(Boolean) })),
  // Stage 2: reconcile — flag anything worth a human look.
  ({ r, votes }) => {
    if (!votes.length) return { id: r.id, flagged: true, reason: 'both judges failed', r }
    const levels = votes.map((v) => v.verdictLevel)
    const judgeDisagree = new Set(levels).size > 1
    const vsLabel = votes.filter((v) => v.verdictLevel !== r.expect).length // judges disagreeing with our ground truth
    const quality = votes.some((v) => !v.reasonsAccurate || v.reasonsContradict || v.hallucination || !v.usefulForUser)
    const gotWrong = r.got !== r.expect
    const flagged = judgeDisagree || vsLabel >= 1 || quality || gotWrong
    return {
      id: r.id, persona: r.persona, archetype: r.archetype,
      expect: r.expect, got: r.got, score: r.score,
      judgeLevels: levels, judgeDisagree, judgesVsLabel: vsLabel,
      qualityIssue: quality, gotWrong, flagged,
      notes: votes.map((v) => v.notes),
      votes,
    }
  }
)

phase('Reconcile')
const clean = judged.filter(Boolean)
const flagged = clean.filter((j) => j.flagged)
log(`judged ${clean.length} reports; ${flagged.length} flagged for adjudication`)
return {
  total: clean.length,
  flaggedCount: flagged.length,
  // Report-quality tallies across the whole corpus.
  gotWrong: clean.filter((j) => j.gotWrong).length,
  judgeDisagreements: clean.filter((j) => j.judgeDisagree).length,
  qualityIssues: clean.filter((j) => j.qualityIssue).length,
  flagged, // full detail for the ones needing my eyes
  all: clean,
}
