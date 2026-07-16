// "Why Orbo flagged this" — list of evidence rows. Each: { text, severity: safe|review|dangerous }.
const DOT = { safe: "var(--safe)", review: "var(--review)", dangerous: "var(--danger)" };

const EvidenceList = ({ items = [] }) => {
  if (!items.length) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: "0.8em", fontWeight: 700, color: "var(--text-dim)",
        textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
        Why Orbo flagged this
      </div>
      <ul style={{ listStyle: "none", display: "grid", gap: 6 }}>
        {items.map((it, i) => (
          <li key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%",
              background: DOT[it.severity] ?? "var(--text-dim)" }} />
            <span style={{ fontSize: "0.92em" }}>{it.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default EvidenceList;
