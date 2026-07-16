import OrboAvatar from "../../components/OrboAvatar.jsx";

// One turn in the conversation.
//   role "user"  → right-aligned blue bubble (what you sent)
//   role "orbo"  → left-aligned, Orbo avatar + a light bubble (or any children, e.g. a verdict card)
const ChatMessage = ({ role, pose = "wave", children }) => {
  const isUser = role === "user";

  if (isUser) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", margin: "10px 0" }}>
        <div style={{ maxWidth: "80%", background: "var(--primary)", color: "#fff",
          padding: "10px 14px", borderRadius: "16px 16px 4px 16px", wordBreak: "break-word", fontSize: "0.95em" }}>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "10px 0" }}>
      <div style={{ flexShrink: 0, width: 36, height: 36 }}>
        <OrboAvatar pose={pose} size={36} />
      </div>
      <div style={{ maxWidth: "85%" }}>{children}</div>
    </div>
  );
}

// The plain speech bubble Orbo talks in (for text replies, not verdict cards).
export const OrboBubble = ({ children }) => {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)",
      padding: "10px 14px", borderRadius: "4px 16px 16px 16px", boxShadow: "var(--shadow)", fontSize: "0.95em" }}>
      {children}
    </div>
  );
}

// The "Checking this link… •••" animated pending bubble.
export const ThinkingBubble = ({ label = "Checking this link…" }) => {
  return (
    <OrboBubble>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", gap: 5 }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{
            width: 7, height: 7, borderRadius: "50%", background: "var(--text-dim)",
            animation: "orboDot 1.2s infinite ease-in-out", animationDelay: `${i * 0.2}s`,
          }} />
        ))}
      </div>
    </OrboBubble>
  );
}

export default ChatMessage;
