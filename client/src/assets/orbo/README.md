# Orbo mascot assets

Drop the Orbo mascot PNGs here (transparent background, ~512px, square-ish). The app currently
renders an inline-SVG placeholder in `components/OrboAvatar.jsx`; once these exist, `OrboAvatar`
will load the right pose per app state.

Use these exact filenames so `OrboAvatar` can map state → image:

| File | Pose | Used where |
|---|---|---|
| `orbo-wave.png` | Happy / waving | Home greeting, welcome |
| `orbo-thinking.png` | Thinking / checking | Check Link — checking state |
| `orbo-safe.png` | Thumbs-up + green check | Safe verdict |
| `orbo-caution.png` | Concerned, pointing (no thumbs-up) | Review/Suspicious verdict |
| `orbo-danger.png` | Serious, calm "stop" palm | Dangerous verdict |
| `orbo-guardian.png` | Shield (optional) | Login / trust moments |

Notes:
- **Transparent PNG** (no grey box), consistent framing across poses (same crop/zoom).
- Keep them on-brand: cute/soft, never scary — the danger pose is protective, not menacing.
- Export at ~512×512 so they stay crisp when shown small.
