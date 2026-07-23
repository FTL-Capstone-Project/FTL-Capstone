// ── lib: theme · owner: David ──
// Light/dark theme store with a 3-way PREFERENCE (like Gemini/Chrome): "light", "dark", or
// "system". The RESOLVED theme (what actually paints) lives on <html data-theme>, which is
// what tokens.css keys off of. "system" means "no override — follow the OS", and we update
// live when the OS flips. The initial value is applied by an inline script in index.html
// (before paint, no flash); this module reads/sets it afterward and persists the preference.

const KEY = "orbis-theme"; // stores "light" | "dark" | "system"

const osPrefersDark = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;

// The saved PREFERENCE (defaults to "system" when the user has never chosen).
export const getThemePreference = () => {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch (e) { /* private mode: ignore */ }
  return "system";
};

// The RESOLVED theme actually shown: "system" resolves against the OS.
export const getResolvedTheme = () => {
  const pref = getThemePreference();
  if (pref === "system") return osPrefersDark() ? "dark" : "light";
  return pref;
};

// Point the tab favicon at the planet-"O" variant matching the OS THEME (the tab bar), not the
// site's chosen theme. index.html sets it once before paint; this keeps it in sync when the OS
// theme flips live. Takes no args — it reads prefers-color-scheme itself.
const applyFavicon = () => {
  if (typeof document === "undefined") return;
  // The favicon must match the BROWSER TAB BAR, which follows the OS theme — NOT the site's chosen
  // theme. Someone on OS-dark who sets the site to light still has a DARK tab bar, so a light
  // (navy) favicon would vanish there. So we pick the variant from prefers-color-scheme directly,
  // independent of the in-app light/dark preference.
  const osDark = typeof window !== "undefined" && window.matchMedia
    && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const variant = osDark ? "dark" : "light";
  const href = `/favicon-${variant}.svg?v=${variant}`;
  // Browsers cache the favicon and often IGNORE an href change on the existing <link>. To force a
  // re-fetch we REPLACE the node (and add a ?v= query so the URL actually differs). This is why the
  // live swap wasn't switching before.
  const old = document.getElementById("favicon");
  const link = document.createElement("link");
  link.id = "favicon";
  link.rel = "icon";
  link.type = "image/svg+xml";
  link.href = href;
  if (old) old.remove();
  document.head.appendChild(link);
};

// Apply the resolved theme to <html data-theme> (and sync the favicon). The page theme and the
// favicon are decoupled on purpose: the page follows the user's in-app choice, the favicon follows
// the OS (the tab bar), so applyFavicon reads prefers-color-scheme itself rather than the page theme.
const applyResolved = () => {
  const resolved = getResolvedTheme();
  document.documentElement.setAttribute("data-theme", resolved);
  applyFavicon();
};

// Set the preference (persist it) and repaint. Pass "light" | "dark" | "system".
export const setThemePreference = (pref) => {
  const next = pref === "light" || pref === "dark" ? pref : "system";
  try { localStorage.setItem(KEY, next); } catch (e) { /* ignore */ }
  applyResolved();
  return next;
};

// React to the OS theme flipping live. Call once at app start; returns an unsubscribe fn.
// Two independent effects:
//   • The PAGE theme only re-resolves when the preference is "system" (an explicit light/dark
//     choice pins the page and shouldn't move with the OS).
//   • The FAVICON ALWAYS follows the OS, because it must match the browser tab bar — even when the
//     user has pinned the site to the opposite theme.
export const watchSystemTheme = () => {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    if (getThemePreference() === "system") applyResolved(); // repaints page + favicon
    else applyFavicon();                                    // page stays pinned; favicon still tracks the OS
  };
  mq.addEventListener?.("change", onChange);
  return () => mq.removeEventListener?.("change", onChange);
};

// ── Back-compat for the existing top-bar sun/moon toggle ──
// getTheme() returns the resolved theme; toggleTheme() flips to the OPPOSITE explicit theme
// (so a single click gives a definite light/dark, matching the old button's behavior).
export const getTheme = getResolvedTheme;
export const toggleTheme = () => setThemePreference(getResolvedTheme() === "dark" ? "light" : "dark");
