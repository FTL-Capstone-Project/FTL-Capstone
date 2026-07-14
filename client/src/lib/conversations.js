// ============================================================
// Conversation store — persists Orbo chat threads in the browser (localStorage) so they
// survive navigation AND page reload, and power the sidebar "Recents" + search.
//
// A conversation = { id, title, updatedAt, messages: [...] }. The message shape is exactly
// what Home.jsx renders (role/kind/text/indicatorId/...), so reopening restores the thread.
//
// Per-device (localStorage) for now — a future backend table would sync across devices.
// Tiny pub/sub (subscribe) lets the sidebar re-render live as the active chat updates.
// Owner: David.
// ============================================================
const KEY = "orbis.conversations.v1";
const listeners = new Set();

function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; }
  catch { return []; }
}
function writeAll(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* quota/full — ignore */ }
  listeners.forEach((fn) => fn());
}

// Subscribe to changes (returns an unsubscribe fn). Use with useSyncExternalStore or an effect.
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// All conversations, newest first (for the Recents list).
export function listConversations() {
  return readAll().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function getConversation(id) {
  return readAll().find((c) => c.id === id) || null;
}

// Create-or-update a conversation. Auto-titles from the first user text message.
export function saveConversation({ id, messages, now }) {
  if (!id) return;
  const list = readAll();
  const idx = list.findIndex((c) => c.id === id);
  const title = deriveTitle(messages);
  const rec = { id, title, updatedAt: now ?? Date.now(), messages };
  if (idx >= 0) list[idx] = rec; else list.push(rec);
  writeAll(list);
}

export function deleteConversation(id) {
  writeAll(readAll().filter((c) => c.id !== id));
}

// Search Recents by title OR any message text (for the sidebar search box).
export function searchConversations(query) {
  const q = query.trim().toLowerCase();
  if (!q) return listConversations();
  return listConversations().filter((c) =>
    (c.title || "").toLowerCase().includes(q) ||
    (c.messages || []).some((m) => (m.text || "").toLowerCase().includes(q))
  );
}

// A fresh conversation id. (No Math.random dependency issues — time + counter.)
let seq = 0;
export function newConversationId() {
  return `c_${Date.now().toString(36)}_${(seq++).toString(36)}`;
}

// Title = first thing the user actually asked/checked, trimmed. Falls back to "New chat".
function deriveTitle(messages = []) {
  const firstUser = messages.find((m) => m.role === "user" && (m.text || "").trim());
  if (firstUser) {
    const t = firstUser.text.trim().replace(/\s+/g, " ");
    return t.length > 40 ? t.slice(0, 38) + "…" : t;
  }
  const firstImg = messages.find((m) => m.kind === "image");
  if (firstImg) return "Screenshot check";
  return "New chat";
}
