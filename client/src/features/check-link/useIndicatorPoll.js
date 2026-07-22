import { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { api } from "../../lib/api.js";
import { POLL_INTERVAL_MS } from "../../config/constants.js";

const MAX_POLLS = 60; // ~90s cap: covers the server's ~85s scan window before we give up

// Polls GET /api/indicators/:id until status is "done" or "error".
// Used by each verdict message in the chat (one poll per checked link).
// Returns { indicator, error } — indicator is null until the first response.
// cachedIndicator: if a reopened chat already saved the finished verdict onto its message,
// we seed from it and skip polling entirely (no network call for an already-resolved check).
export const useIndicatorPoll = (indicatorId, cachedIndicator = null) => {
  const { getToken } = useAuth();
  const [indicator, setIndicator] = useState(cachedIndicator);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!indicatorId) return;
    // Already resolved on a previous open → nothing to poll, render straight from the cache.
    if (cachedIndicator && (cachedIndicator.status === "done" || cachedIndicator.status === "error")) return;
    let timer, cancelled = false, tries = 0;

    const poll = async () => {
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
  }, [indicatorId, getToken]); // eslint-disable-line react-hooks/exhaustive-deps

  return { indicator, error };
}
