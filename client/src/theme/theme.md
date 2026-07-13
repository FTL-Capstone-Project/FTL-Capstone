# Orbis Theme — where the colors live

**All colors are defined in one place: [`tokens.css`](./tokens.css).**
They are CSS variables. To change the brand color, edit ONE line there and it
updates across the whole app. Do **not** write raw hex values (`#0F62FE`) inside
components — always use `var(--primary)` etc.

## The palette ("Trust Blue")

| Token | Hex | Where it's used |
|---|---|---|
| `--primary` | `#0F62FE` | Buttons, links, active nav, the main "do it" action |
| `--primary-dark` | `#0A4FD6` | Hover state for primary buttons |
| `--navy` | `#0A2540` | Headings, the top bar, sidebar text |
| `--canvas` | `#F4F6F8` | The page background |
| `--surface` | `#FFFFFF` | Cards, panels, input fields |
| `--border` | `#E2E8F0` | Lines between things, card edges |
| `--text` | `#1A2230` | Normal body text |
| `--text-dim` | `#556070` | Labels, timestamps, secondary text |
| `--safe` | `#198038` | ✓ Safe verdicts (green) |
| `--review` | `#B9860B` | ⚠ Review/Suspicious verdicts (amber) |
| `--danger` | `#DA1E28` | ⛔ Danger verdicts (red) — reserved for real threats |
| `--ring` | `#21C7E6` | Orbo's glowing orbital ring / cyan accents |

## Rules
1. **60 / 30 / 10** — mostly neutral canvas & white (60%), blue structure (30%),
   status accents used sparingly (10%).
2. **Status = icon + word + color, never color alone** (accessibility). A red dot
   with no label is not allowed; it must say "Danger" with an icon too.
3. **Light mode is the default.** (A dark toggle is a possible stretch.)

## How to use in a component
```jsx
<button style={{ background: "var(--primary)", color: "#fff" }}>Check it</button>
```
or in a CSS file:
```css
.verdict-card { background: var(--surface); border: 1px solid var(--border); }
```
