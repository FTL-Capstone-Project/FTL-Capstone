// ── component: theme toggle · owner: David ──
// Sun/moon button that flips light <-> dark. Uses lucide icons (no emojis) and
// theme-token colors so it fits both themes. Drop it anywhere (landing nav, app top
// bar). The actual theme state lives on <html data-theme> via lib/theme.js.
import { useState } from "react";
import { Sun, Moon } from "lucide-react";
import { getTheme, toggleTheme } from "../lib/theme.js";

const ThemeToggle = ({ size = 18 }) => {
  const [theme, setThemeState] = useState(getTheme);

  const onClick = () => setThemeState(toggleTheme());

  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      style={{
        display: "grid", placeItems: "center", width: 38, height: 38, borderRadius: 10,
        background: "transparent", border: "1px solid var(--border)", cursor: "pointer",
        color: "var(--text-dim)",
      }}
    >
      {isDark ? <Sun size={size} /> : <Moon size={size} />}
    </button>
  );
};

export default ThemeToggle;
