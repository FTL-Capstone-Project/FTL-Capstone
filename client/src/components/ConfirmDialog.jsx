import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";

// ── shared confirm dialog · owner: David ──
// A themed replacement for the browser's window.confirm() (which can't be styled and looks like a
// raw Chrome popup). Follows our theme tokens so it works in light + dark automatically, and mirrors
// ReportModal's modal basics: dim backdrop, click-outside / Escape to cancel, focus moves in on open
// and is restored on close. CONTROLLED: the parent owns whether it's shown and passes onConfirm /
// onCancel. Render it only when open (parent does `{confirm && <ConfirmDialog ... />}`), like the
// other modals in this app.
//
// Props:
//   title        — the question ("Delete this report?")
//   message      — optional supporting line ("This can't be undone.")
//   confirmLabel — confirm button text (default "Confirm")
//   cancelLabel  — cancel button text (default "Cancel")
//   danger       — true = red confirm button (destructive actions like delete). default false.
//   onConfirm / onCancel — callbacks. onCancel also fires on Escape / backdrop click / X.
const ConfirmDialog = ({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}) => {
  const confirmRef = useRef(null);
  const prevFocusRef = useRef(null);
  // Read the callbacks through refs so the mount effect can have an EMPTY dep array (run once).
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  // Focus the confirm button on open, close on Escape, restore focus on unmount. Keep it simple —
  // this dialog has only two buttons, so a full focus-trap (like the big detail modal) is overkill.
  useEffect(() => {
    prevFocusRef.current = document.activeElement;
    confirmRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onCancelRef.current?.(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prevFocusRef.current?.focus?.();
    };
  }, []);

  // Destructive actions use the danger token for the confirm button; everything else uses primary.
  const confirmColor = danger ? "var(--danger)" : "var(--primary)";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel?.(); }}
      style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(10,37,64,0.45)",
        display: "grid", placeItems: "center", padding: 16 }}
    >
      <div style={{ background: "var(--surface)", borderRadius: 16, boxShadow: "var(--shadow)",
        width: "100%", maxWidth: 400, border: "1px solid var(--border)", overflow: "hidden" }}>
        <div style={{ padding: "22px 22px 20px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            {/* Warning glyph tinted to match the confirm color (red for destructive, blue otherwise). */}
            <span style={{ flexShrink: 0, display: "grid", placeItems: "center", width: 36, height: 36,
              borderRadius: 10, background: danger ? "var(--danger-bg)" : "var(--canvas)", color: confirmColor }}>
              <AlertTriangle size={19} />
            </span>
            <div style={{ minWidth: 0 }}>
              <h2 id="confirm-dialog-title" style={{ margin: 0, fontSize: "1.05em", fontWeight: 800,
                color: "var(--navy)" }}>
                {title}
              </h2>
              {message && (
                <p style={{ margin: "6px 0 0", fontSize: "0.86em", color: "var(--text-dim)", lineHeight: 1.5 }}>
                  {message}
                </p>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
            <button
              onClick={onCancel}
              style={{ padding: "9px 16px", borderRadius: 10, fontWeight: 700, fontSize: "0.88em",
                cursor: "pointer", border: "1px solid var(--border)", background: "transparent",
                color: "var(--text-dim)" }}
            >
              {cancelLabel}
            </button>
            <button
              ref={confirmRef}
              onClick={onConfirm}
              style={{ padding: "9px 18px", borderRadius: 10, fontWeight: 700, fontSize: "0.88em",
                cursor: "pointer", border: `1.5px solid ${confirmColor}`, background: confirmColor,
                color: "#fff" }}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
