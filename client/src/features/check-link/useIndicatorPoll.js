import { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { api } from "../../lib/api.js";
import { POLL_INTERVAL_MS } from "../../config/constants.js";

const MAX_POLLS = 40; // ~60s cap so a stuck scan can't poll forever

// Polls GET /api/indicators/:id until status is "done" or "error".
// Used by each verdict message in the chat (one poll per checked link).
// Returns { indicator, error } — indicator is null until the first response.
export function useIndicatorPoll(indicatorId) {
  const { getToken } = useAuth();
  const [indicator, setIndicator] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!indicatorId) return;
    let timer, cancelled = false, tries = 0;

    async function poll() {
      try {
        const data = await api.get(`/api/indicators/${indicatorId}`, { getToken });
        if (cancelled) return;
        setIndicator(data);
        tries += 1;
        const finished = data.status === "done" || data.status === "error";
        if (!finished && tries < MAX_POLLS) {
          timer = setTimeout(poll, POLL_INTERVAL_MS);
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

  return { indicator, error };
}
