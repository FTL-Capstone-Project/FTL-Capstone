import ChatMessage, { OrboBubble, ThinkingBubble } from "./ChatMessage.jsx";
import VerdictCard from "./VerdictCard.jsx";
import { useIndicatorPoll } from "./useIndicatorPoll.js";

// One Orbo response in the chat that resolves a link check: shows the animated
// "Checking…" bubble while the scan runs, then swaps to the verdict card when done.
// bucket → Orbo's pose so the avatar's mood matches the result.
export default function VerdictMessage({ indicatorId, onAskMore }) {
  const { indicator, error } = useIndicatorPoll(indicatorId);
  const status = indicator?.status;

  if (error || status === "error") {
    return (
      <ChatMessage role="orbo" pose="caution">
        <OrboBubble>{error || "I couldn't finish this check — please review the link manually."}</OrboBubble>
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

  const pose = indicator.ai_score >= 70 ? "danger" : indicator.ai_score >= 35 ? "caution" : "safe";
  return (
    <ChatMessage role="orbo" pose={pose}>
      <VerdictCard indicator={indicator} onAskMore={() => onAskMore?.(indicatorId)} />
    </ChatMessage>
  );
}
