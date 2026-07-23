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

// Gmail's OWN chrome links to skip — the exact hosts, not all of *.google.com. (The old
// broad /(^|\.)google\.com$/ also excluded sites.google.com / docs.google.com, which CAN host
// phishing, so those were never screened.) We only skip Gmail + the Google account/login chrome.
const SKIP_HOSTS = new Set(["mail.google.com", "accounts.google.com"]);

// Read config (apiUrl, token, webUrl) — same storage the popup/options use. webUrl is the Orbis
// WEB APP url (for "See why" deep-links); it's separate from the API url because in production
// they're different hosts (api vs client) — deriving one from the other's port only works locally.
const getConfig = async () => {
  const { apiUrl, token, webUrl } = await chrome.storage.sync.get(["apiUrl", "token", "webUrl"]);
  return {
    apiUrl: (apiUrl || "http://localhost:3001").replace(/\/$/, ""),
    token: token || "",
    webUrl: (webUrl || "").replace(/\/$/, ""),
  };
};

// Is this a link we should screen? Real external http(s) links in the message body — skip Gmail's
// own UI links, anchors, mailto:, and same-host navigation.
const shouldScreen = (a) => {
  const href = a.href || "";
  if (!/^https?:\/\//i.test(href)) return false;
  try {
    const host = new URL(href).hostname.toLowerCase();
    if (SKIP_HOSTS.has(host)) return false;
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
  const { apiUrl, webUrl } = await getConfig();
  const lvl = LEVELS[verdict.level] || LEVELS.warning;
  // Prefer the explicitly-configured web app URL. Fall back to the localhost port swap for dev
  // (API :3001 → Vite client :5173); that swap is a no-op on the deployed API host, so without a
  // configured webUrl "See why" would wrongly point at the API host in production.
  const clientUrl = webUrl || apiUrl.replace(":3001", ":5173");
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

// We prevented the link's default, so WE navigate when it should proceed. Use the CURRENT tab
// (location.assign) — a post-await window.open("_blank") is treated as a non-gesture popup and gets
// blocked, silently swallowing the click. Same-tab navigation is never popup-blocked.
const proceedTo = (url) => { window.location.assign(url); };

// Capture-phase click handler: intercept BEFORE Gmail's own handler navigates. For a dangerous/
// warning link we block navigation and show the badge; a safe link proceeds; if the pre-check
// can't run we FAIL OPEN (navigate anyway) so a broken check never traps the user's click.
const onLinkClick = async (e) => {
  // Never intercept clicks INSIDE our own badge (its "See why" / "Open anyway" / close controls) —
  // otherwise the badge's links get re-screened instead of doing their job.
  if (e.target.closest?.("[data-orbis-badge]")) return;

  const a = e.target.closest?.("a[href]");
  if (!a || !shouldScreen(a)) return;

  // Let the browser handle modified/middle clicks natively (new tab, download, etc.). We can't
  // faithfully reproduce those after an async check, and intercepting them risks double-opening.
  if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;

  const url = a.href;
  // Hold the click: prevent the default open until we have a verdict.
  e.preventDefault();
  e.stopPropagation();
  const { clientX: x, clientY: y } = e;

  try {
    const verdict = await prescreen(url);
    if (verdict.level === "safe") {
      proceedTo(url); // safe → don't nag; go where the user intended (same tab)
    } else {
      showBadge(url, verdict, x, y); // warning/dangerous → badge, user decides
    }
  } catch (err) {
    // Pre-check unavailable (server down / not signed in) → truly FAIL OPEN: navigate anyway rather
    // than trap the click behind a badge. A security tool that silently eats clicks is worse than
    // one that defers. (The full check is still one right-click away.)
    proceedTo(url);
  }
};

document.addEventListener("click", onLinkClick, true);   // capture = before Gmail's own handlers
document.addEventListener("auxclick", onLinkClick, true); // middle-click path (returns early above)

// Dismiss the badge on Escape or outside click.
document.addEventListener("keydown", (e) => { if (e.key === "Escape") removeBadge(); });
document.addEventListener("click", (e) => { if (activeBadge && !e.target.closest("[data-orbis-badge]")) removeBadge(); });
