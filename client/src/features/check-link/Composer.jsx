import { useState, useRef } from "react";

// The persistent bottom chat input (wireframe: 📎 · "Paste a link or email address…" · ⬆ send).
//   onSend(text)              — text submitted
//   onUploadImage(dataUrl, fileName) — an image chosen via the paperclip
// Disabled while Orbo is busy.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB (server allows 12mb base64 ≈ ~9MB raw)

export default function Composer({ onSend, onUploadImage, disabled }) {
  const [value, setValue] = useState("");
  const [fileError, setFileError] = useState("");
  const fileRef = useRef(null);

  function submit(e) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  }

  function pickFile() {
    if (!disabled) fileRef.current?.click();
  }

  // Shared: validate an image File and hand its data URL up. Used by the paperclip AND paste.
  function readImageFile(file) {
    setFileError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) { setFileError("Please choose an image file."); return; }
    if (file.size > MAX_IMAGE_BYTES) { setFileError("That image is too large (max 8MB)."); return; }
    const reader = new FileReader();
    reader.onload = () => onUploadImage?.(reader.result, file.name || "pasted-image.png"); // data:image/...;base64,...
    reader.onerror = () => setFileError("Couldn't read that image.");
    reader.readAsDataURL(file);
  }

  function onFileChosen(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so the same file can be re-picked
    readImageFile(file);
  }

  // Paste an image straight from the clipboard (Cmd/Ctrl+V) → upload it. A pasted image
  // has a clipboard item of kind "file"; pasted text falls through to the normal input.
  function onPaste(e) {
    if (disabled) return;
    const items = e.clipboardData?.items ?? [];
    for (const item of items) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) { e.preventDefault(); readImageFile(file); return; } // stop it landing as text
      }
    }
    // no image → let the paste proceed as normal text
  }

  return (
    <form onSubmit={submit} style={{ padding: "12px 20px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", maxWidth: 780,
        background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 28,
        boxShadow: "var(--shadow)", padding: "8px 8px 8px 12px" }}>
        {/* paperclip → hidden file input (upload an image to scan) */}
        <button type="button" onClick={pickFile} disabled={disabled} aria-label="Upload an image"
          title="Upload a screenshot to check"
          style={{ flexShrink: 0, background: "none", border: "none", cursor: disabled ? "default" : "pointer",
            fontSize: "1.2em", color: "var(--text-dim)", padding: "4px 6px" }}>
          📎
        </button>
        <input ref={fileRef} type="file" accept="image/*" onChange={onFileChosen} style={{ display: "none" }} />

        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onPaste={onPaste}
          placeholder="Paste a link, email, or a screenshot (⌘V), or 📎 upload…"
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
      {fileError && <p style={{ color: "var(--danger)", fontSize: "0.8em" }}>⚠ {fileError}</p>}
    </form>
  );
}
