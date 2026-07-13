import { useState, useRef, useEffect } from "react";
import { useAuth, useUser } from "@clerk/clerk-react";
import { api } from "../../lib/api.js";
import OrboAvatar from "../../components/OrboAvatar.jsx";
import Composer from "./Composer.jsx";
import ChatMessage, { OrboBubble } from "./ChatMessage.jsx";
import VerdictMessage from "./VerdictMessage.jsx";

// Looks like a URL or an email address? (client-side gate so obvious junk gets a
// friendly conversational reply instead of a round-trip + error.)
function looksCheckable(text) {
  const t = text.trim();
  const urlish = /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+.*$/i.test(t);
  const emailish = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
  return urlish || emailish;
}

// Prompt chips are conversation starters (not checkable input): each opens with a
// user bubble, then Orbo invites you to paste the thing it should look at.
const PROMPT_CHIPS = [
  { label: "Check a link", reply: "Sure! Paste the link you want me to check and I'll take a look." },
  { label: "Is this email a scam?", reply: "I can help with that. Paste the sender's email address or the suspicious link from the message." },
  { label: "Verify a sender", reply: "Go ahead and paste the sender's email address — I'll tell you if it looks legit." },
];

// Home = the chat with Orbo. Empty state shows the greeting + prompt chips; once you
// send something, it becomes a conversation (your bubble → Orbo's checking → verdict card).
export default function Home() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const firstName = user?.firstName ?? "there";

  const [messages, setMessages] = useState([]); // { id, role: 'user'|'orbo', kind, text?, indicatorId? }
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);
  const nextId = useRef(1);
  const add = (m) => setMessages((prev) => [...prev, { id: nextId.current++, ...m }]);

  // auto-scroll to newest message
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages]);

  async function handleSend(text) {
    add({ role: "user", kind: "text", text });

    if (!looksCheckable(text)) {
      add({ role: "orbo", kind: "text", pose: "caution",
        text: "Hmm, that doesn't look like a link or email address. Paste the full link (like https://…) or the sender's email, and I'll check it for you." });
      return;
    }

    setBusy(true);
    try {
      const { indicatorId } = await api.post("/api/submissions", { url: text }, { getToken });
      add({ role: "orbo", kind: "verdict", indicatorId });
    } catch (err) {
      add({ role: "orbo", kind: "text", pose: "caution",
        text: err.status === 400
          ? (err.body?.error ?? "That doesn't look like something I can check.")
          : "Something went wrong reaching me just now. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  // A prompt chip: show it as the user's message, then Orbo's invitation to paste.
  function handleChip(chip) {
    add({ role: "user", kind: "text", text: chip.label });
    add({ role: "orbo", kind: "text", pose: "wave", text: chip.reply });
  }

  const empty = messages.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "24px 20px 8px" }}>
        <div style={{ maxWidth: 780, margin: "0 auto" }}>
          {empty ? (
            <EmptyState firstName={firstName} onChip={handleChip} />
          ) : (
            messages.map((m) =>
              m.kind === "verdict" ? (
                <VerdictMessage key={m.id} indicatorId={m.indicatorId} onAskMore={() => {}} />
              ) : (
                <ChatMessage key={m.id} role={m.role} pose={m.pose}>
                  {m.role === "orbo" ? <OrboBubble>{m.text}</OrboBubble> : m.text}
                </ChatMessage>
              )
            )
          )}
        </div>
      </div>
      <Composer onSend={handleSend} disabled={busy} />
    </div>
  );
}

// Centered greeting + prompt chips (wireframe empty Home).
function EmptyState({ firstName, onChip }) {
  return (
    <div style={{ display: "grid", placeItems: "center", gap: 14, paddingTop: "12vh", textAlign: "center" }}>
      <OrboAvatar pose="wave" size={110} />
      <h1 style={{ color: "var(--navy)", fontSize: "1.9em" }}>Hi {firstName} 👋</h1>
      <p style={{ color: "var(--text-dim)" }}>Paste anything suspicious and I'll check it for you.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 4 }}>
        {PROMPT_CHIPS.map((c) => (
          <button key={c.label} onClick={() => onChip(c)}
            style={{ padding: "8px 16px", borderRadius: 20, border: "1px solid var(--border)",
              background: "var(--surface)", color: "var(--navy)", fontSize: "0.9em", cursor: "pointer" }}>
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
