// ── extension: background service worker · owner: David ──
// Registers the "Check with Orbis" context menu on links + selected text. On click it stashes
// the target URL in session storage and opens the popup, which runs the check and renders the
// verdict. (MV3 service workers can't render UI directly, so the popup owns the fetch + display.)

importScripts("api.js");

const MENU_ID = "orbis-check";

// (Re)create the menu on install/update. Links and selected text are the two useful surfaces:
// right-click a link → check its href; select a suspicious URL in page text → check that.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Check with Orbis",
    contexts: ["link", "selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== MENU_ID) return;
  // Prefer the actual link href; fall back to selected text (trimmed).
  const target = (info.linkUrl || info.selectionText || "").trim();
  if (!target) return;

  // Fire-and-forget the storage write (don't AWAIT it) and open the popup while the context-menu
  // click's user gesture is still live — awaiting storage first can consume the gesture so
  // openPopup() throws and we'd always fall back to the badge. The popup only reads pendingTarget
  // after it loads, so the un-awaited set() reliably lands first.
  chrome.storage.session.set({ pendingTarget: target });
  chrome.action.openPopup().catch(() => {
    // Some browsers/versions (e.g. Brave) reject programmatic openPopup() — fall back to a badge
    // nudge so the user knows to click the toolbar icon, where the pending target is waiting.
    chrome.action.setBadgeText({ text: "1" });
    chrome.action.setBadgeBackgroundColor({ color: "#0F62FE" });
  });
});
