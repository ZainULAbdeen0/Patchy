// This script runs in the DevTools context and creates our custom panel
chrome.devtools.panels.create(
  "Server Inspector",   // Panel title (tab name in DevTools)
  null,                 // Icon (null = no icon)
  "panel.html",         // The HTML page for our panel
  function (panel) {
    console.log("[Server Inspector] Panel created");
  }
);
