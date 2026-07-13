import { useState } from "react";

// The paste-a-link input. Calls onSubmit(value) with the trimmed text.
// Shows a friendly inline message for empty input (full validation TODO(David)).
export default function SubmitForm({ onSubmit, disabled }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e) {
    e.preventDefault(); // stop the browser's default page reload
    const trimmed = value.trim();
    if (!trimmed) { setError("Paste a link or email address first."); return; }
    setError("");
    onSubmit(trimmed);
  }

  return (
    <form onSubmit={handleSubmit} style={{ width: "100%", maxWidth: 640 }}>
      <div style={{ display: "flex", gap: 8, background: "var(--surface)",
        border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 8,
        boxShadow: "var(--shadow)" }}>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Paste a link or email address…"
          style={{ flex: 1, border: "none", outline: "none", fontSize: "1em", padding: "8px 10px" }}
        />
        <button type="submit" disabled={disabled}
          style={{ background: "var(--primary)", color: "#fff", border: "none",
            borderRadius: 10, padding: "8px 18px", fontWeight: 700, cursor: "pointer" }}>
          Check it
        </button>
      </div>
      {error && <p style={{ color: "var(--danger)", fontSize: "0.85em", marginTop: 6 }}>⚠ {error}</p>}
    </form>
  );
}
