import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Layers, ArrowLeft } from "lucide-react";
import { api } from "../../lib/api.js";
import ReportCard from "./ReportCard.jsx";
import ReportDetailModal from "./ReportDetailModal.jsx";
import RetryButton from "../../components/RetryButton.jsx";
import { useStableToken } from "../../lib/useStableToken.js";

// ── feature: reports · campaign detail page · owner: Ozias ── (extends card G1·06)
// One campaign, opened from its row in the analyst triage queue. Route:
//   /reports/campaigns/:campaignId  →  GET /api/campaigns/:id
// The server returns { campaign, indicators, reportCount }, where each `indicators` row is
// the SAME snake_case shape GET /api/history returns — so we render them with the ordinary
// ReportCard and open the ordinary ReportDetailModal (which carries the analyst verdict form
// from card G1·02). Analyst-only + org-scoped is enforced by the backend, not here.

const CampaignDetail = () => {
  const { campaignId } = useParams();
  const getToken = useStableToken();
  const [detail, setDetail] = useState(null);   // { campaign, indicators, reportCount }
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);  // fetch errored / not found → friendly message
  const [selected, setSelected] = useState(null); // report whose modal is open (null = closed)

  // A junk id in the URL (/reports/campaigns/abc) shouldn't become an API call — treat it
  // as "not found" locally. Number("") is 0, so the >0 check also catches an empty param.
  const numericId = Number(campaignId);
  const validId = Number.isInteger(numericId) && numericId > 0;

  // Wrapped in useCallback so the effect below AND the modal's onClose can share one loader
  // without the effect re-running on every render.
  const load = useCallback(async () => {
    if (!validId) { setLoading(false); setFailed(true); return; }
    try {
      const data = await api.get(`/api/campaigns/${numericId}`, { getToken });
      setDetail(data);
      setFailed(false);
    } catch {
      setDetail(null);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [numericId, validId, getToken]);

  useEffect(() => { load(); }, [load]);

  // "Try again" from the error state: reset to the loading state first (load() only clears loading
  // at the end, so without this the failed message would linger while the refetch ran), then reload.
  const retry = () => { setLoading(true); setFailed(false); load(); };

  // Closing the modal reloads the campaign: if the analyst just saved a verdict, the row's
  // score/status behind the modal would otherwise still show the old values.
  const handleModalClose = () => {
    setSelected(null);
    load();
  }

  const campaign = detail?.campaign ?? null;
  const indicators = detail?.indicators ?? [];

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: "0 20px" }}>
      {/* Back to the triage queue this campaign was opened from. */}
      <Link
        to="/reports"
        style={{ color: "var(--text-dim)", fontSize: "0.85em", textDecoration: "none",
          display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 14 }}
      >
        <ArrowLeft size={16} /> Back to triage queue
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <Layers size={22} color="var(--primary)" />
        <h1 style={{ color: "var(--navy)", margin: 0 }}>
          {campaign?.name ?? "Campaign"}
        </h1>
      </div>

      {/* The shared signal is what links these reports together — nullable, so only render
          the line when the analyst actually recorded one. */}
      {campaign?.shared_signal && (
        <p style={{ color: "var(--text-dim)", margin: "0 0 20px", fontSize: "0.9em" }}>
          Shared signal — {campaign.shared_signal}
        </p>
      )}

      {/* Four states: loading, failed/not-found, no renderable reports, or the list. */}
      {loading ? (
        <p style={{ color: "var(--text-dim)" }}>Loading campaign…</p>
      ) : failed ? (
        <p style={{ color: "var(--text-dim)" }}>
          We couldn't load that campaign — it may have been removed.{" "}
          <RetryButton onClick={retry} />
        </p>
      ) : indicators.length === 0 ? (
        <p style={{ color: "var(--text-dim)" }}>No reports are clustered in this campaign yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {indicators.map((report) => (
            <ReportCard
              key={report.indicator_id}
              report={report}
              showReviewStatus={true}
              onOpen={() => setSelected(report)}
            />
          ))}
        </div>
      )}

      {/* Same modal the triage queue uses, so the analyst can record a verdict from here too. */}
      {selected && (
        <ReportDetailModal
          report={selected}
          isMember={true}
          isAnalyst={true}
          onClose={handleModalClose}
        />
      )}
    </div>
  );
}

export default CampaignDetail;
