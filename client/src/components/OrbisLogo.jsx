// ============================================================
// Orbis logo — the real brand wordmark (planet-O + orbital ring + "rbis"), exported
// from Figma. Background stripped to transparent so it sits on any surface.
// Imported so Vite bundles + fingerprints it (works in dev + production build).
//
// <OrbisLogo height={32} /> → the wordmark. (markOnly kept for API compatibility;
// the current asset is the full wordmark, so it renders the same for now.)
// ============================================================
import logo from "../assets/orbis-logo.png";

export default function OrbisLogo({ height = 32, markOnly = false }) {
  return (
    <img
      src={logo}
      alt="Orbis"
      height={height}
      style={{ height, width: "auto", display: "block", objectFit: "contain" }}
    />
  );
}
