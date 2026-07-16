import { Link } from "react-router-dom";
import { Construction } from "lucide-react";
import OrboAvatar from "./OrboAvatar.jsx";

// Placeholder for routes that aren't built yet (Dashboard, Settings, unknown paths).
// Renders INSIDE the AppShell so the sidebar stays and you can always navigate away
// (no more blank-screen dead-ends). TODO: replace each with the real page.
const ComingSoon = ({ title = "Coming soon", note }) => {
  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 12, textAlign: "center", padding: 40 }}>
      <OrboAvatar pose="thinking" size={96} />
      <h1 style={{ color: "var(--navy)", fontSize: "1.5em", display: "flex", alignItems: "center", gap: 8 }}>
        <Construction size={22} /> {title}
      </h1>
      <p style={{ color: "var(--text-dim)", maxWidth: 420 }}>
        {note ?? "Orbo is still building this part. Check back soon!"}
      </p>
      <Link to="/ask-orbo" style={{ color: "var(--primary)", fontWeight: 700 }}>← Back to Orbo</Link>
    </div>
  );
}

export default ComingSoon;
