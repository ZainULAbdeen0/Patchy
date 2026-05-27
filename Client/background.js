// Background service worker
// Handles communication between panel and content scripts if needed
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "ping") {
    sendResponse({ type: "pong" });
  }
});
