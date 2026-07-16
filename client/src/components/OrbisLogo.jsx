// ============================================================
// Orbis logo — the real brand wordmark (planet-O + orbital ring + "rbis"), exported
// from Figma. Background stripped to transparent so it sits on any surface.
// Imported so Vite bundles + fingerprints them (works in dev + production build).
//
// Two variants: the LIGHT-theme logo (dark wordmark, for light surfaces) and the
// DARK-theme logo (white wordmark, for dark surfaces). We pick by the active
// <html data-theme> so the mark always reads against its background.
//
// <OrbisLogo height={32} /> → the wordmark. (markOnly kept for API compatibility;
// the current asset is the full wordmark, so it renders the same for now.)
// ============================================================
import { useEffect, useState } from "react";
import logoLight from "../assets/orbis-logo.png";       // dark wordmark → light surfaces
import logoDark from "../assets/orbis-logo-dark.png";   // white wordmark → dark surfaces

// Read the current theme off <html data-theme>. Defaults to light.
const currentTheme = () =>
  document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";

const OrbisLogo = ({ height = 32, markOnly = false }) => {
  const [theme, setTheme] = useState(currentTheme);

  // Re-render when the theme attribute flips (toggle) so the right variant shows
  // without a page reload. (Arrow consts aren't hoisted, so currentTheme is above.)
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(currentTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  return (
    <img
      src={theme === "dark" ? logoDark : logoLight}
      alt="Orbis"
      height={height}
      style={{ height, width: "auto", display: "block", objectFit: "contain" }}
    />
  );
};

export default OrbisLogo;
