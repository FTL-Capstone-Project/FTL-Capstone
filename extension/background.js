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

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== MENU_ID) return;
  // Prefer the actual link href; fall back to selected text (trimmed).
  const target = (info.linkUrl || info.selectionText || "").trim();
  if (!target) return;

  // Hand the target to the popup via session storage (cleared when the browser closes), then
  // open the popup. openPopup() needs a recent user gesture — the context-menu click qualifies.
  await chrome.storage.session.set({ pendingTarget: target });
  try {
    await chrome.action.openPopup();
  } catch {
    // Some browsers/versions reject programmatic openPopup(); fall back to a badge nudge so the
    // user knows to click the toolbar icon, where the pending target is waiting.
    await chrome.action.setBadgeText({ text: "1" });
    await chrome.action.setBadgeBackgroundColor({ color: "#0F62FE" });
  }
});
