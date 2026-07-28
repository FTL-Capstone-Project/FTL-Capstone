import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ListChecks, Search, X } from "lucide-react";
import { api } from "../../lib/api.js";
import ReportCard from "./ReportCard.jsx";
import ReportDetailModal from "./ReportDetailModal.jsx";
import CampaignGroupRow from "./CampaignGroupRow.jsx";
import { sortByPriority, isPending, groupByCampaign, isForwardedEmail } from "./triagePriority.js";
import { useStableToken } from "../../lib/useStableToken.js";

// ── feature: reports · analyst triage queue · owner: Ozias (search added by David) ──
// The ANALYST variant of the Reports page (card G1·05): an org-wide triage queue.
// Reads GET /api/history?org=1&all=1 (analyst mode — returns the WHOLE org queue,
// including pending/investigating items the normal shared-only Team History hides).
// Rows are priority-sorted (open first, then most dangerous, then newest) and can be
// narrowed to just what's awaiting review. Reuses ReportCard + the detail modal (which
// carries the analyst verdict form from card G1·02). Campaign grouping via G1·06.
//
// SEARCH: the queue only ever showed the newest reports, so "have we seen this domain before?"
// meant scrolling. The box below hits GET /api/search?q= (org-scoped, analyst-only) and swaps the
// queue for keyword results — same ReportCard, so a result behaves exactly like a queue row and
// still opens the analyst verdict form.

const Filters = {
  ALL: "all",
  PENDING: "pending",
  EMAIL: "email", // forwarded emails only (report.source === "email")
};

// Must match MIN_QUERY_LENGTH in server/src/features/search/search.service.js — searching on one
// character matches nearly everything, so the server rejects it and we don't bother asking.
const MIN_SEARCH_LENGTH = 2;
// Wait this long after the last keystroke before querying, so typing "paypal" is one request, not six.
const SEARCH_DEBOUNCE_MS = 300;

const TriageQueue = () => {
  const getToken = useStableToken();
  const [reports, setReports] = useState([]);
  const [campaigns, setCampaigns] = useState([]); // for grouping rows by campaign (G1·06)
  const [filter, setFilter] = useState(Filters.ALL); // "all" | "pending"
  const [selected, setSelected] = useState(null);     // open report (null = closed)
  // Queue load status — so a failed fetch shows an error+retry, not "No reports in your org yet"
  // (which would tell an analyst with a real backlog that their queue is empty). Start true.
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // ── search state ───────────────────────────────────────────────────────────
  // Seeded from ?q= so the sidebar search bar can deep-link an analyst straight into results, and
  // so a search is shareable / survives the back button.
  const [params, setParams] = useSearchParams();
  const urlQuery = params.get("q") ?? "";
  const [query, setQuery] = useState(urlQuery);
  const [results, setResults] = useState(null);   // null = not searching; [] = searched, no matches
  const [searching, setSearching] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [searchError, setSearchError] = useState("");

  const term = query.trim();
  const searchActive = term.length >= MIN_SEARCH_LENGTH;

  // Load the full org queue for this analyst. all=1 asks the backend to skip the
  // shared-only privacy gate so pending/investigating items are included.
  const loadQueue = () => {
    setLoading(true); setLoadError(false);
    api.get("/api/history?org=1&all=1", { getToken })
      .then((data) => setReports(data.reports ?? []))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };
  useEffect(() => { loadQueue(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [getToken]);

  // Load this org's campaigns so related reports can cluster under a campaign header.
  // Graceful fallback: if the endpoint is unavailable, we just render rows ungrouped.
  useEffect(() => {
    api.get("/api/campaigns", { getToken })
      .then((data) => setCampaigns(data.campaigns ?? []))
      .catch(() => setCampaigns([]));
  }, [getToken]);

  // Follow ?q= when it changes from OUTSIDE this component (the sidebar search navigating here while
  // we're already mounted — no remount, so without this the box would ignore it).
  useEffect(() => {
    setQuery(urlQuery);
  }, [urlQuery]);

  // Run the search, debounced. A term below the minimum clears results and returns us to the queue.
  useEffect(() => {
    if (!searchActive) {
      setResults(null);
      setSearchError("");
      setTruncated(false);
      return;
    }
    // `cancelled` guards against a slow earlier request landing after a newer one and overwriting
    // its results with stale matches.
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      api.get(`/api/search?q=${encodeURIComponent(term)}`, { getToken })
        .then((data) => {
          if (cancelled) return;
          setResults(data.reports ?? []);
          setTruncated(Boolean(data.truncated));
          setSearchError("");
        })
        .catch((e) => {
          if (cancelled) return;
          setResults([]);
          setSearchError(e.body?.error || "Couldn't run that search just now.");
        })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, SEARCH_DEBOUNCE_MS);

    return () => { cancelled = true; clearTimeout(timer); };
    // getToken comes from useStableToken, so its identity never changes — listing it here cannot
    // re-arm the debounce timer. Keyed on the search term, which is what should drive a re-query.
  }, [term, searchActive, getToken]);

  // Clearing the box also drops ?q= from the URL, so a refresh doesn't resurrect the search.
  const clearSearch = () => {
    setQuery("");
    if (params.has("q")) {
      const next = new URLSearchParams(params);
      next.delete("q");
      setParams(next, { replace: true });
    }
  }

  // Counts shown on the pills — two passes over the list, so memoized alongside everything else.
  const { pendingCount, emailCount } = useMemo(() => ({
    pendingCount: reports.filter(isPending).length,
    emailCount: reports.filter(isForwardedEmail).length,
  }), [reports]);

  // Apply the selected filter first, THEN priority-sort, THEN cluster by campaign.
  // Memoized because this whole chain — filter, then a priority sort, then campaign grouping — ran on
  // EVERY render, including ones triggered by opening the detail modal or typing in the search box.
  // It also keeps `items` referentially stable so the memoized ReportCard rows can skip re-rendering.
  const items = useMemo(() => {
    const filtered =
      filter === Filters.PENDING ? reports.filter(isPending)
        : filter === Filters.EMAIL ? reports.filter(isForwardedEmail)
        : reports;
    return groupByCampaign(sortByPriority(filtered), campaigns);
  }, [reports, filter, campaigns]);

  const PILLS = [
    { value: Filters.ALL, label: `All reports (${reports.length})` },
    { value: Filters.PENDING, label: `Pending review (${pendingCount})` },
    { value: Filters.EMAIL, label: `Forwarded (${emailCount})` },
  ];

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: "0 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <ListChecks size={22} color="var(--primary)" />
        <h1 style={{ color: "var(--navy)", margin: 0 }}>Triage queue</h1>
      </div>
      <p style={{ color: "var(--text-dim)", margin: "0 0 20px", fontSize: "0.9em" }}>
        Organization-wide view — highest priority first
      </p>

      {/* Keyword search over the org's whole threat history (not just what's in the queue). */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid var(--border)",
        borderRadius: 10, padding: "9px 12px", marginBottom: 16, background: "var(--surface)" }}>
        <Search size={16} color="var(--text-dim)" style={{ flexShrink: 0 }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search your organization's threat history"
          placeholder="Search past reports by URL, domain, or keyword…"
          // color:var(--text) so typed text stays visible in dark mode.
          style={{ border: "none", outline: "none", background: "transparent", fontSize: "0.9em",
            width: "100%", color: "var(--text)" }} />
        {query && (
          <button onClick={clearSearch} aria-label="Clear search"
            style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--text-dim)",
              display: "inline-flex", padding: 0 }}>
            <X size={15} />
          </button>
        )}
      </div>

      {searchActive ? (
        // ── search results view ────────────────────────────────────────────────
        <>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between",
            gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
            <p style={{ color: "var(--text-dim)", margin: 0, fontSize: "0.9em" }}>
              {searching
                ? `Searching for "${term}"…`
                : `${results?.length ?? 0} result${results?.length === 1 ? "" : "s"} for "${term}"`}
            </p>
            <button onClick={clearSearch}
              style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0,
                color: "var(--primary)", fontWeight: 600, fontSize: "0.85em" }}>
              Back to queue
            </button>
          </div>

          {truncated && (
            <p style={{ color: "var(--review)", fontSize: "0.85em", margin: "0 0 12px" }}>
              Showing the first {results?.length} matches — narrow your search to see more.
            </p>
          )}
          {searchError && (
            <p role="alert" style={{ color: "var(--danger)", fontSize: "0.9em" }}>{searchError}</p>
          )}

          {!searching && !searchError && results?.length === 0 ? (
            <p style={{ color: "var(--text-dim)" }}>
              Nothing in your organization's history matches "{term}".
            </p>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {(results ?? []).map((report) => (
                <ReportCard
                  key={report.indicator_id}
                  report={report}
                  showReviewStatus={true}
                  onOpen={() => setSelected(report)}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        // ── normal queue view ──────────────────────────────────────────────────
        <>
          {/* Filter pills: All vs. just what's awaiting a verdict. */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
            {PILLS.map((p) => {
              const isActive = filter === p.value;
              return (
                <button
                  key={p.value}
                  onClick={() => setFilter(p.value)}
                  style={{ cursor: "pointer", fontSize: "0.85em", fontWeight: 600, padding: "6px 16px",
                    borderRadius: 999, border: "1px solid var(--border)",
                    background: isActive ? "var(--primary)" : "var(--surface)",
                    color: isActive ? "#fff" : "var(--text-dim)" }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* The queue. Loading / error FIRST, so a failed fetch never reads as "queue is empty"
              to an analyst who actually has a backlog. */}
          {loading ? (
            <p style={{ color: "var(--text-dim)" }}>Loading the queue…</p>
          ) : loadError ? (
            <p style={{ color: "var(--text-dim)" }}>
              Couldn't load the triage queue just now.{" "}
              <button onClick={loadQueue}
                style={{ background: "none", border: "none", padding: 0, color: "var(--primary)",
                  fontWeight: 700, cursor: "pointer", font: "inherit" }}>
                Try again
              </button>
            </p>
          ) : reports.length === 0 ? (
            <p style={{ color: "var(--text-dim)" }}>
              No reports in your organization yet.
            </p>
          ) : items.length === 0 ? (
            <p style={{ color: "var(--text-dim)" }}>Nothing pending review — the queue is clear.</p>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {items.map((item) =>
                item.type === "campaign" ? (
                  <CampaignGroupRow
                    key={`campaign-${item.campaignId}`}
                    name={item.name}
                    campaignId={item.campaignId}
                    reports={item.reports}
                    onOpen={(r) => setSelected(r)}
                  />
                ) : (
                  <ReportCard
                    key={item.report.indicator_id}
                    report={item.report}
                    showReviewStatus={true}
                    onOpen={() => setSelected(item.report)}
                  />
                )
              )}
            </div>
          )}
        </>
      )}

      {/* The analyst opens a report to author/update its verdict (form from G1·02). */}
      {selected && (
        <ReportDetailModal
          report={selected}
          isMember={true}
          isAnalyst={true}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

export default TriageQueue;
