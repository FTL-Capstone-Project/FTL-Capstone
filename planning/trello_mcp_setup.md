# Trello MCP — Setup (lets Claude Code create & assign Trello cards)

The repo has a committed [`.mcp.json`](../.mcp.json) that wires the
[`@delorenj/mcp-server-trello`](https://github.com/delorenj/mcp-server-trello) server into Claude Code. It
reads your Trello credentials from **environment variables** — the file itself contains **no secrets**, so it's
safe in git. Each teammate supplies their own key + token.

## One-time setup (per person)

### 1. Get a Trello API key
1. Go to **https://trello.com/power-ups/admin**.
2. Create a Power-Up (any name — it's just a container for the key).
3. Open it → **API Key** tab → **Generate a new API Key** → copy it. (The key alone is public/harmless.)

### 2. Get a write-scoped token (this is the secret)
Visit this URL, replacing `YOUR_API_KEY`, click **Allow**, and copy the token:
```
https://trello.com/1/authorize?expiration=30days&scope=read,write&response_type=token&name=ClaudeCode&key=YOUR_API_KEY
```
- `scope=read,write` is required (creating + assigning cards both modify data).
- Prefer a bounded `expiration` (e.g. `30days`) over `never`; revoke via Trello → Settings when done.

### 3. Export the two vars in your shell
Add to your `~/.zshrc` (then `source ~/.zshrc`):
```sh
export TRELLO_API_KEY="your-key"
export TRELLO_TOKEN="your-token"
```
Claude Code expands `${TRELLO_API_KEY}` / `${TRELLO_TOKEN}` from `.mcp.json` at launch.

### 4. Approve the server in Claude Code
Restart Claude Code, run `/mcp`, and approve the project-scoped **trello** server (one-time prompt). It
should show as connected.

## Using it
- **Find your board/lists:** ask Claude to run `list_boards`, then `set_active_board`, then `get_lists`.
- **Create + assign cards:** e.g. *"Create these sprint cards in the To-Do list and assign the analyst-review
  ones to Ozias."* Claude runs `get_board_members` (to map names → member IDs), `add_card_to_list`, then
  `assign_member_to_card` — assignment is a two-step lookup-then-assign keyed on member IDs.

## Gotchas
- **Assignment needs member IDs, not usernames** — everyone must already be a board member.
- **The token = full write access to your Trello.** Never commit it; keep it in your shell env only.
- **Rate limits** (~300 req/10s per key) are handled automatically by the server's built-in throttle.
- If the server won't start, ensure `npx` works (Node installed); the server needs no global Bun despite the
  upstream README's `bunx` example.
