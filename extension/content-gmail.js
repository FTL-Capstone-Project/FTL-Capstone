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

// POST helper to a prescreen endpoint with auth → { level, score, reasons }. `timeoutMs` aborts a
// request that hangs (the deep email check sandbox-scans links, so it needs a long ceiling — a
// server-side budget stops well before this, but we guard the client too).
const post = async (path, payload, timeoutMs = 30_000) => {
  const { apiUrl, token } = await getConfig();
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiUrl}${path}`, { method: "POST", headers, body: JSON.stringify(payload), signal: controller.signal });
    if (!res.ok) throw Object.assign(new Error("prescreen failed"), { status: res.status });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
};

// INSTANT structural pre-check (deterministic; used by the click-guard) → { level, score, reasons }.
const prescreen = ({ sender, urls }) => post("/api/prescreen", { sender, urls });

// CONTENT-AWARE email check (reads sender + subject + body via the LLM AND sandbox-scans the links)
// for the auto-scan badge. The link sandbox is the slow leg (a fresh scan is ~10-45s), so we give
// this a long timeout (75s — just past the server's 60s link budget). If the server has no LLM key
// (503) or can't analyze (422), fall back to the instant structural check so the badge still shows
// something rather than nothing.
const analyzeEmail = async ({ sender, subject, body, urls }) => {
  try {
    return await post("/api/prescreen/email", { sender, subject, body, urls }, 75_000);
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

// A "checking" state while the content analysis runs. When the email has links, Orbo sandbox-scans
// each one (~10-45s per fresh link), so we say so + note it can take a bit — otherwise the badge
// looks frozen. Link-less emails resolve in ~1-3s (sender + body only). Uses the thinking pose;
// replaced by showEmailBadge when the verdict lands.
const showEmailChecking = (linkCount = 0) => {
  removeEmailBadge();
  const el = document.createElement("div");
  el.setAttribute("data-orbis-email-badge", "1");
  Object.assign(el.style, {
    position: "fixed", top: "72px", right: "20px", zIndex: "2147483646",
    display: "flex", alignItems: "center", gap: "10px",
    background: "#fff", color: "#1A2233", border: "1.5px solid #E2E6EC", borderRadius: "16px",
    boxShadow: "0 10px 30px rgba(10,37,64,0.18)", padding: "11px 14px", maxWidth: "300px",
    font: "13px -apple-system,Segoe UI,Roboto,sans-serif",
  });
  const deep = linkCount > 0;
  const headline = deep
    ? `Orbo is deep-scanning ${linkCount} link${linkCount > 1 ? "s" : ""}…`
    : "Orbo is checking this email…";
  const sub = deep
    ? `<div style="font-size:11px;color:#5A6675;margin-top:2px">Opening each link in a safe sandbox — this can take up to a minute.</div>`
    : "";
  el.innerHTML = `
    <img src="${asset("orbo-thinking.png")}" alt="" width="30" height="30" style="flex-shrink:0" />
    <div><div style="font-weight:700">${headline}</div>${sub}</div>`;
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
let scanInFlight = false; // true while a scan (esp. the slow deep link scan) is running
const scanOpenEmail = async () => {
  const found = readOpenEmail();
  // TRANSIENT-NULL GUARD: Gmail re-renders the message pane constantly (and even more during a long
  // deep scan), so readOpenEmail momentarily returns null mid-scan. We must NOT tear the badge down
  // on that blip — doing so cleared lastScanKey, and the next tick then treated the same email as
  // "new" and re-inserted the badge + re-scanned. THAT was the "badge going in and out" loop. Only
  // clear when a scan is NOT in flight (i.e. the user genuinely navigated away from any open email).
  if (!found) {
    if (!scanInFlight) { removeEmailBadge(); lastScanKey = ""; }
    return;
  }
  // Key on sender + subject + link set (not the whole body) — enough to tell emails apart cheaply.
  const key = `${found.sender || ""}|${found.subject || ""}|${found.urls.join(",")}`;
  if (key === lastScanKey) return;  // same email — already scanned or currently scanning
  if (scanInFlight) return;         // a scan is running; don't start a second for a transient re-read
  lastScanKey = key;
  scanInFlight = true;
  // Content analysis calls the LLM (~1-3s) AND sandbox-scans each link (~10-45s per fresh link), so
  // show a "checking" badge first — telling the user when it's the slow deep link scan so a 30-45s
  // wait doesn't look frozen. This is Orbo actually READING the email + opening its links safely.
  showEmailChecking(found.urls.length);
  try {
    const verdict = await analyzeEmail(found);
    // The deep scan can take up to a minute — the user may have opened a DIFFERENT email by the time
    // it resolves. If lastScanKey moved on, this result is stale: drop it so we don't overwrite the
    // newer email's badge (or "checking" state) with an old verdict.
    if (key !== lastScanKey) { log("stale verdict for a since-closed email — ignoring"); return; }
    log("verdict:", verdict.level, verdict.score);
    showEmailBadge(verdict); // shown for every result (safe reassures; warning/danger warns)
  } catch (err) {
    // Auto-scan is best-effort + silent on failure: a passive feature must never nag with errors.
    // (Turn on debug to see WHY — most often: no token set, or CORS/API not reachable.)
    log("email analysis failed:", err.status || "", err.message);
    // Only clear the badge/key if THIS scan is still the current one (else we'd wipe a newer email's).
    if (key === lastScanKey) { removeEmailBadge(); lastScanKey = ""; }
  } finally {
    scanInFlight = false;
    // If the user switched to a DIFFERENT email while this scan was running, that mutation was
    // ignored (scanInFlight was true), so re-check now that we're free — otherwise the newly-opened
    // email would never get scanned until some other DOM change happened to nudge the observer.
    const now = readOpenEmail();
    if (now) {
      const nowKey = `${now.sender || ""}|${now.subject || ""}|${now.urls.join(",")}`;
      if (nowKey !== lastScanKey) scheduleScan();
    }
  }
};

// Gmail is a SPA — the DOM mutates as you open/close messages. Debounce a re-scan on mutations so
// we catch a newly-opened email without hammering (the readOpenEmail dedup key prevents rescans).
let scanTimer = null;
const scheduleScan = () => {
  clearTimeout(scanTimer);
  scanTimer = setTimeout(scanOpenEmail, 400);
};
// IGNORE OUR OWN mutations: the badge lives in <body>, so inserting/removing it is itself a DOM
// mutation that would re-fire this observer in a feedback loop. Skip any batch whose every record
// is inside our badge, so only Gmail's real changes (opening/closing a message) schedule a scan.
const isOwnMutation = (records) =>
  records.every((r) => {
    const n = r.target;
    const el = n && n.nodeType === 1 ? n : n?.parentElement;
    return el ? el.closest("[data-orbis-email-badge], [data-orbis-badge]") !== null : false;
  });
const observer = new MutationObserver((records) => {
  if (isOwnMutation(records)) return;
  scheduleScan();
});
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
