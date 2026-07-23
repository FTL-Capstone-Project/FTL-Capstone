// ── extension: popup · owner: David ──
// Reads the pending target (set by the context-menu click), runs the check via OrbisApi, and
// renders loading / verdict / error states. A plain-DOM mini version of the web VerdictCard.

const content = document.getElementById("content");
document.getElementById("settings-link").addEventListener("click", () => chrome.runtime.openOptionsPage());

// Same score→bucket thresholds as the app (verdict.js scoreBucket): >=70 safe, >=35 review, else dangerous.
const bucketOf = (score) => (score == null ? "review" : score >= 70 ? "safe" : score >= 35 ? "review" : "dangerous");
// Each verdict bucket gets its matching Orbo pose (same expressions the web app shows) so the
// popup feels like the real Orbo reacting: happy when safe, cautioning on review, stop-hand on danger.
const BUCKET = {
  safe: { color: "var(--safe)", label: "Safe", orbo: "assets/orbo-safe.png" },
  review: { color: "var(--review)", label: "Review", orbo: "assets/orbo-caution.png" },
  dangerous: { color: "var(--danger)", label: "Dangerous", orbo: "assets/orbo-danger.png" },
};
const sevColor = (s) => (s === "safe" ? "var(--safe)" : s === "dangerous" ? "var(--danger)" : "var(--review)");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const render = (html) => { content.innerHTML = html; };

const renderVerdict = (target, indicator) => {
  if (indicator.status === "error") {
    return render(`
      <p class="msg">Orbis couldn't finish checking this one.</p>
      <p class="target">${esc(target)}</p>
      <p class="msg">${esc(indicator.ai_verdict || "Please review it manually.")}</p>
      <button class="btn secondary" id="again">Try again</button>`);
  }
  const bucket = bucketOf(indicator.ai_score);
  const b = BUCKET[bucket];
  const reasons = Array.isArray(indicator.evidence) ? indicator.evidence : [];
  const tags = Array.isArray(indicator.tags) ? indicator.tags : [];

  render(`
    <div class="card" style="border-color:${b.color}55">
      <div class="card-head">
        <span class="verdict-head">
          <img class="orbo-pose" src="${b.orbo}" alt="" width="44" height="44" />
          <span class="badge" style="background:${b.color}1a;color:${b.color}">${b.label}</span>
        </span>
        <div>
          <div class="score" style="color:${b.color}">${indicator.ai_score ?? "?"}</div>
          <div class="score-label">Safety score</div>
        </div>
      </div>
      <p class="target">${esc(target)}</p>
      <p class="verdict">${esc(indicator.ai_verdict || indicator.description || "Verdict unavailable.")}</p>
      ${reasons.length ? `<div class="why-title">Why Orbo flagged this</div><ul class="reasons">${
        reasons.slice(0, 6).map((r) => `<li><span class="dot" style="background:${sevColor(r.severity)}"></span>${esc(r.text)}</li>`).join("")
      }</ul>` : ""}
      ${tags.length ? `<div class="tags">${tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
    </div>`);
};

const showError = (target, err) => {
  const needsToken = err.status === 401;
  render(`
    <p class="msg">${needsToken
      ? "You're not signed in. Paste your Orbis token in Settings, then try again."
      : esc(err.body?.error || "Something went wrong reaching Orbis.")}</p>
    ${target ? `<p class="target">${esc(target)}</p>` : ""}
    <button class="btn ${needsToken ? "" : "secondary"}" id="${needsToken ? "open-settings" : "again"}">${
      needsToken ? "Open Settings" : "Try again"}</button>`);
};

// The target we're checking, held in memory for THIS popup session. We read pendingTarget from
// storage ONCE (on first run) and clear storage immediately, so: (a) a failed/errored check can't
// leave a stale target that silently re-scans the next time the popup is opened manually, and
// (b) "Try again" retries THIS target instead of finding an empty storage and showing the idle
// screen. Kept as a module var (not storage) so retries work after storage is cleared.
let activeTarget = "";

const run = async () => {
  await chrome.action.setBadgeText({ text: "" }); // clear the "1" nudge if it was set

  // First run picks up the context-menu target from storage, then clears it immediately (one-shot).
  // Retries (the "Try again" button) reuse activeTarget without touching storage.
  if (!activeTarget) {
    const { pendingTarget } = await chrome.storage.session.get("pendingTarget");
    activeTarget = pendingTarget || "";
    if (pendingTarget) await chrome.storage.session.remove("pendingTarget");
  }
  const target = activeTarget;

  if (!target) {
    return render(`
      <div style="text-align:center">
        <img class="orbo-loading" src="assets/orbo-wave.png" alt="Orbo" width="72" height="72" />
        <p class="msg">Right-click any link, sender email, or selected text and choose <b>“Check with Orbis”</b> and I'll scan it for you.</p>
      </div>`);
  }

  // An email address gets an instant sender report; a link gets the full sandbox scan.
  const isEmail = Boolean(OrbisApi.asEmail(target));
  const checking = isEmail ? "Checking this sender…" : "Checking this link safely in a sandbox…";
  render(`
    <div style="text-align:center">
      <img class="orbo-loading" src="assets/orbo-thinking.png" alt="Orbo" width="72" height="72" />
      <div class="spinner"></div>
      <p class="msg">${checking}</p>
    </div>
    <p class="target">${esc(target)}</p>`);
  try {
    const { indicator } = await OrbisApi.checkTarget(target, (n) => {
      if (n === 3) content.querySelector(".msg").textContent = "Still scanning — this can take 20–40 seconds…";
    });
    renderVerdict(target, indicator);
  } catch (err) {
    showError(target, err);
  }
};

// Delegate the retry / settings buttons (rendered dynamically).
content.addEventListener("click", (e) => {
  if (e.target.id === "again") run();
  if (e.target.id === "open-settings") chrome.runtime.openOptionsPage();
});

run();
