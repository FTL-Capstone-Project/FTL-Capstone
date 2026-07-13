import { useState, useRef, useEffect } from "react";
import { useAuth, useUser } from "@clerk/clerk-react";
import { api } from "../../lib/api.js";
import OrboAvatar from "../../components/OrboAvatar.jsx";
import Composer from "./Composer.jsx";
import ChatMessage, { OrboBubble } from "./ChatMessage.jsx";
import VerdictMessage from "./VerdictMessage.jsx";

// Looks like a URL or an email address? (so we know whether to SCAN it vs treat it as
// a question for Orbo.)
function looksCheckable(text) {
  const t = text.trim();
  if (/\s/.test(t) && !/^https?:\/\//i.test(t)) return false; // has spaces → it's a sentence/question
  const urlish = /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+.*$/i.test(t);
  const emailish = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
  return urlish || emailish;
}

const PROMPT_CHIPS = [
  { label: "Check a link", reply: "Sure! Paste the link you want me to check and I'll take a look." },
  { label: "Is this email a scam?", reply: "I can help with that. Paste the sender's email address or the suspicious link from the message." },
  { label: "Verify a sender", reply: "Go ahead and paste the sender's email address — I'll tell you if it looks legit." },
];

export default function Home() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const firstName = user?.firstName ?? "there";

  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);
  const nextId = useRef(1);
  const lastIndicatorId = useRef(null); // context for follow-up "ask Orbo" questions
  const add = (m) => setMessages((prev) => [...prev, { id: nextId.current++, ...m }]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages]);

  // Scan a URL/email → verdict card. (shared by paste, chip, and upload-choice paths)
  async function scan(target) {
    setBusy(true);
    try {
      const { indicatorId } = await api.post("/api/submissions", { url: target }, { getToken });
      lastIndicatorId.current = indicatorId;
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

  // Free-form question → Orbo answers (security topics only; server declines off-topic).
  async function askOrbo(question) {
    setBusy(true);
    try {
      const history = messages.filter((m) => m.kind === "text").slice(-6).map((m) => ({ role: m.role, text: m.text }));
      const { answer } = await api.post("/api/ask-orbo",
        { indicatorId: lastIndicatorId.current, question, history }, { getToken });
      add({ role: "orbo", kind: "text", pose: "happy", text: answer });
    } catch {
      add({ role: "orbo", kind: "text", pose: "caution", text: "I couldn't answer that just now — please try again." });
    } finally {
      setBusy(false);
    }
  }

  // Composer submit: a link/email → scan; anything else → treat as a question for Orbo.
  async function handleSend(text) {
    add({ role: "user", kind: "text", text });
    if (looksCheckable(text)) await scan(text);
    else await askOrbo(text);
  }

  function handleChip(chip) {
    add({ role: "user", kind: "text", text: chip.label });
    add({ role: "orbo", kind: "text", pose: "wave", text: chip.reply });
  }

  // "Ask Orbo more" on a verdict card → invite the user to ask; questions route to askOrbo.
  function handleAskMore(indicatorId) {
    lastIndicatorId.current = indicatorId;
    add({ role: "orbo", kind: "text", pose: "happy",
      text: "Sure — ask me anything about this. For example: why did they send this, are scams like this common, or what should I do now?" });
  }

  // Paperclip upload: read the image, then ASK what to check (don't assume).
  async function handleUploadImage(dataUrl, fileName) {
    add({ role: "user", kind: "image", src: dataUrl, text: fileName });
    setBusy(true);
    try {
      const { urls, emails, summary } = await api.post("/api/vision/extract", { imageDataUrl: dataUrl }, { getToken });
      const choices = [
        ...urls.map((u) => ({ label: `🔗 Check this link: ${shorten(u)}`, value: u })),
        ...emails.map((e) => ({ label: `✉️ Check this sender: ${e}`, value: e })),
      ];

      if (choices.length === 0) {
        add({ role: "orbo", kind: "text", pose: "caution",
          text: `I looked at your image${summary ? ` — ${summary}` : ""}, but couldn't find a link or email to check. If there's a link, try pasting it directly.` });
      } else if (choices.length === 1) {
        // Only one thing found → just check it.
        add({ role: "orbo", kind: "text", pose: "thinking",
          text: `I read your image${summary ? ` — ${summary}` : ""}. Checking ${choices[0].value} now…` });
        await scan(choices[0].value);
      } else {
        // Multiple things found → ASK which one (don't assume).
        add({ role: "orbo", kind: "choices", pose: "wave",
          text: `I read your image${summary ? ` — ${summary}` : ""}. I found a few things — which would you like me to check?`,
          choices });
      }
    } catch {
      add({ role: "orbo", kind: "text", pose: "caution",
        text: "I couldn't read that image just now. Please try again, or paste the link directly." });
    } finally {
      setBusy(false);
    }
  }

  // User picked one of the upload choices → scan it (and drop the buttons).
  async function handleChoice(msgId, choice) {
    add({ role: "user", kind: "text", text: choice.label.replace(/^.*?:\s*/, "") });
    setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, choices: null } : m)));
    await scan(choice.value);
  }

  const empty = messages.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "24px 20px 8px" }}>
        <div style={{ maxWidth: 780, margin: "0 auto" }}>
          {empty ? (
            <EmptyState firstName={firstName} onChip={handleChip} />
          ) : (
            messages.map((m) => {
              if (m.kind === "verdict") return <VerdictMessage key={m.id} indicatorId={m.indicatorId} onAskMore={handleAskMore} />;
              if (m.kind === "image") return (
                <ChatMessage key={m.id} role="user">
                  <img src={m.src} alt={m.text || "uploaded image"}
                    style={{ maxWidth: 220, maxHeight: 220, borderRadius: 12, display: "block" }} />
                </ChatMessage>
              );
              if (m.kind === "choices") return (
                <ChatMessage key={m.id} role="orbo" pose={m.pose}>
                  <OrboBubble>
                    {m.text}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                      {(m.choices ?? []).map((c) => (
                        <button key={c.value} onClick={() => handleChoice(m.id, c)} disabled={busy} style={choiceBtn}>
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </OrboBubble>
                </ChatMessage>
              );
              return (
                <ChatMessage key={m.id} role={m.role} pose={m.pose}>
                  {m.role === "orbo" ? <OrboBubble>{m.text}</OrboBubble> : m.text}
                </ChatMessage>
              );
            })
          )}
        </div>
      </div>
      <Composer onSend={handleSend} onUploadImage={handleUploadImage} disabled={busy} />
    </div>
  );
}

function shorten(u) { return u.length > 48 ? u.slice(0, 45) + "…" : u; }

const choiceBtn = {
  textAlign: "left", padding: "8px 12px", borderRadius: 10, border: "1px solid var(--primary)",
  background: "var(--surface)", color: "var(--primary)", fontWeight: 600, fontSize: "0.88em", cursor: "pointer",
};

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
