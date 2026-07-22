import { useEffect } from "react";
import ChatMessage, { OrboBubble, ThinkingBubble } from "./ChatMessage.jsx";
import VerdictCard from "./VerdictCard.jsx";
import { useIndicatorPoll } from "./useIndicatorPoll.js";

// One Orbo response in the chat that resolves a link check: shows the animated
// "Checking…" bubble while the scan runs, then swaps to the verdict card when done.
// bucket → Orbo's pose so the avatar's mood matches the result.
// cachedIndicator: the finished verdict already saved on this message (set on reopen) — when
// present the poll is skipped. onResolved: called ONCE when polling first reaches a terminal
// state, so Home can cache the result onto the message (then reopening never re-polls).
const VerdictMessage = ({ indicatorId, cachedIndicator, onAskMore, onResolved }) => {
  const { indicator, error } = useIndicatorPoll(indicatorId, cachedIndicator);
  const status = indicator?.status;

  // Cache the verdict back onto the message the moment the scan finishes. Guarded on a terminal
  // status AND cachedIndicator being absent so it fires exactly once — not on every poll tick.
  useEffect(() => {
    if (cachedIndicator) return;
    if (status === "done" || status === "error") onResolved?.(indicator);
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error || status === "error") {
    // Prefer Orbo's specific server-side explanation (e.g. "internal/private link I can't reach").
    const msg = indicator?.ai_verdict || error || "I couldn't finish this check — please review the link manually.";
    return (
      <ChatMessage role="orbo" pose="caution">
        <OrboBubble>{msg}</OrboBubble>
      </ChatMessage>
    );
  }

  if (!indicator || status === "pending" || status === "scanning") {
    return (
      <ChatMessage role="orbo" pose="thinking">
        <ThinkingBubble />
      </ChatMessage>
    );
  }

  // SAFETY score: high = safe → happy Orbo; low = dangerous → stop Orbo. A null score means
  // "unscored" → treat as caution (matches VerdictCard's bucket()), never a false "danger".
  const pose = indicator.ai_score == null ? "caution"
    : indicator.ai_score >= 70 ? "safe" : indicator.ai_score >= 35 ? "caution" : "danger";
  return (
    <ChatMessage role="orbo" pose={pose}>
      <VerdictCard indicator={indicator} indicatorId={indicatorId} onAskMore={() => onAskMore?.(indicatorId)} />
    </ChatMessage>
  );
}

export default VerdictMessage;
