// ── extension: popup · owner: David ──
// Reads the pending target (set by the context-menu click), runs the check via OrbisApi, and
// renders loading / verdict / error states. A plain-DOM mini version of the web VerdictCard.

const content = document.getElementById("content");
document.getElementById("settings-link").addEventListener("click", () => chrome.runtime.openOptionsPage());

// Same score→bucket thresholds as the app (verdict.js scoreBucket): >=70 safe, >=35 review, else dangerous.
const bucketOf = (score) => (score == null ? "review" : score >= 70 ? "safe" : score >= 35 ? "review" : "dangerous");
const BUCKET = {
  safe: { color: "var(--safe)", label: "Safe" },
  review: { color: "var(--review)", label: "Review" },
  dangerous: { color: "var(--danger)", label: "Dangerous" },
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
        <span class="badge" style="background:${b.color}1a;color:${b.color}">${b.label}</span>
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

const run = async () => {
  await chrome.action.setBadgeText({ text: "" }); // clear the "1" nudge if it was set
  const { pendingTarget } = await chrome.storage.session.get("pendingTarget");
  const target = pendingTarget || "";

  if (!target) {
    return render(`<p class="msg">Right-click any link or selected text and choose <b>“Check with Orbis”</b> to scan it.</p>`);
  }

  render(`<div class="spinner"></div><p class="msg" style="text-align:center">Checking this link safely in a sandbox…</p><p class="target">${esc(target)}</p>`);
  try {
    const { indicator } = await OrbisApi.checkUrl(target, (n) => {
      if (n === 3) content.querySelector(".msg").textContent = "Still scanning — this can take 20–40 seconds…";
    });
    // one-shot: clear so reopening the popup doesn't re-run a stale target
    await chrome.storage.session.remove("pendingTarget");
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
