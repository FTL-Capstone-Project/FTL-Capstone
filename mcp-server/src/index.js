#!/usr/bin/env node
// ── Orbis MCP server ─────────────────────────────────────────────────────────
// Lets an external MCP client (Claude Desktop, etc.) ask Orbis's threat data in plain English.
//
// It exposes ONE tool, `ask_orbis`, which forwards the question to the Orbis backend's existing
// /api/nlp-query endpoint, authenticated with the user's own Orbis API key. That endpoint is where
// ALL the safety lives (LLM writes SQL → guard → scoped read-only execution → org/role isolation),
// so this process adds no new data access: it can only ask what the key's owner is already allowed
// to see. This server is a thin, read-only bridge — it never touches the database directly.
//
// Transport: stdio. Claude Desktop launches this file and talks to it over stdin/stdout, so there's
// no network server, no OAuth, and nothing to deploy — it runs locally next to (or pointed at) an
// Orbis backend.
//
// Config (environment variables, set in the Claude Desktop config):
//   ORBIS_API_KEY  (required) — an Orbis API key (starts with "orbis_"), minted in Orbis → Settings.
//   ORBIS_API_URL  (optional) — the Orbis backend base URL. Default http://localhost:3001.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_URL = (process.env.ORBIS_API_URL || "http://localhost:3001").replace(/\/+$/, "");
const API_KEY = process.env.ORBIS_API_KEY;

// Fail fast with a human-readable reason if the key is missing — otherwise every tool call would
// just 401 with a confusing message inside Claude. (We log to stderr: stdout is the MCP channel.)
if (!API_KEY) {
  console.error(
    "[orbis-mcp] ORBIS_API_KEY is not set. Generate a key in Orbis → Settings → API key, then add " +
    "it to the server's env in your Claude Desktop config. Refusing to start."
  );
  process.exit(1);
}

// The one tool we expose. The description is what the CLIENT's model reads to decide when to call
// it, so it's written for that audience — concrete examples of answerable questions.
const ASK_ORBIS_TOOL = {
  name: "ask_orbis",
  description:
    "Ask about your Orbis threat-report data in plain English and get an answer with the numbers " +
    "and matching reports. Use for questions like: 'how many dangerous links this week', 'what " +
    "reports came from email', 'break down checks by verdict', 'how many pending review', 'who " +
    "reports the most', 'when was the last report'. It answers ONLY from the caller's own Orbis " +
    "data (scoped to what they're allowed to see) and will say so if a question isn't about that data.",
  inputSchema: {
    type: "object",
    properties: {
      question: {
        type: "string",
        description: "A plain-English question about the user's Orbis threat reports.",
      },
    },
    required: ["question"],
  },
};

// Shape the Orbis /api/nlp-query response into readable text for the calling model. The endpoint
// returns either { fallback } (couldn't answer) or { answer, cards, ... } (answer + report list).
const formatAnswer = (data) => {
  if (data?.fallback) return data.fallback;

  const lines = [];
  if (data?.answer) lines.push(data.answer);

  // Surface the report cards as a compact list so the client model can cite specifics.
  if (Array.isArray(data?.cards) && data.cards.length > 0) {
    lines.push(""); // blank line before the list
    for (const c of data.cards) {
      const bits = [c.title || c.domain || "Untitled report"];
      if (c.score != null) bits.push(`score ${c.score}/100`);
      if (c.verdict) bits.push(c.verdict);
      if (c.reviewStatus) bits.push(c.reviewStatus);
      if (c.channel) bits.push(c.channel === "email" ? "forwarded email" : "web check");
      lines.push(`- ${bits.join(" · ")}`);
    }
  }

  return lines.join("\n") || "No answer was returned.";
};

// Call the Orbis backend. Returns the parsed JSON, or throws with a clear message the tool handler
// turns into an MCP error (surfaced to the user inside Claude).
const askOrbis = async (question) => {
  let res;
  try {
    res = await fetch(`${API_URL}/api/nlp-query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ question }),
    });
  } catch (e) {
    throw new Error(
      `Couldn't reach the Orbis backend at ${API_URL}. Is it running? (${e.message})`
    );
  }

  if (res.status === 401) {
    throw new Error("Orbis rejected the API key (401). Generate a fresh key in Orbis → Settings and update the config.");
  }
  if (res.status === 403) {
    throw new Error("This Orbis account can't run data queries (403) — data queries are for organization members.");
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Orbis returned ${res.status}. ${body.slice(0, 200)}`);
  }
  return res.json();
};

const server = new Server(
  { name: "orbis", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

// Advertise the single tool.
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [ASK_ORBIS_TOOL],
}));

// Handle a tool call.
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "ask_orbis") {
    return {
      isError: true,
      content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }],
    };
  }

  const question = request.params.arguments?.question;
  if (typeof question !== "string" || !question.trim()) {
    return {
      isError: true,
      content: [{ type: "text", text: "Please provide a 'question' (a plain-English question about your Orbis data)." }],
    };
  }

  try {
    const data = await askOrbis(question.trim());
    return { content: [{ type: "text", text: formatAnswer(data) }] };
  } catch (e) {
    // Return the error as tool content (isError) so the client model can relay it, rather than
    // crashing the transport.
    return { isError: true, content: [{ type: "text", text: e.message }] };
  }
});

// Boot on stdio. All diagnostics go to stderr — stdout is reserved for the MCP protocol.
const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[orbis-mcp] ready — bridging to ${API_URL} (tool: ask_orbis)`);
