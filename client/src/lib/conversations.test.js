// ============================================================
// Tests for the Recents / chat-history engine (conversations.js).
//
// This module is pure logic backed by localStorage, so we can test every
// function directly — no React, no network. The test setup (src/test/setup.js)
// clears localStorage before each test, so every test starts with an empty store.
//
// A conversation = { id, title, updatedAt, messages, customTitle?, pinned? }.
// A message = { role: "user" | "orbo", text, kind? }.
// ============================================================
import { describe, it, expect } from "vitest";
import {
  saveConversation,
  listConversations,
  getConversation,
  renameConversation,
  togglePin,
  deleteConversation,
  searchConversations,
  groupConversations,
  newConversationId,
} from "./conversations.js";

// Small helper: build a user message with the given text.
const userMsg = (text) => ({ role: "user", text });

describe("saveConversation", () => {
  it("creates a new conversation with an auto-derived title", () => {
    saveConversation({ id: "c1", messages: [userMsg("Is this real?")], now: 1000 });

    const saved = getConversation("c1");
    expect(saved).not.toBeNull();
    expect(saved.id).toBe("c1");
    expect(saved.title).toBe("Is this real?");
    expect(saved.updatedAt).toBe(1000);
    expect(saved.messages).toHaveLength(1);
  });

  it("ignores a save with no id", () => {
    saveConversation({ id: "", messages: [userMsg("hi")], now: 1000 });
    expect(listConversations()).toHaveLength(0);
  });

  it("bumps updatedAt only when the thread GREW (adding a message)", () => {
    saveConversation({ id: "c1", messages: [userMsg("first")], now: 1000 });
    // Growing the thread (2 messages now) should move updatedAt forward.
    saveConversation({ id: "c1", messages: [userMsg("first"), { role: "orbo", text: "reply" }], now: 2000 });
    expect(getConversation("c1").updatedAt).toBe(2000);
  });

  it("does NOT bump updatedAt when re-saving the SAME messages (reopen is not activity)", () => {
    saveConversation({ id: "c1", messages: [userMsg("first")], now: 1000 });
    // Reopening re-saves the identical messages — must keep the old updatedAt so
    // the sidebar doesn't reorder just because you clicked a chat.
    saveConversation({ id: "c1", messages: [userMsg("first")], now: 9999 });
    expect(getConversation("c1").updatedAt).toBe(1000);
  });

  it("keeps a user-set customTitle instead of the auto-derived one", () => {
    saveConversation({ id: "c1", messages: [userMsg("first")], now: 1000 });
    renameConversation("c1", "My renamed chat");
    // A later save (with a new message) must not clobber the custom title.
    saveConversation({ id: "c1", messages: [userMsg("first"), userMsg("second")], now: 2000 });
    expect(getConversation("c1").title).toBe("My renamed chat");
  });

  it("preserves extra fields (pinned) across a re-save", () => {
    saveConversation({ id: "c1", messages: [userMsg("first")], now: 1000 });
    togglePin("c1");
    saveConversation({ id: "c1", messages: [userMsg("first"), userMsg("second")], now: 2000 });
    expect(getConversation("c1").pinned).toBe(true);
  });
});

describe("listConversations ordering", () => {
  it("sorts pinned chats above unpinned ones", () => {
    saveConversation({ id: "old", messages: [userMsg("old")], now: 1000 });
    saveConversation({ id: "new", messages: [userMsg("new")], now: 5000 });
    togglePin("old"); // pin the older one

    const ids = listConversations().map((c) => c.id);
    expect(ids).toEqual(["old", "new"]); // pinned first even though it's older
  });

  it("sorts by newest updatedAt within the same pinned group", () => {
    saveConversation({ id: "a", messages: [userMsg("a")], now: 1000 });
    saveConversation({ id: "b", messages: [userMsg("b")], now: 3000 });
    saveConversation({ id: "c", messages: [userMsg("c")], now: 2000 });

    const ids = listConversations().map((c) => c.id);
    expect(ids).toEqual(["b", "c", "a"]); // 3000, 2000, 1000
  });
});

describe("renameConversation", () => {
  it("sets a custom title", () => {
    saveConversation({ id: "c1", messages: [userMsg("first")], now: 1000 });
    renameConversation("c1", "  Trimmed name  ");
    expect(getConversation("c1").title).toBe("Trimmed name");
    expect(getConversation("c1").customTitle).toBe("Trimmed name");
  });

  it("clears back to the auto-derived title when passed an empty name", () => {
    saveConversation({ id: "c1", messages: [userMsg("Check paypal.com")], now: 1000 });
    renameConversation("c1", "Custom");
    renameConversation("c1", "");
    expect(getConversation("c1").customTitle).toBeUndefined();
    expect(getConversation("c1").title).toBe("Check paypal.com");
  });

  it("does not reorder the list (rename is not activity)", () => {
    saveConversation({ id: "a", messages: [userMsg("a")], now: 1000 });
    saveConversation({ id: "b", messages: [userMsg("b")], now: 2000 });
    renameConversation("a", "Renamed"); // should NOT float 'a' to the top
    expect(listConversations().map((c) => c.id)).toEqual(["b", "a"]);
  });

  it("does nothing for an unknown id", () => {
    renameConversation("missing", "x");
    expect(listConversations()).toHaveLength(0);
  });
});

describe("togglePin", () => {
  it("flips pinned on and off", () => {
    saveConversation({ id: "c1", messages: [userMsg("first")], now: 1000 });
    togglePin("c1");
    expect(getConversation("c1").pinned).toBe(true);
    togglePin("c1");
    expect(getConversation("c1").pinned).toBe(false);
  });

  it("does not change updatedAt (pinning is not activity)", () => {
    saveConversation({ id: "c1", messages: [userMsg("first")], now: 1000 });
    togglePin("c1");
    expect(getConversation("c1").updatedAt).toBe(1000);
  });
});

describe("deleteConversation", () => {
  it("removes only the target conversation", () => {
    saveConversation({ id: "a", messages: [userMsg("a")], now: 1000 });
    saveConversation({ id: "b", messages: [userMsg("b")], now: 2000 });
    deleteConversation("a");
    expect(getConversation("a")).toBeNull();
    expect(getConversation("b")).not.toBeNull();
  });
});

describe("getConversation", () => {
  it("returns null for an unknown id", () => {
    expect(getConversation("nope")).toBeNull();
  });
});

describe("searchConversations", () => {
  it("returns the full list for a blank query", () => {
    saveConversation({ id: "a", messages: [userMsg("hello")], now: 1000 });
    saveConversation({ id: "b", messages: [userMsg("world")], now: 2000 });
    expect(searchConversations("   ")).toHaveLength(2);
  });

  it("matches on the title", () => {
    saveConversation({ id: "a", messages: [userMsg("Check paypal.com")], now: 1000 });
    saveConversation({ id: "b", messages: [userMsg("Check amazon.com")], now: 2000 });
    const results = searchConversations("paypal");
    expect(results.map((c) => c.id)).toEqual(["a"]);
  });

  it("matches on any message text (not just the title)", () => {
    saveConversation({
      id: "a",
      messages: [userMsg("Is this safe?"), { role: "orbo", text: "It looks like a phishing scam." }],
      now: 1000,
    });
    const results = searchConversations("phishing");
    expect(results.map((c) => c.id)).toEqual(["a"]);
  });

  it("is case-insensitive", () => {
    saveConversation({ id: "a", messages: [userMsg("Check PayPal.com")], now: 1000 });
    expect(searchConversations("PAYPAL")).toHaveLength(1);
  });
});

describe("groupConversations date buckets", () => {
  // Build timestamps relative to "right now" so the buckets are deterministic.
  const now = Date.now();
  const day = 86400000;

  it("buckets pinned / today / yesterday / previous 7 days / older and drops empty groups", () => {
    const list = [
      { id: "pin", pinned: true, updatedAt: now - 100 * day }, // pinned wins regardless of age
      { id: "today", updatedAt: now },
      { id: "yest", updatedAt: now - day - 1000 }, // just into yesterday
      { id: "week", updatedAt: now - 3 * day },
      { id: "old", updatedAt: now - 30 * day },
    ];
    const groups = groupConversations(list);
    const labels = groups.map((g) => g.label);
    expect(labels).toEqual(["Pinned", "Today", "Yesterday", "Previous 7 Days", "Older"]);
    // Each group holds its expected item.
    expect(groups.find((g) => g.label === "Pinned").items[0].id).toBe("pin");
    expect(groups.find((g) => g.label === "Older").items[0].id).toBe("old");
  });

  it("returns no groups for an empty list", () => {
    expect(groupConversations([])).toEqual([]);
  });
});

describe("title derivation (via saveConversation)", () => {
  const titleFor = (messages) => {
    saveConversation({ id: "t", messages, now: 1000 });
    const title = getConversation("t").title;
    deleteConversation("t"); // reset for the next case
    return title;
  };

  it("turns a bare URL into 'Check <domain>' (strips scheme + www)", () => {
    expect(titleFor([userMsg("https://www.paypal.com/login")])).toBe("Check paypal.com");
  });

  it("turns a bare email into 'Check <email>'", () => {
    expect(titleFor([userMsg("bob@evil.com")])).toBe("Check bob@evil.com");
  });

  it("sentence-cases and truncates a long question at a word boundary", () => {
    const long = "please tell me whether this very suspicious looking message is a scam";
    const title = titleFor([userMsg(long)]);
    expect(title[0]).toBe("P"); // sentence-cased
    expect(title.endsWith("…")).toBe(true); // truncated
    expect(title.length).toBeLessThanOrEqual(41); // <=40 chars + the ellipsis
  });

  it("uses 'Screenshot check' when the first message is an image", () => {
    expect(titleFor([{ role: "user", kind: "image" }])).toBe("Screenshot check");
  });

  it("falls back to 'New chat' with no usable message", () => {
    expect(titleFor([])).toBe("New chat");
  });
});

describe("newConversationId", () => {
  it("returns a different id on each call", () => {
    const a = newConversationId();
    const b = newConversationId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^c_/);
  });
});
