import { useState } from "react";

// The persistent bottom chat input (wireframe: 📎 · "Paste a link or email address…" · ⬆ send).
// Calls onSend(text) with the trimmed value; clears on send. Disabled while Orbo is busy.
export default function Composer({ onSend, disabled }) {
  const [value, setValue] = useState("");

  function submit(e) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  }

  return (
    <form onSubmit={submit} style={{ padding: "12px 20px 20px", display: "flex", justifyContent: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", maxWidth: 780,
        background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 28,
        boxShadow: "var(--shadow)", padding: "8px 8px 8px 16px" }}>
        <span aria-hidden style={{ color: "var(--text-dim)", fontSize: "1.1em" }}>📎</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Paste a link or email address…"
          disabled={disabled}
          style={{ flex: 1, border: "none", outline: "none", fontSize: "1em", background: "transparent" }}
        />
        <button type="submit" disabled={disabled || !value.trim()} aria-label="Send"
          style={{ flexShrink: 0, width: 40, height: 40, borderRadius: "50%", border: "none",
            background: value.trim() && !disabled ? "var(--primary)" : "var(--border)",
            color: "#fff", cursor: value.trim() && !disabled ? "pointer" : "default",
            fontSize: "1.2em", display: "grid", placeItems: "center", transition: "background 0.15s" }}>
          ↑
        </button>
      </div>
    </form>
  );
}
