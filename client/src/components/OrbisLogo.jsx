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

// Intrinsic aspect ratio (width / height) of each exported PNG. The two Figma exports
// have different padding, so at the same rendered HEIGHT the wordmarks look different
// sizes. We instead render both to the same WIDTH (= height x the light ratio) so the
// mark keeps a consistent footprint in the nav/sidebar across themes. Once a matched
// transparent dark export lands (same ratio as light), these converge and it's a no-op.
const RATIO = { light: 810 / 230, dark: 5194 / 1661 };

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

  const isDark = theme === "dark";
  // Both variants render at the same width; height follows each PNG's own ratio so it
  // isn't stretched. This is what keeps the logo the same visual size in both themes.
  const width = height * RATIO.light;
  return (
    <img
      src={isDark ? logoDark : logoLight}
      alt="Orbis"
      style={{ width, height: width / (isDark ? RATIO.dark : RATIO.light), display: "block", objectFit: "contain" }}
    />
  );
};

export default OrbisLogo;
