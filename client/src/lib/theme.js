// ── lib: theme · owner: David ──
// Tiny light/dark theme store. The active theme lives on <html data-theme>, which is
// what tokens.css keys off of, so setting it re-themes the whole app. The initial
// value is applied by an inline script in index.html (before paint, no flash); this
// module just reads/flips it afterward and persists the choice to localStorage.

const KEY = "orbis-theme";

export const getTheme = () =>
  document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";

export const setTheme = (theme) => {
  const next = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", next);
  try { localStorage.setItem(KEY, next); } catch (e) { /* private mode: ignore */ }
  return next;
};

export const toggleTheme = () => setTheme(getTheme() === "dark" ? "light" : "dark");
