# Orbis MCP server

Connect an external MCP client (e.g. **Claude Desktop**) to Orbis so you can ask your threat-report
data questions in plain English — "how many dangerous links this week", "what came from email",
"who reports the most", "when was the last report".

It exposes one tool, **`ask_orbis`**, which forwards your question to Orbis's `/api/nlp-query`
endpoint using **your own Orbis API key**. All the safety lives in that endpoint (the LLM writes SQL
against a locked-down, read-only view; org/role isolation is enforced server-side), so this bridge
can only ever ask what your key's owner is already allowed to see. It never touches the database
directly and is strictly read-only.

Transport is **stdio**: Claude Desktop launches this script locally and talks to it over
stdin/stdout. No network server, no OAuth, nothing to deploy.

---

## Prerequisites

- The Orbis backend running (locally: `npm -w server run dev`, i.e. `http://localhost:3001`).
- Node 18+ (this repo uses the nvm Node at
  `/Users/mjissa/.nvm/versions/node/v22.23.1/bin/node`).
- An Orbis **organization** account (member or analyst). Data queries are org-scoped; a personal
  account with no org will get a "data queries are for organization members" message.

## Step 1 — Install this server's dependencies (once)

```bash
cd /Users/mjissa/codepath/FTL-Capstone/mcp-server
/Users/mjissa/.nvm/versions/node/v22.23.1/bin/npm install
```

## Step 2 — Generate your Orbis API key

1. Log into the Orbis web app.
2. Go to **Settings → "Browser extension"** and click **Generate key**. Copy it — it starts with
   `orbis_` and is shown **once**.

The key is labeled "Browser extension" in the UI because that was its first use, but it's a general
Orbis API key: the same key authenticates this MCP server (under the hood, both hit
`POST /api/users/api-key` and are accepted by `requireAuth`).

## Step 3 — Add the server to Claude Desktop

Open Claude Desktop's config file (create it if it doesn't exist):

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

Add an `orbis` entry under `mcpServers`. **Use the full node path** — Claude Desktop does not inherit
your shell's PATH, and Node here comes from nvm, so a bare `"node"` will fail to launch:

```json
{
  "mcpServers": {
    "orbis": {
      "command": "/Users/mjissa/.nvm/versions/node/v22.23.1/bin/node",
      "args": ["/Users/mjissa/codepath/FTL-Capstone/mcp-server/src/index.js"],
      "env": {
        "ORBIS_API_KEY": "orbis_PASTE_YOUR_KEY_HERE",
        "ORBIS_API_URL": "http://localhost:3001"
      }
    }
  }
}
```

If the file already has other servers, add `"orbis": { ... }` alongside them (don't duplicate the
`mcpServers` key).

## Step 4 — Restart Claude Desktop

Quit it completely (⌘Q) and reopen. The `orbis` server should appear in the tools/plug icon. Ask
something like:

> Using orbis, how many dangerous links were reported this week?

Claude will call `ask_orbis` and answer from your real Orbis data.

---

## Troubleshooting

- **Server won't start / "ORBIS_API_KEY is not set"** — the `env.ORBIS_API_KEY` is missing from the
  config. Paste your key.
- **"Orbis rejected the API key (401)"** — the key is wrong or was rotated. Generate a fresh one in
  Settings and update the config.
- **"Couldn't reach the Orbis backend"** — the backend isn't running, or `ORBIS_API_URL` is wrong.
  Confirm `curl http://localhost:3001/api/health` returns `{"ok":true,...}`.
- **Tool doesn't appear in Claude Desktop** — check the config is valid JSON (a trailing comma
  breaks it), the two paths are absolute and correct, then fully quit + reopen Claude Desktop.
  Claude Desktop's MCP logs (Help → open logs, or `~/Library/Logs/Claude/`) show launch errors.
- **No Claude Desktop / want to test standalone** — run the MCP Inspector against it:
  `npx @modelcontextprotocol/inspector /Users/mjissa/.nvm/versions/node/v22.23.1/bin/node /Users/mjissa/codepath/FTL-Capstone/mcp-server/src/index.js`
  (set `ORBIS_API_KEY` / `ORBIS_API_URL` in the Inspector's env panel). This proves the server works
  with no Claude account at all — useful for a demo.

## Security notes

- Read-only: the only tool asks a question; there is no tool that writes/deletes anything.
- Scoped: every call rides your API key → the server enforces org/role isolation (a member sees
  only their own + analyst-shared data; an analyst sees their org). This bridge cannot widen that.
- Your questions + the returned data flow through whatever Claude client you connect. For a personal
  Claude account that means consumer data handling — fine for demo/your own org data; point it at an
  enterprise Claude for production.
