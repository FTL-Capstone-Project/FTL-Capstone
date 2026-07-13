// Orbo mascot. Lightweight SVG placeholder so the app renders without asset files;
// TODO: swap for the real Orbo PNG in assets/ once exported.
export default function OrboAvatar({ size = 48 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" aria-label="Orbo" role="img">
      <ellipse cx="40" cy="44" rx="34" ry="12" fill="none" stroke="var(--ring)" strokeWidth="3"
        transform="rotate(-18 40 44)" />
      <circle cx="40" cy="40" r="24" fill="var(--primary)" stroke="var(--navy)" strokeWidth="3" />
      <rect x="24" y="30" width="32" height="22" rx="11" fill="var(--navy)" />
      <circle cx="34" cy="41" r="3.4" fill="#8FE9FF" />
      <circle cx="46" cy="41" r="3.4" fill="#8FE9FF" />
    </svg>
  );
}
