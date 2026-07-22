import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth, useUser } from "@clerk/clerk-react";
import { api } from "../../lib/api.js";
import { Link2, Mail, FileSearch } from "lucide-react";
import OrboAvatar from "../../components/OrboAvatar.jsx";
import Composer from "./Composer.jsx";
import ChatMessage, { OrboBubble, ThinkingBubble } from "./ChatMessage.jsx";
import VerdictMessage from "./VerdictMessage.jsx";
import VerdictCard from "./VerdictCard.jsx";
import Markdown from "./Markdown.jsx";
import { getConversation, saveConversation, newConversationId } from "../../lib/conversations.js";

// Looks like a URL or an email address? (so we know whether to SCAN it vs treat it as
// a question for Orbo.)
const looksCheckable = (text) => {
  const t = text.trim();
  if (/\s/.test(t) && !/^https?:\/\//i.test(t)) return false; // has spaces → it's a sentence/question
  const urlish = /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+.*$/i.test(t);
  const emailish = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
  return urlish || emailish;
}

// Common TLDs — used to tell a space-polluted domain ("Ucoz. com") from ordinary prose
// ("Mr. Smith"). Conservative on purpose: we only auto-collapse the space when the tail is
// a real TLD, so we never mangle a sentence.
const COMMON_TLDS = new Set([
  "com", "co", "net", "org", "io", "gov", "edu", "info", "biz", "app", "dev", "me", "us",
  "uk", "ru", "cn", "de", "pt", "nu", "ca", "au", "nz", "jp", "in", "br", "mx", "eu", "tv",
  "cc", "xyz", "online", "site", "ai", "gg", "to", "ly",
]);

// People paste domains with a stray space after the dot ("Ucoz. com", "amazon . com").
// That space used to demote the whole thing to a CHAT message (no scan). Here we collapse
// spaces around dots/@ — but ONLY accept the result if it's a single space-free token whose
// final label is a known TLD. So "Ucoz. com" → "Ucoz.com" (scanned), while "is this legit?
// x.com" (still multi-word) and "Mr. Smith" (tail not a TLD) are left as-is → chat.
const collapseSpacedDomain = (text) => {
  const original = text.trim();
  const collapsed = original.replace(/\s*\.\s*/g, ".").replace(/\s*@\s*/g, "@");
  if (/\s/.test(collapsed)) return original;            // still multi-word → a real sentence
  const tld = collapsed.split(".").pop()?.toLowerCase();
  return COMMON_TLDS.has(tld) ? collapsed : original;   // only trust it if the tail is a TLD
}

// Module-level (survives Home unmount/remount as you navigate around the app): the id of the
// last conversation the user was in, so returning to /ask-orbo with no ?c= resumes it.
let lastActiveConvoId = null;

// A webmail/inbox URL (the mail client's own address bar in a screenshot), not the suspicious
// link — filtered out of "Get report" candidates.
const isWebmailUrl = (u = "") => {
  return /(^|\/\/|\.)(mail\.google|gmail|outlook\.(live|office)|mail\.yahoo|proton\.me|icloud)\b/i.test(u);
}

// Pull the first URL or email out of ANY message (even a sentence like "is this legit? https://…").
// Used to offer a "Get report" scan button under Orbo's chat reply.
const extractTarget = (text) => {
  const url = text.match(/https?:\/\/[^\s]+/i);
  if (url) return url[0].replace(/[.,)\]]+$/, ""); // trim trailing punctuation
  const email = text.match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
  if (email) return email[0].replace(/[.,)\]]+$/, "");
  return null;
}

const PROMPT_CHIPS = [
  { label: "Check a link", reply: "Sure! Paste the link you want me to check and I'll take a look." },
  { label: "Is this email a scam?", reply: "I can help with that. Paste the sender's email address or the suspicious link from the message." },
  { label: "Verify a sender", reply: "Go ahead and paste the sender's email address — I'll tell you if it looks legit." },
];

const Home = () => {
  const { getToken } = useAuth();
  const { user } = useUser();
  const firstName = user?.firstName ?? "there";
  const [params, setParams] = useSearchParams();

  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);
  const nextId = useRef(1);
  const lastIndicatorId = useRef(null); // context for follow-up "ask Orbo" questions
  const convoId = useRef(null);          // active conversation id (persisted in localStorage)
  const deepLinkDone = useRef(false);    // guard so ?check= runs once, not on every param change
  const add = (m) => setMessages((prev) => [...prev, { id: nextId.current++, ...m }]);

  // Resolve which conversation to show, in priority order:
  //   1) ?new=1  → always start a fresh chat (the "New check" button)
  //   2) ?c=<id> → reopen that specific conversation (clicking a Recent)
  //   3) nothing → resume the LAST active chat (so navigating away to Reports and back
  //      keeps your conversation instead of wiping it). Only "New check" starts over.
  useEffect(() => {
    const wantNew = params.get("new") === "1";
    if (wantNew) {
      convoId.current = null;
      lastActiveConvoId = null;
      nextId.current = 1;
      setMessages([]);
      const p = new URLSearchParams(params); p.delete("new"); setParams(p, { replace: true });
      return;
    }
    const cid = params.get("c") || lastActiveConvoId; // fall back to the last chat we were in
    if (cid) {
      const convo = getConversation(cid);
      if (convo) {
        convoId.current = cid;
        lastActiveConvoId = cid;
        const msgs = convo.messages || [];
        nextId.current = Math.max(0, ...msgs.map((m) => m.id || 0)) + 1;
        setMessages(msgs);
        // reflect it in the URL so a refresh/deep-link still works
        if (params.get("c") !== cid) { const p = new URLSearchParams(params); p.set("c", cid); setParams(p, { replace: true }); }
        return;
      }
    }
    // truly fresh (no history yet). id created lazily on first message so empty chats aren't saved.
    convoId.current = null;
    nextId.current = 1;
    setMessages([]);
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deep-link from the browser extension's "See why": /ask-orbo?check=<url-or-email> auto-runs a
  // full check on arrival, so the inline pre-verdict flows straight into the real report. Runs
  // ONCE (guarded), and strips the param afterward so a refresh doesn't re-scan.
  useEffect(() => {
    if (deepLinkDone.current) return;
    const target = params.get("check");
    if (!target) return;
    deepLinkDone.current = true;
    const p = new URLSearchParams(params); p.delete("check"); setParams(p, { replace: true });
    add({ role: "user", kind: "text", text: target });
    checkTarget(target); // URL → scan verdict card, email → sender report (same routing as a paste)
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist the thread whenever it changes (creating the conversation on first message).
  useEffect(() => {
    if (messages.length === 0) return;
    if (!convoId.current) {
      convoId.current = newConversationId();
      const p = new URLSearchParams(params); p.set("c", convoId.current); setParams(p, { replace: true });
    }
    lastActiveConvoId = convoId.current; // remember for when we come back without a ?c=
    saveConversation({ id: convoId.current, messages });
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages]);

  // Scan a URL/email → verdict card. (shared by paste, chip, and upload-choice paths)
  const scan = async (target) => {
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
  // If the question CONTAINED a link/email (e.g. "is this legit? https://…"), attach it
  // so the reply can offer a "Get report" button to run the real scan.
  const askOrbo = async (question, scanTarget = null) => {
    setBusy(true);
    try {
      const history = messages.filter((m) => m.kind === "text").slice(-6).map((m) => ({ role: m.role, text: m.text }));
      // If the question is about a NEW target (a link/email in it), don't attach the previous
      // scan's context — that's what made Orbo drag the old topic in. Only pass indicatorId
      // when this is a genuine follow-up about the last checked thing.
      const indicatorId = scanTarget ? null : lastIndicatorId.current;
      const { answer } = await api.post("/api/ask-orbo",
        { indicatorId, question, history }, { getToken });
      add({ role: "orbo", kind: "text", pose: "happy", text: answer, scanTarget });
    } catch {
      add({ role: "orbo", kind: "text", pose: "caution", text: "I couldn't answer that just now — please try again." });
    } finally {
      setBusy(false);
    }
  }

  // Composer submit: a bare link/email → check it; a sentence → ask Orbo (but if it has a
  // link/email inside, pass it along so Orbo can offer a "Get report" scan button).
  // checkTarget() routes an email → sender report and a URL → sandbox scan (the scanner rejects
  // emails), so a typed "foo@bar.com" gets a report instead of a failed URL scan.
  const handleSend = async (text) => {
    add({ role: "user", kind: "text", text });
    // Repair a stray space in an otherwise-bare domain ("Ucoz. com" → "Ucoz.com") so it gets
    // SCANNED instead of silently falling through to chat. Real sentences are left untouched.
    const repaired = collapseSpacedDomain(text);
    if (looksCheckable(repaired)) await checkTarget(repaired);
    else await askOrbo(text, extractTarget(text));
  }

  const handleChip = (chip) => {
    add({ role: "user", kind: "text", text: chip.label });
    add({ role: "orbo", kind: "text", pose: "wave", text: chip.reply });
  }

  // Keep ONLY the immutable, non-sensitive parts of a finished verdict for the cache. We drop:
  //   • screenshot_url / final_url / final_host — caller-only detail the server IDOR-gates to the
  //     submitter; localStorage is shared across users on one device, so we never persist them.
  //   • report_count / global_review_status / reported_count — global, mutable counters that go
  //     stale the moment anyone else reports the link; the live card reads those fresh instead.
  const cacheVerdict = (v) => ({
    status: v.status,
    ai_score: v.ai_score ?? null,
    ai_verdict: v.ai_verdict ?? null,
    ai_confidence: v.ai_confidence ?? null,
    evidence: Array.isArray(v.evidence) ? v.evidence : [],
  });

  // A verdict scan just finished → cache that safe snapshot onto the message so reopening the
  // chat renders it instantly instead of re-polling for ~90s. Guarded: match by message id
  // (indicatorIds can repeat) and only write when the field is still empty, so this fires once
  // and can't loop the [messages] save effect. Length is unchanged, so the sidebar won't reorder.
  const handleVerdictResolved = (msgId, resolved) => {
    if (!resolved) return;
    setMessages((prev) => prev.map((m) =>
      (m.id === msgId && m.kind === "verdict" && !m.indicator) ? { ...m, indicator: cacheVerdict(resolved) } : m));
  }

  // "Ask Orbo more" on a verdict card → invite the user to ask; questions route to askOrbo.
  const handleAskMore = (indicatorId) => {
    lastIndicatorId.current = indicatorId;
    add({ role: "orbo", kind: "text", pose: "happy",
      text: "Sure — ask me anything about this. For example: why did they send this, are scams like this common, or what should I do now?" });
  }

  // Image submitted (from the composer) WITH an optional instruction. The image was staged
  // first and only sent when the user hit submit — so we now read it + honor their note.
  const handleSendImage = async (dataUrl, instruction, fileName) => {
    add({ role: "user", kind: "image", src: dataUrl, text: fileName });
    if (instruction) add({ role: "user", kind: "text", text: instruction });
    setBusy(true);
    try {
      const raw = await api.post("/api/vision/extract", { imageDataUrl: dataUrl }, { getToken });
      // Drop webmail/inbox URLs — a screenshot of an email shows the mail client's own address
      // bar (mail.google.com, outlook…), which isn't the suspicious link and can't be scanned.
      const urls = (raw.urls || []).filter((u) => !isWebmailUrl(u));
      // Validate model-extracted emails before we use any (SEC-LOW #4): emails[0] gets
      // folded into a downstream request, so only keep well-formed addresses.
      const emails = (raw.emails || []).filter((e) => typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim()));
      const summary = raw.summary || "";

      // Decide what to check based on the user's instruction.
      const wantsSender = /\b(sender|from|who sent|email address|address)\b/i.test(instruction || "");
      const wantsLink = /\b(link|url|website|site|address)\b/i.test(instruction || "");
      const hasUrl = urls.length > 0;
      const hasEmail = emails.length > 0;

      // A scannable link found in the image → offer it as the "Get report" target on
      // whatever Orbo answers, so the user can always escalate to a full scan (interaction key).
      const reportTarget = hasUrl ? urls[0] : null;

      // Nothing scannable, but the image IS a message/login page → the server already scored the
      // red-flag signals it saw into a verdict card. This is the win: a link-LESS phishing
      // screenshot ("your account is locked, confirm your password") is now scorable, not a shrug.
      if (!hasUrl && !hasEmail) {
        if (raw.report) {
          add({ role: "orbo", kind: "senderReport", indicator: raw.report,
            pose: raw.report.ai_score >= 70 ? "safe" : raw.report.ai_score >= 35 ? "caution" : "danger" });
          return;
        }
        // Not a message (an unrelated photo) → just chat about what we see.
        const q = instruction
          ? `${instruction} (About an image the user uploaded — summary: ${summary || "n/a"})`
          : `The user uploaded an image (summary: ${summary || "n/a"}) but there's no link or email in it. Briefly say what you see and ask what they'd like checked.`;
        await askOrbo(q, reportTarget);
        return;
      }

      // Asked about the SENDER → go straight to the ONE authoritative sender report
      // (not a separate conversational guess). Producing a chat answer AND a report from
      // two independent Claude calls let them contradict each other (chat said
      // "suspicious", card said "Safe 82" for the same address). checkTarget() below runs
      // the single sender-report verdict, same as a typed email address.
      if (wantsSender && hasEmail) { await checkTargetWithNote(emails[0], summary); return; }
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
  const scanWithNote = async (target, summary) => {
    add({ role: "orbo", kind: "text", pose: "thinking",
      text: `I read your image${summary ? ` — ${summary}` : ""}. Checking ${target} now…` });
    await checkTarget(target);
  }

  // Same as scanWithNote but for the sender path — routes through checkTarget so an email
  // yields the single authoritative sender report (no separate conversational verdict).
  const checkTargetWithNote = async (target, summary) => {
    add({ role: "orbo", kind: "text", pose: "thinking",
      text: `I read your image${summary ? ` — ${summary}` : ""}. Checking ${target} now…` });
    await checkTarget(target);
  }

  // Route a target: a URL → sandbox scan (verdict card); an email → formal sender report card.
  const checkTarget = async (target) => {
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target.trim());
    if (isEmail) {
      setBusy(true);
      try {
        const report = await api.post("/api/ask-orbo/sender-report", { email: target }, { getToken });
        add({ role: "orbo", kind: "senderReport", indicator: report,
          pose: report.ai_score >= 70 ? "safe" : report.ai_score >= 35 ? "caution" : "danger" });
      } catch {
        add({ role: "orbo", kind: "text", pose: "caution", text: "I couldn't build a sender report just now — please try again." });
      } finally { setBusy(false); }
    } else {
      await scan(target);
    }
  }

  // "Get report" button under a chat reply → produce a formal report card, and drop the button.
  // A URL → sandbox scan (verdict card). An email → a structured SENDER report card.
  const handleGetReport = async (msgId, target) => {
    setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, scanTarget: null } : m)));
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target.trim());
    if (!isEmail) { await scan(target); return; }
    // Sender report: Claude → verdict-shaped object → render as a card in the chat.
    setBusy(true);
    try {
      const report = await api.post("/api/ask-orbo/sender-report", { email: target }, { getToken });
      add({ role: "orbo", kind: "senderReport", indicator: report,
        pose: report.ai_score >= 70 ? "safe" : report.ai_score >= 35 ? "caution" : "danger" });
    } catch {
      add({ role: "orbo", kind: "text", pose: "caution", text: "I couldn't build a sender report just now — please try again." });
    } finally {
      setBusy(false);
    }
  }

  // User picked one of the upload choices → check it (and drop the buttons).
  const handleChoice = async (msgId, choice) => {
    add({ role: "user", kind: "text", text: choice.value });
    setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, choices: null } : m)));
    await checkTarget(choice.value);
  }

  const empty = messages.length === 0;
  // A verdict message runs its OWN polling animation, so don't stack a second
  // "thinking" bubble under it; only show the standalone one for chat/image replies.
  const lastKind = messages[messages.length - 1]?.kind;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "24px 20px 8px" }}>
        <div style={{ maxWidth: 780, margin: "0 auto" }}>
          {empty ? (
            <EmptyState firstName={firstName} onChip={handleChip} />
          ) : (
            messages.map((m) => {
              // Scope the React key to the CONVERSATION, not just the message id. Message ids
              // reset to 1 in every chat, so a bare key={m.id} collides across conversations —
              // React then REUSES the previous chat's component instance (keeping its stale
              // local state, e.g. the old screenshot) instead of remounting. Composing with the
              // conversation id makes the key unique per chat, forcing a proper remount on switch.
              const key = `${convoId.current ?? "c"}:${m.id}`;
              if (m.kind === "verdict") return (
                <VerdictMessage key={key} indicatorId={m.indicatorId} cachedIndicator={m.indicator}
                  onAskMore={handleAskMore} onResolved={(resolved) => handleVerdictResolved(m.id, resolved)} />
              );
              if (m.kind === "senderReport") return (
                <ChatMessage key={key} role="orbo" pose={m.pose}>
                  <VerdictCard indicator={m.indicator} onAskMore={() => handleAskMore(null)} />
                </ChatMessage>
              );
              if (m.kind === "image") return (
                <ChatMessage key={key} role="user">
                  <img src={m.src} alt={m.text || "uploaded image"}
                    style={{ maxWidth: 220, maxHeight: 220, borderRadius: 12, display: "block" }} />
                </ChatMessage>
              );
              if (m.kind === "choices") return (
                <ChatMessage key={key} role="orbo" pose={m.pose}>
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
                <ChatMessage key={key} role={m.role} pose={m.pose}>
                  {m.role === "orbo" ? (
                    <OrboBubble>
                      <Markdown text={m.text} />
                      {m.scanTarget && (
                        <button onClick={() => handleGetReport(m.id, m.scanTarget)} disabled={busy}
                          style={{ ...choiceBtn, marginTop: 10 }}>
                          <FileSearch size={15} /> Get a full report on {shorten(m.scanTarget)}
                        </button>
                      )}
                    </OrboBubble>
                  ) : m.text}
                </ChatMessage>
              );
            })
          )}
          {/* Orbo is thinking (chat questions / image reads) — the animated dots. */}
          {busy && !empty && lastKind !== "verdict" && (
            <ChatMessage role="orbo" pose="thinking">
              <ThinkingBubble label="Orbo is thinking…" />
            </ChatMessage>
          )}
        </div>
      </div>
      <Composer onSend={handleSend} onSendImage={handleSendImage} disabled={busy} />
    </div>
  );
}

const shorten = (u) => (u.length > 48 ? u.slice(0, 45) + "…" : u);

const choiceBtn = {
  display: "flex", alignItems: "center", gap: 8, textAlign: "left", padding: "8px 12px", borderRadius: 10,
  border: "1px solid var(--primary)", background: "var(--surface)", color: "var(--primary)",
  fontWeight: 600, fontSize: "0.88em", cursor: "pointer",
};

// Empty Home = the wireframe's greeting: the big planet-Orbo mascot, "Hi {name}" with a
// small waving Orbo used AS the emoji at the end (replacing the old Apple 👋), subtitle,
// and the three prompt-chip pills. No Apple emojis (per design).
const EmptyState = ({ firstName, onChip }) => {
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

export default Home;
