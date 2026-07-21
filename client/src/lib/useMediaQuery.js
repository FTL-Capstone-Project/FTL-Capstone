import { useState, useEffect } from "react";

// Reactive CSS media-query hook. Inline styles can't hold @media rules, and the app frame
// (AppShell) needs to switch between the desktop docked sidebar and the mobile slide-in overlay
// in JS — so we read the breakpoint here. Mirrors the matchMedia usage in lib/theme.js.
// Returns true when the query currently matches, and updates live on resize / orientation change.
export const useMediaQuery = (query) => {
  const get = () => (typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia(query).matches
    : false);

  const [matches, setMatches] = useState(get);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange(); // sync immediately in case the query changed between render and effect
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);

  return matches;
};

// The app's mobile breakpoint — phones + small tablets. Used by AppShell and the chat/composer.
export const MOBILE_QUERY = "(max-width: 768px)";
