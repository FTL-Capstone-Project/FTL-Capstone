// ============================================================
// Orbo mascot. Renders the right pose image for the app state.
// Poses live in ../assets/orbo/ (transparent PNGs). We import them so
// Vite bundles + fingerprints each file (works in dev AND production build);
// hardcoding a "/src/..." path would 404 once built.
// ============================================================
import orboWave from "../assets/orbo/orbo-wave.png";
import orboThinking from "../assets/orbo/orbo-thinking.png";
import orboSafe from "../assets/orbo/orbo-safe.png";
import orboCaution from "../assets/orbo/orbo-caution.png";
import orboDanger from "../assets/orbo/orbo-danger.png";
import orboHappy from "../assets/orbo/orbo-happy.png";

// pose name → image + the alt text a screen reader announces.
const POSES = {
  wave:     { src: orboWave,     alt: "Orbo waving hello" },
  thinking: { src: orboThinking, alt: "Orbo thinking while it checks your link" },
  safe:     { src: orboSafe,     alt: "Orbo giving a thumbs-up — this link looks safe" },
  caution:  { src: orboCaution,  alt: "Orbo raising a cautious hand — review this link" },
  danger:   { src: orboDanger,   alt: "Orbo holding up a stop sign — this link looks dangerous" },
  happy:    { src: orboHappy,    alt: "Orbo smiling" },
};

// <OrboAvatar pose="thinking" size={64} />  — pose defaults to "wave".
const OrboAvatar = ({ pose = "wave", size = 48 }) => {
  const { src, alt } = POSES[pose] ?? POSES.wave;
  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      style={{ objectFit: "contain", display: "block" }}
    />
  );
}

export default OrboAvatar;
