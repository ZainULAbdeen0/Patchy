const { WebSocketServer } = require("ws");

const DEFAULT_PORT = 9119; // Custom port for our inspector

let wss = null;
const clients = new Set();

/**
 * Starts the WebSocket broadcast server.
 * The browser extension will connect to this.
 */
function startSocketServer(port = DEFAULT_PORT) {
  if (wss) return; // Already running

  wss = new WebSocketServer({ port });

  wss.on("listening", () => {
    console.log(
      `[nextjs-server-inspector] WebSocket server running on ws://localhost:${port}`
    );
  });

  wss.on("connection", (ws) => {
    clients.add(ws);
    console.log(
      `[nextjs-server-inspector] DevTools extension connected. Clients: ${clients.size}`
    );

    // Send a welcome/handshake message
    ws.send(JSON.stringify({ type: "connected", message: "Inspector ready" }));

    ws.on("close", () => {
      clients.delete(ws);
      console.log(
        `[nextjs-server-inspector] Client disconnected. Clients: ${clients.size}`
      );
    });

    ws.on("error", (err) => {
      console.error("[nextjs-server-inspector] WebSocket error:", err.message);
      clients.delete(ws);
    });
  });

  wss.on("error", (err) => {
    console.error(
      "[nextjs-server-inspector] Failed to start server:",
      err.message
    );
  });
}

/**
 * Broadcasts a captured request to all connected DevTools clients.
 * @param {Object} requestData
 */
function broadcast(requestData) {
  if (clients.size === 0) return;

  let message;
  try {
    message = JSON.stringify({
      type: "request",
      data: requestData,
    });
  } catch (err) {
    console.warn(
      "[nextjs-server-inspector] Failed to serialize request data:",
      err && err.message ? err.message : err
    );
    return;
  }

  clients.forEach((client) => {
    if (client.readyState === 1) {
      // 1 = OPEN
      client.send(message);
    }
  });
}

/**
 * Stops the WebSocket server.
 */
function stopSocketServer() {
  if (wss) {
    wss.close();
    wss = null;
    clients.clear();
  }
}

module.exports = { startSocketServer, broadcast, stopSocketServer };
