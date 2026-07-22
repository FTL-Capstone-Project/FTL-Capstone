import { useState, useEffect } from "react";
import { getResolvedTheme } from "./theme.js";

// ── lib: useResolvedTheme · owner: David ──
// Reactive "light" | "dark" for React components that need to RE-RENDER when the theme changes
// (e.g. Clerk's appearance prop, which is a JS object — unlike our CSS, it can't just read a
// var(--...) token and repaint on its own).
//
// Every theme change in the app funnels through lib/theme.js setting <html data-theme> (the
// Settings toggle, the top-bar sun/moon, and the OS flip while on "system" all call the same
// applyResolved()). So we watch that ONE attribute with a MutationObserver and re-read the
// resolved theme — no new event bus needed, and it can't drift from what's actually painted.
export const useResolvedTheme = () => {
  const [theme, setTheme] = useState(getResolvedTheme);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const html = document.documentElement;
    const sync = () => setTheme(getResolvedTheme());
    sync(); // in case data-theme changed between render and effect
    const observer = new MutationObserver(sync);
    observer.observe(html, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  return theme;
}
