import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, useUser } from "@clerk/clerk-react";
import { api } from "../../lib/api.js";
import SubmitForm from "./SubmitForm.jsx";
import OrboAvatar from "../../components/OrboAvatar.jsx";

// Home: Orbo greeting + submit bar. On submit, create a submission then go to the result page.
export default function Home() {
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const { user } = useUser();
  const firstName = user?.firstName ?? "there";

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(url) {
    setSubmitting(true);
    setError("");
    try {
      const { indicatorId } = await api.post("/api/submissions", { url }, { getToken });
      navigate(`/check/${indicatorId}`);
    } catch (err) {
      // 400 = bad/invalid input (friendly message); anything else = generic failure.
      setError(err.status === 400
        ? (err.body?.error ?? "That doesn't look like a link or email address.")
        : "Something went wrong reaching Orbo. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div style={{ display: "grid", placeItems: "center", gap: 20, paddingTop: 80 }}>
      <OrboAvatar size={72} />
      <h1 style={{ color: "var(--navy)", textAlign: "center", maxWidth: 560 }}>
        Hi {firstName} — paste anything suspicious and I'll check it.
      </h1>
      <SubmitForm onSubmit={handleSubmit} disabled={submitting} />
      {submitting && <p style={{ color: "var(--text-dim)" }}>Sending to Orbo…</p>}
      {error && <p style={{ color: "var(--danger)", fontSize: "0.9em" }}>⚠ {error}</p>}
    </div>
  );
}
