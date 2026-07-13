import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { api } from "../../lib/api.js";
import { POLL_INTERVAL_MS } from "../../config/constants.js";
import VerdictCard from "./VerdictCard.jsx";
import OrboAvatar from "../../components/OrboAvatar.jsx";

const MAX_POLLS = 40; // safety cap (~60s) so a stuck scan can't poll forever

// Polls GET /api/indicators/:id until status === "done", then shows the verdict.
export default function CheckResult() {
  const { indicatorId } = useParams();
  const { getToken } = useAuth();
  const [indicator, setIndicator] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let timer;
    let cancelled = false;
    let tries = 0;

    async function poll() {
      try {
        const data = await api.get(`/api/indicators/${indicatorId}`, { getToken });
        if (cancelled) return;
        setIndicator(data);
        tries += 1;
        const finished = data.status === "done" || data.status === "error";
        if (!finished && tries < MAX_POLLS) {
          timer = setTimeout(poll, POLL_INTERVAL_MS); // keep polling while scanning
        } else if (!finished) {
          setError("This check is taking longer than expected. Please try again.");
        }
      } catch {
        if (!cancelled) setError("Couldn't reach Orbo to get the result. Please try again.");
      }
    }
    poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [indicatorId, getToken]);

  // Error / timeout / server 'error' status
  if (error || indicator?.status === "error") {
    return (
      <div style={{ display: "grid", placeItems: "center", gap: 12, paddingTop: 100, textAlign: "center" }}>
        <OrboAvatar pose="caution" size={96} />
        <p style={{ color: "var(--danger)" }}>{error || "Orbo couldn't finish this check."}</p>
        <Link to="/home">← Try another link</Link>
      </div>
    );
  }

  // Still scanning
  if (!indicator || indicator.status === "pending" || indicator.status === "scanning") {
    return (
      <div style={{ display: "grid", placeItems: "center", gap: 16, paddingTop: 100 }}>
        <OrboAvatar pose="thinking" size={110} />
        <p style={{ color: "var(--text-dim)" }}>Orbo is checking this link…</p>
      </div>
    );
  }

  // Done → verdict
  return (
    <div style={{ display: "grid", placeItems: "center", gap: 16, paddingTop: 60 }}>
      <VerdictCard indicator={indicator} />
      <Link to="/home">← Check another link</Link>
    </div>
  );
}
