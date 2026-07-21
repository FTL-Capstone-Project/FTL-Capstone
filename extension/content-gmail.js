// ── extension: Gmail content script · owner: David ──
// Injected into mail.google.com. Intercepts clicks on links INSIDE an open email, runs an instant
// deterministic pre-check (POST /api/prescreen — no slow scan), and shows an inline Orbo badge
// with the verdict BEFORE the browser navigates. "See why" deep-links to the Orbis web app for the
// full report. This is the "before you interact" moment, scoped to the actual danger: the click.
//
// Why click-interception (not full on-open DOM parsing): Gmail's DOM is obfuscated and volatile;
// parsing "the email that just opened" is brittle. A link click gives us the exact href reliably,
// and the click IS the risky action — so we guard it directly. (On-open parsing is a later v2.)
//
// PRIVACY: we send ONLY the link's hostname-bearing URL to /api/prescreen — never email content.

const WEBMAIL_HOSTS = /(^|\.)(mail\.google|google)\.com$/i; // don't screen Gmail's own chrome links

// Read config (apiUrl, token) — same storage the popup/options use.
const getConfig = async () => {
  const { apiUrl, token } = await chrome.storage.sync.get(["apiUrl", "token"]);
  return { apiUrl: (apiUrl || "http://localhost:3001").replace(/\/$/, ""), token: token || "" };
};

// Is this a link we should screen? Real external http(s) links in the message body — skip Gmail's
// own UI links, anchors, mailto:, and same-host navigation.
const shouldScreen = (a) => {
  const href = a.href || "";
  if (!/^https?:\/\//i.test(href)) return false;
  try {
    const host = new URL(href).hostname;
    if (WEBMAIL_HOSTS.test(host)) return false;
    return true;
  } catch { return false; }
};

// Call the instant pre-check.
const prescreen = async (url) => {
  const { apiUrl, token } = await getConfig();
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${apiUrl}/api/prescreen`, {
    method: "POST", headers, body: JSON.stringify({ urls: [url] }),
  });
  if (!res.ok) throw Object.assign(new Error("prescreen failed"), { status: res.status });
  return res.json(); // { level, score, reasons }
};

const LEVELS = {
  safe:      { color: "#198038", label: "Looks safe",  emoji: "" },
  warning:   { color: "#B28600", label: "Be careful",  emoji: "" },
  dangerous: { color: "#DA1E28", label: "Dangerous",   emoji: "" },
};

let activeBadge = null;
const removeBadge = () => { activeBadge?.remove(); activeBadge = null; };

// Render the inline verdict badge near the click point. Returns nothing; wires its own buttons.
const showBadge = async (url, verdict, x, y) => {
  removeBadge();
  const { apiUrl } = await getConfig();
  const lvl = LEVELS[verdict.level] || LEVELS.warning;
  const clientUrl = apiUrl.replace(":3001", ":5173"); // dev: API 3001 → Vite client 5173
  const seeWhy = `${clientUrl}/ask-orbo?check=${encodeURIComponent(url)}`;

  const el = document.createElement("div");
  el.setAttribute("data-orbis-badge", "1");
  Object.assign(el.style, {
    position: "fixed", zIndex: 2147483647,
    left: Math.min(x, window.innerWidth - 320) + "px",
    top: Math.min(y + 12, window.innerHeight - 160) + "px",
    width: "300px", background: "#fff", color: "#1A2233",
    border: `2px solid ${lvl.color}`, borderRadius: "12px",
    boxShadow: "0 8px 28px rgba(10,37,64,0.22)", padding: "12px 14px",
    font: "13px -apple-system,Segoe UI,Roboto,sans-serif", lineHeight: "1.45",
  });
  const reasonsHtml = (verdict.reasons || []).slice(0, 3)
    .map((r) => `<li style="margin:3px 0">${escapeHtml(r.text)}</li>`).join("");
  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
      <b style="color:${lvl.color};font-size:14px">Orbo — ${lvl.label}</b>
      <span style="font-weight:800;color:${lvl.color}">${verdict.score ?? ""}</span>
    </div>
    <div style="color:#5A6675;font-size:11px;word-break:break-all;margin:4px 0 6px">${escapeHtml(url)}</div>
    ${reasonsHtml ? `<ul style="margin:6px 0;padding-left:16px;color:#1A2233">${reasonsHtml}</ul>` : ""}
    <div style="display:flex;gap:8px;margin-top:8px">
      <a href="${seeWhy}" target="_blank" rel="noopener"
         style="flex:1;text-align:center;background:#0F62FE;color:#fff;text-decoration:none;padding:7px 0;border-radius:9px;font-weight:700">See why</a>
      <button data-orbis-open style="flex:1;background:transparent;border:1.5px solid ${lvl.color};color:${lvl.color};border-radius:9px;font-weight:700;cursor:pointer">Open anyway</button>
      <button data-orbis-close style="background:transparent;border:none;color:#5A6675;cursor:pointer;font-size:16px">×</button>
    </div>`;
  document.body.appendChild(el);
  activeBadge = el;

  el.querySelector("[data-orbis-close]").addEventListener("click", removeBadge);
  el.querySelector("[data-orbis-open]").addEventListener("click", () => { removeBadge(); window.open(url, "_blank", "noopener"); });
};

const escapeHtml = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Capture-phase click handler: intercept BEFORE Gmail's own handler navigates. For a dangerous/
// warning link we block navigation and show the badge; safe links are let through untouched
// (with a brief non-blocking "safe" flash could be added later — for now we don't nag on safe).
document.addEventListener("click", async (e) => {
  const a = e.target.closest?.("a[href]");
  if (!a || !shouldScreen(a)) return;
  const url = a.href;

  // Hold the click: prevent the default open until we have a verdict.
  e.preventDefault();
  e.stopPropagation();
  const { clientX: x, clientY: y } = e;

  try {
    const verdict = await prescreen(url);
    if (verdict.level === "safe") {
      // Safe → don't nag; just proceed to the link the user intended.
      window.open(url, "_blank", "noopener");
    } else {
      showBadge(url, verdict, x, y); // warning/dangerous → badge, user decides
    }
  } catch (err) {
    // Pre-check unavailable (server down / not signed in) → fail OPEN but warn softly, so we never
    // trap the user's click. A security tool that silently eats clicks is worse than one that defers.
    const msg = err.status === 401
      ? "Sign in to Orbis (extension Settings) to pre-check links. Opening was not blocked."
      : "Orbis couldn't pre-check this link right now. Proceed with your own judgment.";
    showBadge(url, { level: "warning", score: null, reasons: [{ text: msg }] }, x, y);
  }
}, true); // capture = true: run before Gmail's bubble-phase handlers

// Dismiss the badge on Escape or outside click.
document.addEventListener("keydown", (e) => { if (e.key === "Escape") removeBadge(); });
document.addEventListener("click", (e) => { if (activeBadge && !e.target.closest("[data-orbis-badge]")) removeBadge(); });
