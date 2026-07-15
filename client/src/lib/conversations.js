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

// All conversations for the Recents list: PINNED first, then newest activity first.
// (b.pinned === true) - (a.pinned === true) sorts pinned (true=1) above unpinned (false=0).
export function listConversations() {
  return readAll().sort((a, b) =>
    (b.pinned === true) - (a.pinned === true) || (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function getConversation(id) {
  return readAll().find((c) => c.id === id) || null;
}

// Create-or-update a conversation. Auto-titles from the first user text message.
export function saveConversation({ id, messages, now }) {
  if (!id) return;
  const list = readAll();
  const idx = list.findIndex((c) => c.id === id);
  const prev = idx >= 0 ? list[idx] : null;

  // "New activity" = a message was actually ADDED. Merely REOPENING a chat re-saves the
  // SAME messages, which must NOT reorder the sidebar. So keep the old updatedAt unless the
  // thread grew. (This is the fix for "clicking a chat makes it move around.")
  const grew = !prev || messages.length > (prev.messages?.length || 0);
  const updatedAt = grew ? (now ?? Date.now()) : (prev.updatedAt ?? Date.now());

  // A user-set rename (customTitle) always wins; otherwise auto-derive from the messages.
  const title = prev?.customTitle?.trim() ? prev.customTitle : deriveTitle(messages);

  // Spread prev so extra fields (customTitle, pinned) survive a re-save.
  const rec = { ...prev, id, title, updatedAt, messages };
  if (idx >= 0) list[idx] = rec; else list.push(rec);
  writeAll(list);
}

// Rename a chat to a user-chosen title. Does NOT count as activity, so it does NOT reorder
// the list. Passing an empty name clears the custom title back to the auto-derived one.
export function renameConversation(id, customTitle) {
  const list = readAll();
  const c = list.find((x) => x.id === id);
  if (!c) return;
  const name = (customTitle || "").trim();
  c.customTitle = name || undefined;
  c.title = name || deriveTitle(c.messages || []);
  writeAll(list);
}

// Pin/unpin a chat so it floats to the top. Does NOT bump updatedAt (pinning isn't activity).
export function togglePin(id) {
  const list = readAll();
  const c = list.find((x) => x.id === id);
  if (!c) return;
  c.pinned = !c.pinned;
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

// Bucket a (pre-sorted) list of conversations into the sidebar's date groups. Pinned chats
// get their own group at the top; the rest fall into Today / Yesterday / Previous 7 Days /
// Older by their updatedAt. Returns only the non-empty groups, in display order.
export function groupConversations(list) {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86400000; // one day in milliseconds
  const groups = { Pinned: [], Today: [], Yesterday: [], "Previous 7 Days": [], Older: [] };
  for (const c of list) {
    if (c.pinned) { groups.Pinned.push(c); continue; }
    const t = c.updatedAt || 0;
    if (t >= startToday) groups.Today.push(c);
    else if (t >= startToday - day) groups.Yesterday.push(c);
    else if (t >= startToday - 7 * day) groups["Previous 7 Days"].push(c);
    else groups.Older.push(c);
  }
  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }));
}

// Title = first thing the user actually asked/checked, cleaned up. Falls back to "New chat".
function deriveTitle(messages = []) {
  const firstUser = messages.find((m) => m.role === "user" && (m.text || "").trim());
  if (firstUser) return labelFor(firstUser.text);
  const firstImg = messages.find((m) => m.kind === "image");
  if (firstImg) return "Screenshot check";
  return "New chat";
}

// Turn the first user message into a clean, human title.
function labelFor(raw) {
  const text = raw.trim().replace(/\s+/g, " ");
  // A bare URL → "Check paypal.com" (strip the scheme + www and drop the ugly path).
  const url = text.match(/^(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?:[/?#]\S*)?$/i);
  if (url) return `Check ${url[1].replace(/^www\./i, "")}`;
  // A bare email → "Check bob@evil.com".
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return `Check ${text}`;
  // Otherwise it's a sentence/question → tidy it up.
  return tidySentence(text);
}

// Sentence-case, cut at a WORD boundary (never mid-word), strip trailing punctuation.
function tidySentence(text) {
  const t = text.replace(/^[a-z]/, (c) => c.toUpperCase());
  if (t.length <= 40) return t;
  const cut = t.slice(0, 40);
  const space = cut.lastIndexOf(" ");
  return (space > 20 ? cut.slice(0, space) : cut).replace(/[.,;:!?]+$/, "") + "…";
}
