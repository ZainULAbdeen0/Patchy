const { patchHttp } = require("./httpPatcher");
const { patchFetch } = require("./fetchPatcher");
const { startSocketServer, broadcast, stopSocketServer } = require("./socketServer");

let initialized = false;
let logToConsole = false;
let filterFn = defaultFilter;

function init(options = {}) {
  if (typeof window !== "undefined") return;
  const nodeEnv = process.env.NODE_ENV || "development";
  if (nodeEnv !== "development") return;
  if (initialized) return;

  initialized = true;

  const { port = 9119, logToConsole: logFlag = false, filter = null } = options;
  logToConsole = logFlag;
  filterFn = typeof filter === "function" ? filter : defaultFilter;

  startSocketServer(port);

  function onRequest(data) {
    emitRequest(data);
  }

  patchHttp(onRequest);

  patchFetch(onRequest);

  console.log("[nextjs-server-inspector] Initialized. Patching http & fetch.");
}

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
