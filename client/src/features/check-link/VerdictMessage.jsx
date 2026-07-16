import ChatMessage, { OrboBubble, ThinkingBubble } from "./ChatMessage.jsx";
import VerdictCard from "./VerdictCard.jsx";
import { useIndicatorPoll } from "./useIndicatorPoll.js";

// One Orbo response in the chat that resolves a link check: shows the animated
// "Checking…" bubble while the scan runs, then swaps to the verdict card when done.
// bucket → Orbo's pose so the avatar's mood matches the result.
const VerdictMessage = ({ indicatorId, onAskMore }) => {
  const { indicator, error } = useIndicatorPoll(indicatorId);
  const status = indicator?.status;

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

  // SAFETY score: high = safe → happy Orbo; low = dangerous → stop Orbo.
  const pose = indicator.ai_score >= 70 ? "safe" : indicator.ai_score >= 35 ? "caution" : "danger";
  return (
    <ChatMessage role="orbo" pose={pose}>
      <VerdictCard indicator={indicator} onAskMore={() => onAskMore?.(indicatorId)} />
    </ChatMessage>
  );
}

export default VerdictMessage;
