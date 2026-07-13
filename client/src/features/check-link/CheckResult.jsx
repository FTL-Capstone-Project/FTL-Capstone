import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { api } from "../../lib/api.js";
import { POLL_INTERVAL_MS } from "../../config/constants.js";
import VerdictCard from "./VerdictCard.jsx";
import OrboAvatar from "../../components/OrboAvatar.jsx";

// Polls GET /api/indicators/:id until status === "done", then shows the verdict.
export default function CheckResult() {
  const { indicatorId } = useParams();
  const { getToken } = useAuth();
  const [indicator, setIndicator] = useState(null);

  useEffect(() => {
    let timer;
    let cancelled = false;

    async function poll() {
      const data = await api.get(`/api/indicators/${indicatorId}`, { getToken });
      if (cancelled) return;
      setIndicator(data);
      if (data.status !== "done" && data.status !== "error") {
        timer = setTimeout(poll, POLL_INTERVAL_MS); // keep polling while scanning
      }
    }
    poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [indicatorId, getToken]);

  if (!indicator || indicator.status === "pending" || indicator.status === "scanning") {
    return (
      <div style={{ display: "grid", placeItems: "center", gap: 16, paddingTop: 100 }}>
        <OrboAvatar size={64} />
        <p style={{ color: "var(--text-dim)" }}>Orbo is checking this link…</p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", placeItems: "center", paddingTop: 60 }}>
      <VerdictCard indicator={indicator} />
    </div>
  );
}
