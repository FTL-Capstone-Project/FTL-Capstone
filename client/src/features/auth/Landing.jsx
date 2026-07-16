import { Link } from "react-router-dom";

// TODO(Michael): marketing hero + feature cards. Stub for now.
const Landing = () => {
  return (
    <main style={{ maxWidth: 640, margin: "80px auto", textAlign: "center", padding: "0 20px" }}>
      <h1 style={{ color: "var(--navy)", fontSize: "2.4em" }}>🪐 Orbis</h1>
      <p style={{ color: "var(--text-dim)", margin: "12px 0 28px" }}>
        Your inbox, safely in orbit. Check any link or email for scams in seconds.
      </p>
      <Link to="/register">
        <button style={{ background: "var(--primary)", color: "#fff", border: "none",
          padding: "12px 28px", borderRadius: "var(--radius)", fontWeight: 700, cursor: "pointer" }}>
          Get started — free
        </button>
      </Link>
      <p style={{ marginTop: 16, fontSize: "0.9em" }}>
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </main>
  );
}

export default Landing;
