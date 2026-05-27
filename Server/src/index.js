const { patchHttp } = require("./httpPatcher");
const { patchFetch } = require("./fetchPatcher");
const { startSocketServer, broadcast, stopSocketServer } = require("./socketServer");

let initialized = false;
let logToConsole = false;
let filterFn = defaultFilter;

/**
 * Initialize the Next.js Server Inspector.
 *
 * Usage in Next.js:
 *   - In instrumentation.js (recommended for Next.js 13.4+)
 *   - Or in next.config.js
 *
 * @param {Object} options
 * @param {number} [options.port=9119]     - WebSocket server port
 * @param {boolean} [options.logToConsole] - Also log requests to console
 * @param {Function} [options.filter]      - Optional filter fn(requestData) => boolean
 */
function init(options = {}) {
  // Only run on server side, only in development
  if (typeof window !== "undefined") return;
  const nodeEnv = process.env.NODE_ENV || "development";
  if (nodeEnv !== "development") return;
  if (initialized) return;

  initialized = true;

  const { port = 9119, logToConsole: logFlag = false, filter = null } = options;
  logToConsole = logFlag;
  filterFn = typeof filter === "function" ? filter : defaultFilter;

  // Start WebSocket server
  startSocketServer(port);

  // Callback fired on every intercepted request
  function onRequest(data) {
    emitRequest(data);
  }

  // Patch Node.js http/https modules
  patchHttp(onRequest);

  // Patch global fetch (Node 18+)
  patchFetch(onRequest);

  console.log("[nextjs-server-inspector] Initialized. Patching http & fetch.");
}

/**
 * Next.js Middleware helper — wrap your middleware to track
 * requests that go through Next.js middleware layer.
 *
 * Usage:
 *   import { withInspector } from 'nextjs-server-inspector'
 *   export default withInspector(async function middleware(req) { ... })
 */
function withInspector(middlewareFn) {
  return async function (req, event) {
    const start = Date.now();
    try {
      const result = await middlewareFn(req, event);
      const duration = Date.now() - start;

      emitRequest({
        id: Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toISOString(),
        type: "middleware",
        method: req.method,
        url: req.url,
        requestHeaders: Object.fromEntries(req.headers),
        requestBody: null,
        status: result?.status || 200,
        statusText: result?.statusText || "OK",
        responseHeaders: result?.headers
          ? Object.fromEntries(result.headers)
          : {},
        responseBody: null,
        duration,
      });

      return result;
    } catch (err) {
      const duration = Date.now() - start;
      emitRequest({
        id: Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toISOString(),
        type: "middleware",
        method: req.method,
        url: req.url,
        requestHeaders: Object.fromEntries(req.headers),
        requestBody: null,
        status: 0,
        statusText: err && err.message ? err.message : "Middleware error",
        responseHeaders: {},
        responseBody: err && err.message ? err.message : null,
        duration,
      });
      throw err;
    }
  };
}

/**
 * Manual wrapper for custom API call functions.
 * Use this if auto-patching misses some calls.
 *
 * Usage:
 *   const data = await trackRequest('GET', 'https://api.example.com/users', async () => {
 *     return await myCustomApiCall()
 *   })
 */
async function trackRequest(method, url, fn) {
  const start = Date.now();
  let status = 200;
  let statusText = "OK";
  let responseBody = null;

  try {
    const result = await fn();
    if (result && typeof result === "object" && "status" in result) {
      status = Number(result.status) || status;
    }
    responseBody = toSerializable(result);
    return result;
  } catch (err) {
    status = 0;
    statusText = err && err.message ? err.message : "Request error";
    responseBody = err && err.message ? err.message : null;
    throw err;
  } finally {
    emitRequest({
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      type: "manual",
      method: String(method || "GET").toUpperCase(),
      url,
      requestHeaders: {},
      requestBody: null,
      status,
      statusText,
      responseHeaders: {},
      responseBody,
      duration: Date.now() - start,
    });
  }
}

function emitRequest(data) {
  try {
    if (filterFn && !filterFn(data)) return;
    if (logToConsole) {
      console.log(
        `[inspector] ${data.method} ${data.url} → ${data.status} (${data.duration}ms)`
      );
    }
    broadcast(data);
  } catch (err) {
    console.warn(
      "[nextjs-server-inspector] Failed to emit request:",
      err && err.message ? err.message : err
    );
  }
}

function defaultFilter(req) {
  return !isInternalNext(req && req.url);
}

function isInternalNext(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url, "http://localhost");
    return parsed.pathname.startsWith("/_next");
  } catch {
    return String(url).startsWith("/_next") || String(url).includes("/_next");
  }
}

function toSerializable(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  if (value instanceof ArrayBuffer) return Buffer.from(value).toString("utf8");
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString("utf8");
  }
  if (value instanceof URL) return value.toString();
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

module.exports = {
  init,
  withInspector,
  trackRequest,
  stopSocketServer,
};
