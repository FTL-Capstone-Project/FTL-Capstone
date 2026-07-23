// ── extension: options · owner: David ── Save API URL + web app URL + token to chrome.storage.sync.
const apiUrlEl = document.getElementById("apiUrl");
const webUrlEl = document.getElementById("webUrl");
const tokenEl = document.getElementById("token");
const savedEl = document.getElementById("saved");

// Prefill from storage.
chrome.storage.sync.get(["apiUrl", "webUrl", "token"]).then(({ apiUrl, webUrl, token }) => {
  if (apiUrl) apiUrlEl.value = apiUrl;
  if (webUrl) webUrlEl.value = webUrl;
  if (token) tokenEl.value = token;
});

document.getElementById("save").addEventListener("click", async () => {
  await chrome.storage.sync.set({
    apiUrl: apiUrlEl.value.trim() || "http://localhost:3001",
    webUrl: webUrlEl.value.trim(), // blank = derive from API host (localhost dev)
    token: tokenEl.value.trim(),
  });
  savedEl.classList.add("show");
  setTimeout(() => savedEl.classList.remove("show"), 1500);
});
