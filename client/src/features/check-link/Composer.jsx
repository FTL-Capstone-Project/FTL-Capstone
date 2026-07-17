import { useState, useRef } from "react";
import { Paperclip, ArrowUp, X, AlertCircle } from "lucide-react";

// The persistent bottom chat input (wireframe: 📎 · "Paste a link or email address…" · ⬆ send).
// Images (paperclip OR clipboard paste) are STAGED as a preview chip — nothing happens until
// you hit send, so you can type an instruction first (like ChatGPT/Gemini/Claude).
//   onSend(text)                         — text-only submit
//   onSendImage(dataUrl, text, fileName) — image (with optional instruction) submit
// Disabled while Orbo is busy.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB (server allows 12mb base64 ≈ ~9MB raw)

const Composer = ({ onSend, onSendImage, disabled }) => {
  const [value, setValue] = useState("");
  const [pendingImage, setPendingImage] = useState(null); // { dataUrl, fileName } | null
  const [fileError, setFileError] = useState("");
  const fileRef = useRef(null);

  const submit = (e) => {
    e.preventDefault();
    if (disabled) return;
    const trimmed = value.trim();
    if (pendingImage) {
      onSendImage?.(pendingImage.dataUrl, trimmed, pendingImage.fileName);
      setPendingImage(null);
      setValue("");
    } else if (trimmed) {
      onSend(trimmed);
      setValue("");
    }
  }

  const pickFile = () => {
    if (!disabled) fileRef.current?.click();
  }

  // Validate an image File and STAGE it (show a preview) — does NOT send. Shared by paperclip + paste.
  const stageImageFile = (file) => {
    setFileError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) { setFileError("Please choose an image file."); return; }
    if (file.size > MAX_IMAGE_BYTES) { setFileError("That image is too large (max 8MB)."); return; }
    const reader = new FileReader();
    reader.onload = () => setPendingImage({ dataUrl: reader.result, fileName: file.name || "pasted-image.png" });
    reader.onerror = () => setFileError("Couldn't read that image.");
    reader.readAsDataURL(file);
  }

  const onFileChosen = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so the same file can be re-picked
    stageImageFile(file);
  }

  // Paste an image straight from the clipboard (⌘/Ctrl+V) → stage it. Pasted text falls through.
  const onPaste = (e) => {
    if (disabled) return;
    const items = e.clipboardData?.items ?? [];
    for (const item of items) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) { e.preventDefault(); stageImageFile(file); return; }
      }
    }
    // no image → let the paste proceed as normal text
  }

  const canSend = !disabled && (value.trim() || pendingImage);
  const placeholder = pendingImage
    ? "Add a note — e.g. “check the link” or “is this sender legit?” (optional)"
    : "Paste a link, email, or a screenshot — or attach one…";

  return (
    <form onSubmit={submit} style={{ padding: "12px 20px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", maxWidth: 780,
        background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20,
        boxShadow: "var(--shadow)", padding: pendingImage ? 10 : "8px 8px 8px 12px" }}>

        {/* staged image preview (chip) — shows BEFORE sending, with a remove button */}
        {pendingImage && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 6,
            background: "var(--canvas)", borderRadius: 12, alignSelf: "flex-start", maxWidth: "100%" }}>
            <img src={pendingImage.dataUrl} alt="attached"
              style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" }} />
            <span style={{ fontSize: "0.82em", color: "var(--text-dim)", maxWidth: 220, overflow: "hidden",
              textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pendingImage.fileName}</span>
            <button type="button" onClick={() => setPendingImage(null)} aria-label="Remove image"
              style={{ border: "none", background: "none", cursor: "pointer", color: "var(--text-dim)",
                padding: "0 4px", display: "grid", placeItems: "center" }}>
              <X size={16} />
            </button>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* paperclip → hidden file input */}
          <button type="button" onClick={pickFile} disabled={disabled} aria-label="Upload an image"
            title="Attach a screenshot"
            style={{ flexShrink: 0, background: "none", border: "none", cursor: disabled ? "default" : "pointer",
              color: "var(--text-dim)", padding: "4px 6px", display: "grid", placeItems: "center" }}>
            <Paperclip size={20} />
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={onFileChosen} style={{ display: "none" }} />

          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onPaste={onPaste}
            placeholder={placeholder}
            disabled={disabled}
            // color must be the theme's text token — without it the input inherits the
            // browser default (near-black), which is invisible on the dark-mode surface.
            style={{ flex: 1, border: "none", outline: "none", fontSize: "1em", background: "transparent", color: "var(--text)" }}
          />
          <button type="submit" disabled={!canSend} aria-label="Send"
            style={{ flexShrink: 0, width: 40, height: 40, borderRadius: "50%", border: "none",
              background: canSend ? "var(--primary)" : "var(--border)",
              color: "#fff", cursor: canSend ? "pointer" : "default",
              display: "grid", placeItems: "center", transition: "background 0.15s" }}>
            <ArrowUp size={20} />
          </button>
        </div>
      </div>
      {fileError && (
        <p style={{ color: "var(--danger)", fontSize: "0.8em", display: "flex", alignItems: "center", gap: 5 }}>
          <AlertCircle size={13} /> {fileError}
        </p>
      )}
    </form>
  );
}

export default Composer;
