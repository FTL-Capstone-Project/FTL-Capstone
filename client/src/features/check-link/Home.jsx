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

  async function handleSubmit(url) {
    // TODO(David): loading state + error handling.
    const { indicatorId } = await api.post("/api/submissions", { url }, { getToken });
    navigate(`/check/${indicatorId}`);
  }

  return (
    <div style={{ display: "grid", placeItems: "center", gap: 20, paddingTop: 80 }}>
      <OrboAvatar size={72} />
      <h1 style={{ color: "var(--navy)" }}>Hi {firstName} — paste anything suspicious and I'll check it.</h1>
      <SubmitForm onSubmit={handleSubmit} />
    </div>
  );
}
