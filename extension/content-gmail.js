// ── extension: Gmail content script · owner: David ──
// Two layers of protection inside Gmail:
//
//   1. AUTO-SCAN ON OPEN (passive, CONTENT-AWARE): when you open an email, Orbo reads the sender +
//      subject + body and runs the real content analysis (POST /api/prescreen/email — the same LLM
//      + deterministic analysis the forwarded-email pipeline uses), then shows a fixed safe /
//      warning / danger badge in the TOP-RIGHT with zero interaction. This is the guard against
//      "just clicking" phishing AND content scams: a scam whose danger is in the WORDS ("verify
//      your account now") now scores correctly, because Orbo actually reads the message. If the
//      server has no LLM key, it falls back to the instant structural check.
//   2. CLICK GUARD (active): if you click a link, we re-check that exact link with the INSTANT
//      deterministic pre-check (POST /api/prescreen, ~80ms) and block navigation behind a warning
//      if it's risky. Fast matters here (you're mid-click), so this stays structural-only.
//
// PRIVACY: the auto-scan now sends the SENDER + SUBJECT + BODY TEXT of the open email to
// /api/prescreen/email so Orbo can read it for scam signals. The body is capped in length and is
// NOT stored server-side — it's read to produce the verdict and discarded. (This is a deliberate
// change from the old link-only pre-check: reading content is what makes it catch real scams.)
// The full sandbox scan of a specific link is still one right-click away via "Check with Orbis".

const SKIP_HOSTS = new Set(["mail.google.com", "accounts.google.com"]);
// Google/Gmail INFRASTRUCTURE hosts that appear in nearly every email but aren't user-facing
// content links: image proxies + static assets. Screening these is pure noise (Gmail routes every
// image through googleusercontent). Match by suffix so all subdomains (ci3.googleusercontent.com,
// lh3.…, mail-attachment.…) are covered. NOTE: we do NOT skip google.com itself — sites.google.com
// / docs.google.com can host real phishing and must still be screened.
const SKIP_HOST_SUFFIXES = ["googleusercontent.com", "googleapis.com", "gstatic.com"];

// Read config (apiUrl, token, webUrl) — same storage the popup/options use.
const getConfig = async () => {
  const { apiUrl, token, webUrl } = await chrome.storage.sync.get(["apiUrl", "token", "webUrl"]);
  return {
    apiUrl: (apiUrl || "http://localhost:3001").replace(/\/$/, ""),
    token: token || "",
    webUrl: (webUrl || "").replace(/\/$/, ""),
  };
};

// Should we screen this link? External http(s) only; skip Gmail's own chrome, Google infra
// (image proxies/static), and mailto/anchors.
const shouldScreen = (a) => {
  const href = a.href || "";
  if (!/^https?:\/\//i.test(href)) return false;
  try {
    const host = new URL(href).hostname.toLowerCase();
    if (SKIP_HOSTS.has(host)) return false;
    if (SKIP_HOST_SUFFIXES.some((s) => host === s || host.endsWith("." + s))) return false;
    return true;
  } catch { return false; }
};

// POST helper to a prescreen endpoint with auth → { level, score, reasons }.
const post = async (path, payload) => {
  const { apiUrl, token } = await getConfig();
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${apiUrl}${path}`, { method: "POST", headers, body: JSON.stringify(payload) });
  if (!res.ok) throw Object.assign(new Error("prescreen failed"), { status: res.status });
  return res.json();
};

// INSTANT structural pre-check (deterministic; used by the click-guard) → { level, score, reasons }.
const prescreen = ({ sender, urls }) => post("/api/prescreen", { sender, urls });

// CONTENT-AWARE email check (reads sender + subject + body via the LLM) for the auto-scan badge.
// If the server has no LLM key (503) or can't analyze (422), fall back to the instant structural
// check so the badge still shows something rather than nothing.
const analyzeEmail = async ({ sender, subject, body, urls }) => {
  try {
    return await post("/api/prescreen/email", { sender, subject, body });
  } catch (err) {
    if (err.status === 503 || err.status === 422) {
      log("content analysis unavailable (", err.status, ") → falling back to instant check");
      return prescreen({ sender, urls });
    }
    throw err;
  }
};

const LEVELS = {
  safe:      { color: "#198038", bg: "#E6F4EA", label: "Looks safe",  pose: "orbo-safe.png" },
  warning:   { color: "#B28600", bg: "#FCF3D6", label: "Be careful",  pose: "orbo-caution.png" },
  dangerous: { color: "#DA1E28", bg: "#FBE7E8", label: "Dangerous",   pose: "orbo-danger.png" },
};

const escapeHtml = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const asset = (name) => chrome.runtime.getURL(`assets/${name}`);

// ── Layer 1: the fixed top-right "email verdict" badge (auto-scan on open) ─────────────────────
let emailBadge = null;
const removeEmailBadge = () => { emailBadge?.remove(); emailBadge = null; };

// A brief "Orbo is reading this email" state while the content analysis runs (it's an LLM call,
// ~1-3s). Uses the thinking pose. Replaced by showEmailBadge when the verdict lands.
const showEmailChecking = () => {
  removeEmailBadge();
  const el = document.createElement("div");
  el.setAttribute("data-orbis-email-badge", "1");
  Object.assign(el.style, {
    position: "fixed", top: "72px", right: "20px", zIndex: "2147483646",
    display: "flex", alignItems: "center", gap: "10px",
    background: "#fff", color: "#1A2233", border: "1.5px solid #E2E6EC", borderRadius: "16px",
    boxShadow: "0 10px 30px rgba(10,37,64,0.18)", padding: "11px 14px",
    font: "13px -apple-system,Segoe UI,Roboto,sans-serif",
  });
  el.innerHTML = `
    <img src="${asset("orbo-thinking.png")}" alt="" width="30" height="30" style="flex-shrink:0" />
    <div style="font-weight:700">Orbo is checking this email…</div>`;
  document.body.appendChild(el);
  emailBadge = el;
};

// Render (or replace) the fixed top-right badge. Collapsed = a pill (Orbo + level); clicking it
// expands the reasons. Sits in the empty top-right space above the message, never over content.
const showEmailBadge = (verdict) => {
  removeEmailBadge();
  const lvl = LEVELS[verdict.level] || LEVELS.warning;
  const reasons = (verdict.reasons || []).slice(0, 4);

  const el = document.createElement("div");
  el.setAttribute("data-orbis-email-badge", "1");
  Object.assign(el.style, {
    position: "fixed", top: "72px", right: "20px", zIndex: "2147483646",
    width: "300px", background: "#fff", color: "#1A2233",
    border: `1.5px solid ${lvl.color}`, borderRadius: "16px",
    boxShadow: "0 10px 30px rgba(10,37,64,0.18)",
    font: "13px -apple-system,Segoe UI,Roboto,sans-serif", overflow: "hidden",
  });
  el.innerHTML = `
    <div data-orbis-head style="display:flex;align-items:center;gap:10px;padding:11px 14px;cursor:pointer;background:${lvl.bg}">
      <img src="${asset(lvl.pose)}" alt="" width="34" height="34" style="flex-shrink:0" />
      <div style="flex:1;min-width:0">
        <div style="font-weight:800;color:${lvl.color};font-size:14px">${lvl.label}</div>
        <div style="font-size:11px;color:#5A6675">Orbo checked this email${verdict.score != null ? ` · ${verdict.score}/100` : ""}</div>
      </div>
      <span data-orbis-caret style="color:${lvl.color};font-weight:800;transform:rotate(0deg);transition:transform .15s">⌄</span>
      <button data-orbis-email-close aria-label="Dismiss" style="background:transparent;border:none;color:#5A6675;cursor:pointer;font-size:16px;line-height:1;padding:0 2px">×</button>
    </div>
    <div data-orbis-body style="display:none;padding:12px 14px;border-top:1px solid #E2E6EC">
      ${reasons.length
        ? `<ul style="margin:0;padding-left:16px;line-height:1.5">${reasons.map((r) => `<li style="margin:4px 0">${escapeHtml(r.text)}</li>`).join("")}</ul>`
        : `<p style="margin:0;color:#5A6675;line-height:1.5">No obvious red flags in the sender or links. This is a quick check, not a full scan — right-click a link and choose “Check with Orbis” for the deep scan.</p>`}
    </div>`;
  document.body.appendChild(el);
  emailBadge = el;

  const body = el.querySelector("[data-orbis-body]");
  const caret = el.querySelector("[data-orbis-caret]");
  el.querySelector("[data-orbis-head]").addEventListener("click", (e) => {
    if (e.target.closest("[data-orbis-email-close]")) return;
    const open = body.style.display === "none";
    body.style.display = open ? "block" : "none";
    caret.style.transform = open ? "rotate(180deg)" : "rotate(0deg)";
  });
  el.querySelector("[data-orbis-email-close]").addEventListener("click", removeEmailBadge);
};

// Pull the sender address + link URLs out of the currently-open email. Gmail's DOM is volatile, so
// we lean on the STABLE bits: the message body is `.a3s` (Gmail's long-standing body class), and
// the sender sits in an [email="..."] attribute. Returns null if no message is open. Set
// localStorage["orbis-debug"]="1" in Gmail to log what it finds (helps when Gmail's DOM shifts).
const DEBUG = () => { try { return localStorage.getItem("orbis-debug") === "1"; } catch { return false; } };
const log = (...a) => { if (DEBUG()) console.log("[Orbis]", ...a); };

const readOpenEmail = () => {
  // The open message body. `.a3s` is the most stable marker Gmail uses for a rendered message body.
  // A conversation can have several; the LAST visible one is the currently-expanded message.
  const bodies = [...document.querySelectorAll(".a3s")].filter((el) => el.offsetParent !== null);
  const body = bodies[bodies.length - 1] || null;
  if (!body) { log("no open message body (.a3s) found"); return null; }

  // Sender: `.gD` is Gmail's FROM-name element and carries the sender's [email]. We must NOT fall
  // back to a bare [email] — recipient chips ("to me" = your own address) also carry [email], and
  // if we grabbed yours, a personal @gmail account would make EVERY email warn "free webmail" (60).
  // So scope strictly to the from-line: the sender .gD nearest the open message body, else the
  // first .gD on the page (single-message view). No generic [email] fallback.
  const scope = body.closest('[role="listitem"]') || document;
  const senderEl = scope.querySelector(".gD[email]") || document.querySelector(".gD[email]");
  const sender = senderEl?.getAttribute("email") || null;

  // Links in the message body only.
  const urls = [...body.querySelectorAll("a[href]")].filter(shouldScreen).map((a) => a.href);

  // Subject (the open thread's heading) + the body's visible TEXT — this is what lets the server
  // READ the email for content scams (urgency, credential requests) instead of only structure.
  // Cap the body so we don't ship a huge newsletter; the server caps again.
  const subject = document.querySelector("h2.hP")?.textContent?.trim() || "";
  const text = (body.innerText || body.textContent || "").trim().slice(0, 4000);

  log("scan → sender:", sender, "| links:", urls.length, "| subject:", subject.slice(0, 40), "| body chars:", text.length);
  if (!sender && urls.length === 0 && !text) return null;
  return { sender, subject, body: text, urls: [...new Set(urls)].slice(0, 20) };
};

// A stable signature of "which email is open" so we don't re-scan the same one on every DOM tick.
let lastScanKey = "";
const scanOpenEmail = async () => {
  const found = readOpenEmail();
  if (!found) { removeEmailBadge(); lastScanKey = ""; return; }
  // Key on sender + subject + link set (not the whole body) — enough to tell emails apart cheaply.
  const key = `${found.sender || ""}|${found.subject || ""}|${found.urls.join(",")}`;
  if (key === lastScanKey) return; // same email already scanned
  lastScanKey = key;
  // Content analysis calls the LLM (~1-3s), so show a "checking" badge first so the user knows it's
  // working — this is Orbo actually READING the email, not the instant structural glance.
  showEmailChecking();
  try {
    const verdict = await analyzeEmail(found);
    log("verdict:", verdict.level, verdict.score);
    showEmailBadge(verdict); // shown for every result (safe reassures; warning/danger warns)
  } catch (err) {
    // Auto-scan is best-effort + silent on failure: a passive feature must never nag with errors.
    // (Turn on debug to see WHY — most often: no token set, or CORS/API not reachable.)
    log("email analysis failed:", err.status || "", err.message);
    removeEmailBadge();
    lastScanKey = "";
  }
};

// Gmail is a SPA — the DOM mutates as you open/close messages. Debounce a re-scan on mutations so
// we catch a newly-opened email without hammering (the readOpenEmail dedup key prevents rescans).
let scanTimer = null;
const scheduleScan = () => {
  clearTimeout(scanTimer);
  scanTimer = setTimeout(scanOpenEmail, 400);
};
const observer = new MutationObserver(scheduleScan);
observer.observe(document.body, { childList: true, subtree: true });
log("content script loaded — watching for opened emails");
scheduleScan(); // initial

// ── Layer 2: click guard (unchanged behavior — block a risky link at click time) ───────────────
let clickBadge = null;
const removeClickBadge = () => { clickBadge?.remove(); clickBadge = null; };

const showClickBadge = async (url, verdict, x, y) => {
  removeClickBadge();
  const { apiUrl, webUrl } = await getConfig();
  const lvl = LEVELS[verdict.level] || LEVELS.warning;
  const clientUrl = webUrl || apiUrl.replace(":3001", ":5173");
  const seeWhy = `${clientUrl}/ask-orbo?check=${encodeURIComponent(url)}`;

  const el = document.createElement("div");
  el.setAttribute("data-orbis-badge", "1");
  Object.assign(el.style, {
    position: "fixed", zIndex: "2147483647",
    left: Math.min(x, window.innerWidth - 320) + "px",
    top: Math.min(y + 12, window.innerHeight - 170) + "px",
    width: "300px", background: "#fff", color: "#1A2233",
    border: `1.5px solid ${lvl.color}`, borderRadius: "16px",
    boxShadow: "0 10px 30px rgba(10,37,64,0.2)", padding: "14px",
    font: "13px -apple-system,Segoe UI,Roboto,sans-serif", lineHeight: "1.45",
  });
  const reasonsHtml = (verdict.reasons || []).slice(0, 3)
    .map((r) => `<li style="margin:3px 0">${escapeHtml(r.text)}</li>`).join("");
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px">
      <img src="${asset(lvl.pose)}" alt="" width="34" height="34" style="flex-shrink:0" />
      <b style="flex:1;color:${lvl.color};font-size:14px">${lvl.label}</b>
      <span style="font-weight:800;color:${lvl.color}">${verdict.score ?? ""}</span>
    </div>
    <div style="color:#5A6675;font-size:11px;word-break:break-all;margin:8px 0 6px">${escapeHtml(url)}</div>
    ${reasonsHtml ? `<ul style="margin:6px 0;padding-left:16px">${reasonsHtml}</ul>` : ""}
    <div style="display:flex;gap:8px;margin-top:10px">
      <a href="${seeWhy}" target="_blank" rel="noopener"
         style="flex:1;text-align:center;background:#0F62FE;color:#fff;text-decoration:none;padding:8px 0;border-radius:10px;font-weight:700">See why</a>
      <button data-orbis-open style="flex:1;background:transparent;border:1.5px solid ${lvl.color};color:${lvl.color};border-radius:10px;font-weight:700;cursor:pointer">Open anyway</button>
      <button data-orbis-close style="background:transparent;border:none;color:#5A6675;cursor:pointer;font-size:16px">×</button>
    </div>`;
  document.body.appendChild(el);
  clickBadge = el;
  el.querySelector("[data-orbis-close]").addEventListener("click", removeClickBadge);
  el.querySelector("[data-orbis-open]").addEventListener("click", () => { removeClickBadge(); window.open(url, "_blank", "noopener"); });
};

const proceedTo = (url) => { window.location.assign(url); };

const onLinkClick = async (e) => {
  if (e.target.closest?.("[data-orbis-badge]")) return; // don't re-screen our own badge's links
  const a = e.target.closest?.("a[href]");
  if (!a || !shouldScreen(a)) return;
  if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return; // native for modified clicks

  const url = a.href;
  e.preventDefault();
  e.stopPropagation();
  const { clientX: x, clientY: y } = e;
  try {
    const verdict = await prescreen({ urls: [url] });
    if (verdict.level === "safe") proceedTo(url);
    else showClickBadge(url, verdict, x, y);
  } catch {
    proceedTo(url); // fail open — never trap a click behind a broken check
  }
};

document.addEventListener("click", onLinkClick, true);
document.addEventListener("auxclick", onLinkClick, true);

// Dismiss the CLICK badge on Escape / outside click (the top-right email badge stays until closed).
document.addEventListener("keydown", (e) => { if (e.key === "Escape") removeClickBadge(); });
document.addEventListener("click", (e) => { if (clickBadge && !e.target.closest("[data-orbis-badge]")) removeClickBadge(); });
