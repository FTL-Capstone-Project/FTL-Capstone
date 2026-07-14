import { useState, useRef, useEffect } from "react";
import { useAuth, useUser } from "@clerk/clerk-react";
import { api } from "../../lib/api.js";
import { Link2, Mail } from "lucide-react";
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

  // Image submitted (from the composer) WITH an optional instruction. The image was staged
  // first and only sent when the user hit submit — so we now read it + honor their note.
  async function handleSendImage(dataUrl, instruction, fileName) {
    add({ role: "user", kind: "image", src: dataUrl, text: fileName });
    if (instruction) add({ role: "user", kind: "text", text: instruction });
    setBusy(true);
    try {
      const { urls, emails, summary } = await api.post("/api/vision/extract", { imageDataUrl: dataUrl }, { getToken });

      // Decide what to check based on the user's instruction.
      const wantsSender = /\b(sender|from|who sent|email address|address)\b/i.test(instruction || "");
      const wantsLink = /\b(link|url|website|site|address)\b/i.test(instruction || "");
      const hasUrl = urls.length > 0;
      const hasEmail = emails.length > 0;

      // If they only want to talk about the image (not scan), or nothing to scan → answer conversationally.
      if (!hasUrl && !hasEmail) {
        // No scannable target: answer the instruction about the image itself via Orbo.
        const q = instruction
          ? `${instruction} (About an image the user uploaded — summary: ${summary || "n/a"})`
          : `The user uploaded an image (summary: ${summary || "n/a"}) but there's no link or email in it. Briefly say what you see and ask what they'd like checked.`;
        await askOrbo(q);
        return;
      }

      // Explicit "check the sender" → the email; "check the link" → the URL.
      if (wantsSender && hasEmail) { await scanWithNote(emails[0], summary); return; }
      if (wantsLink && hasUrl) { await scanWithNote(urls[0], summary); return; }

      // No clear instruction: if exactly one target, just check it; if both, ask which.
      const choices = [
        ...urls.map((u) => ({ icon: "link", label: `Check this link: ${shorten(u)}`, value: u })),
        ...emails.map((e) => ({ icon: "mail", label: `Check this sender: ${e}`, value: e })),
      ];
      if (choices.length === 1) {
        await scanWithNote(choices[0].value, summary);
      } else {
        add({ role: "orbo", kind: "choices", pose: "wave",
          text: `I read your image${summary ? ` — ${summary}` : ""}. I found a few things — which would you like me to check?`,
          choices });
      }
    } catch (err) {
      // A network/2xx failure (server down or unreachable) reads differently from a
      // genuine "couldn't parse the image" — be honest about which.
      const unreachable = err?.status == null || err.status >= 500 || err.status === 503;
      add({ role: "orbo", kind: "text", pose: "caution",
        text: unreachable
          ? "I couldn't reach my analysis service just now — it may be starting up or offline. Please try again in a moment."
          : "I couldn't read that image. Try a clearer screenshot, or paste the link/sender directly." });
    } finally {
      setBusy(false);
    }
  }

  // Announce what Orbo found, then check it. (setBusy already true from the image flow.)
  async function scanWithNote(target, summary) {
    add({ role: "orbo", kind: "text", pose: "thinking",
      text: `I read your image${summary ? ` — ${summary}` : ""}. Checking ${target} now…` });
    await checkTarget(target);
  }

  // Route a target: a URL → sandbox scan; an email address → ask Orbo about the sender
  // (urlscan can't sandbox an email, so we assess sender legitimacy conversationally).
  async function checkTarget(target) {
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target.trim());
    if (isEmail) await askOrbo(`Is this email sender legitimate or a likely scam: ${target}? Explain how to tell.`);
    else await scan(target);
  }

  // User picked one of the upload choices → check it (and drop the buttons).
  async function handleChoice(msgId, choice) {
    add({ role: "user", kind: "text", text: choice.value });
    setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, choices: null } : m)));
    await checkTarget(choice.value);
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
                          {c.icon === "mail" ? <Mail size={15} /> : <Link2 size={15} />}
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
      <Composer onSend={handleSend} onSendImage={handleSendImage} disabled={busy} />
    </div>
  );
}

function shorten(u) { return u.length > 48 ? u.slice(0, 45) + "…" : u; }

const choiceBtn = {
  display: "flex", alignItems: "center", gap: 8, textAlign: "left", padding: "8px 12px", borderRadius: 10,
  border: "1px solid var(--primary)", background: "var(--surface)", color: "var(--primary)",
  fontWeight: 600, fontSize: "0.88em", cursor: "pointer",
};

// Empty Home = the wireframe's greeting: the big planet-Orbo mascot, "Hi {name}" with a
// small waving Orbo used AS the emoji at the end (replacing the old Apple 👋), subtitle,
// and the three prompt-chip pills. No Apple emojis (per design).
function EmptyState({ firstName, onChip }) {
  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 14, textAlign: "center", paddingBottom: "8vh" }}>
      <OrboAvatar pose="happy" size={120} />
      <h1 style={{ color: "var(--navy)", fontSize: "1.8em", fontWeight: 800,
        display: "inline-flex", alignItems: "center", gap: 8 }}>
        Hi {firstName}
        <OrboAvatar pose="wave" size={38} />
      </h1>
      <p style={{ color: "var(--text-dim)", marginTop: -6 }}>Paste anything suspicious and I'll check it for you.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", marginTop: 6 }}>
        {PROMPT_CHIPS.map((c) => (
          <button key={c.label} onClick={() => onChip(c)}
            style={{ padding: "9px 18px", borderRadius: 22, border: "1px solid var(--border)",
              background: "var(--surface)", color: "var(--navy)", fontSize: "0.9em", cursor: "pointer",
              boxShadow: "var(--shadow)" }}>
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
