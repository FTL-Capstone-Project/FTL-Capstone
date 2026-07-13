import { useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { api } from "../../lib/api.js";

// "What does this say?" — sends the sandbox screenshot to Claude vision (server-side)
// and shows a plain-English readout, translating any non-English text.
export default function ScreenshotReader({ screenshotUrl }) {
  const { getToken } = useAuth();
  const [state, setState] = useState("idle"); // idle | loading | done | error
  const [readout, setReadout] = useState("");

  async function read() {
    setState("loading");
    try {
      const { readout } = await api.post("/api/vision/read-screenshot", { screenshotUrl }, { getToken });
      setReadout(readout);
      setState("done");
    } catch {
      setState("error");
    }
  }

  if (state === "idle") {
    return (
      <button onClick={read} style={link}>
        🔍 What does this say? <span style={{ color: "var(--text-dim)", fontWeight: 400 }}>(read &amp; translate)</span>
      </button>
    );
  }
  if (state === "loading") {
    return <p style={{ fontSize: "0.85em", color: "var(--text-dim)", marginTop: 8 }}>Orbo is reading the screenshot…</p>;
  }
  if (state === "error") {
    return (
      <p style={{ fontSize: "0.85em", color: "var(--danger)", marginTop: 8 }}>
        Couldn't read the screenshot. <button onClick={read} style={{ ...link, color: "var(--primary)" }}>Try again</button>
      </p>
    );
  }
  return (
    <div style={{ marginTop: 10, background: "var(--canvas)", border: "1px solid var(--border)",
      borderRadius: 10, padding: "10px 12px", fontSize: "0.9em", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
      {readout}
    </div>
  );
}

const link = {
  marginTop: 8, background: "none", border: "none", padding: 0, cursor: "pointer",
  color: "var(--primary)", fontWeight: 700, fontSize: "0.85em",
};
