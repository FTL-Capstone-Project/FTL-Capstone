import { useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { BookOpen } from "lucide-react";
import { api } from "../../lib/api.js";
import Markdown from "./Markdown.jsx";

// "Explain this page" — sends the sandbox screenshot to Claude vision (server-side) and
// shows a plain-English explanation of what the page is and what it's asking you to do.
// (Screenshots come back in English now, so this is about UNDERSTANDING the page, not translating.)
const ScreenshotReader = ({ screenshotUrl }) => {
  const { getToken } = useAuth();
  const [state, setState] = useState("idle"); // idle | loading | done | error
  const [readout, setReadout] = useState("");

  const read = async () => {
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
        <BookOpen size={15} /> Explain this page <span style={{ color: "var(--text-dim)", fontWeight: 400 }}>(what is it, what does it want?)</span>
      </button>
    );
  }
  if (state === "loading") {
    return <p style={{ fontSize: "0.85em", color: "var(--text-dim)", marginTop: 8 }}>Orbo is reading the page…</p>;
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
      borderRadius: 10, padding: "10px 12px", fontSize: "0.9em", lineHeight: 1.55 }}>
      <Markdown text={readout} />
    </div>
  );
}

const link = {
  marginTop: 8, background: "none", border: "none", padding: 0, cursor: "pointer",
  color: "var(--primary)", fontWeight: 700, fontSize: "0.85em",
  display: "inline-flex", alignItems: "center", gap: 6,
};

export default ScreenshotReader;
