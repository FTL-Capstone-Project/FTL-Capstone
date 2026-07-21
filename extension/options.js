// ── extension: options · owner: David ── Save API URL + token to chrome.storage.sync.
const apiUrlEl = document.getElementById("apiUrl");
const tokenEl = document.getElementById("token");
const savedEl = document.getElementById("saved");

// Prefill from storage.
chrome.storage.sync.get(["apiUrl", "token"]).then(({ apiUrl, token }) => {
  if (apiUrl) apiUrlEl.value = apiUrl;
  if (token) tokenEl.value = token;
});

document.getElementById("save").addEventListener("click", async () => {
  await chrome.storage.sync.set({
    apiUrl: apiUrlEl.value.trim() || "http://localhost:3001",
    token: tokenEl.value.trim(),
  });
  savedEl.classList.add("show");
  setTimeout(() => savedEl.classList.remove("show"), 1500);
});
