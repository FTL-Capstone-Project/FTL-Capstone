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

// Point the tab favicon at the planet-"O" variant matching the resolved theme (blue tuned per
// theme). index.html sets it once before paint; this keeps it in sync when the theme changes
// live (Settings toggle, or the OS flipping while "system" is selected).
const applyFavicon = (resolved) => {
  const fav = typeof document !== "undefined" && document.getElementById("favicon");
  if (fav) fav.href = resolved === "dark" ? "/favicon-dark.svg" : "/favicon-light.svg";
};

// Apply the resolved theme to <html data-theme> (and sync the favicon).
const applyResolved = () => {
  const resolved = getResolvedTheme();
  document.documentElement.setAttribute("data-theme", resolved);
  applyFavicon(resolved);
};

// Set the preference (persist it) and repaint. Pass "light" | "dark" | "system".
export const setThemePreference = (pref) => {
  const next = pref === "light" || pref === "dark" ? pref : "system";
  try { localStorage.setItem(KEY, next); } catch (e) { /* ignore */ }
  applyResolved();
  return next;
};

// While the preference is "system", re-resolve whenever the OS theme changes (live).
// Call once at app start; returns an unsubscribe fn.
export const watchSystemTheme = () => {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => { if (getThemePreference() === "system") applyResolved(); };
  mq.addEventListener?.("change", onChange);
  return () => mq.removeEventListener?.("change", onChange);
};

// ── Back-compat for the existing top-bar sun/moon toggle ──
// getTheme() returns the resolved theme; toggleTheme() flips to the OPPOSITE explicit theme
// (so a single click gives a definite light/dark, matching the old button's behavior).
export const getTheme = getResolvedTheme;
export const toggleTheme = () => setThemePreference(getResolvedTheme() === "dark" ? "light" : "dark");
