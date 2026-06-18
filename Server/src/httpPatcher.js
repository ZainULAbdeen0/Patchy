const http = require("http");
const https = require("https");

const MAX_BODY_BYTES = 50 * 1024;

function patchHttp(onRequest) {
  if (typeof onRequest !== "function") return;

  [http, https].forEach((module) => {
    if (module.__nextjsInspectorPatched) return;
    module.__nextjsInspectorPatched = true;

    const protocol = module === https ? "https" : "http";
    const originalRequest = module.request.bind(module);

    module.request = function (...args) {
      const startTime = Date.now();
      const { url, method, options } = resolveRequestInfo(protocol, args);
      const requestChunks = [];
      let requestBytes = 0;
      let finished = false;

      const requestArgs = [...args];
      const callbackIndex = getCallbackIndex(requestArgs);
      const originalCallback =
        callbackIndex !== -1 ? requestArgs[callbackIndex] : null;

      const handleResponse = (res) => {
        const responseChunks = [];
        let responseBytes = 0;

        res.on("data", (chunk) => {
          const buffer = toBuffer(chunk);
          if (!buffer) return;
          if (responseBytes < MAX_BODY_BYTES) {
            const remaining = MAX_BODY_BYTES - responseBytes;
            responseChunks.push(buffer.slice(0, remaining));
          }
          responseBytes += buffer.length;
        });

        res.on("end", () => {
          if (finished) return;
          finished = true;
          const rawBody = Buffer.concat(responseChunks).toString("utf8");
          const responseBody = tryParseJson(rawBody);

          emitRequest(onRequest, {
            id: generateId(),
            timestamp: new Date().toISOString(),
            type: "http",
            method,
            url,
            requestHeaders: getRequestHeaders(req, options),
            requestBody: parseRequestBody(requestChunks),
            status: res.statusCode || 0,
            statusText: res.statusMessage || "",
            responseHeaders: res.headers || {},
            responseBody,
            duration: Date.now() - startTime,
          });
        });

        res.on("error", (err) => {
          if (finished) return;
          finished = true;
          emitError(onRequest, err, {
            method,
            url,
            requestHeaders: getRequestHeaders(req, options),
            requestBody: parseRequestBody(requestChunks),
            duration: Date.now() - startTime,
          });
        });

        if (typeof originalCallback === "function") {
          originalCallback(res);
        }
      };

      if (callbackIndex !== -1) {
        requestArgs[callbackIndex] = handleResponse;
      } else {
        requestArgs.push(handleResponse);
      }

      const req = originalRequest(...requestArgs);

      const originalWrite = req.write.bind(req);
      const originalEnd = req.end.bind(req);

      req.write = function (chunk, encoding, cb) {
        requestBytes = captureChunk(chunk, encoding, requestChunks, requestBytes);
        return originalWrite(chunk, encoding, cb);
      };

      req.end = function (chunk, encoding, cb) {
        requestBytes = captureChunk(chunk, encoding, requestChunks, requestBytes);
        return originalEnd(chunk, encoding, cb);
      };

      req.on("error", (err) => {
        if (finished) return;
        finished = true;
        emitError(onRequest, err, {
          method,
          url,
          requestHeaders: getRequestHeaders(req, options),
          requestBody: parseRequestBody(requestChunks),
          duration: Date.now() - startTime,
        });
      });

      req.on("abort", () => {
        if (finished) return;
        finished = true;
        emitError(onRequest, new Error("Request aborted"), {
          method,
          url,
          requestHeaders: getRequestHeaders(req, options),
          requestBody: parseRequestBody(requestChunks),
          duration: Date.now() - startTime,
        });
      });

      return req;
    };

    module.get = function (...args) {
      const req = module.request(...args);
      req.end();
      return req;
    };
  });
}

function resolveRequestInfo(protocol, args) {
  let urlArg = null;
  let options = null;

  if (typeof args[0] === "string" || args[0] instanceof URL) {
    urlArg = args[0];
    if (args[1] && typeof args[1] === "object") {
      options = args[1];
    }
  } else if (args[0] && typeof args[0] === "object") {
    options = args[0];
  }

  const method = (options && options.method) || "GET";
  const url = buildUrl(protocol, urlArg, options);

  return {
    url,
    method: String(method).toUpperCase(),
    options: options || {},
  };
}

function buildUrl(protocol, urlArg, options) {
  if (urlArg) {
    try {
      const parsed = urlArg instanceof URL ? urlArg : new URL(urlArg);
      return parsed.toString();
    } catch {
      if (typeof urlArg === "string" && urlArg.startsWith("/")) {
        return formatUrl(protocol, { ...(options || {}), path: urlArg });
      }
      return String(urlArg);
    }
  }

  return formatUrl(protocol, options || {});
}

function formatUrl(protocol, options) {
  const host = options.hostname || options.host || "localhost";
  const port = options.port ? `:${options.port}` : "";
  const path = options.path || "/";
  return `${protocol}://${host}${port}${path}`;
}

function captureChunk(chunk, encoding, chunks, capturedBytes = 0) {
  const buffer = toBuffer(chunk, encoding);
  if (!buffer) return capturedBytes;
  if (capturedBytes < MAX_BODY_BYTES) {
    const remaining = MAX_BODY_BYTES - capturedBytes;
    chunks.push(buffer.slice(0, remaining));
  }
  return capturedBytes + buffer.length;
}

function toBuffer(chunk, encoding) {
  if (!chunk) return null;
  if (Buffer.isBuffer(chunk)) return chunk;
  if (chunk instanceof Uint8Array) return Buffer.from(chunk);
  if (typeof chunk === "string") {
    return Buffer.from(chunk, typeof encoding === "string" ? encoding : undefined);
  }
  try {
    return Buffer.from(chunk);
  } catch {
    return null;
  }
}

function parseRequestBody(chunks) {
  if (!chunks.length) return null;
  const raw = Buffer.concat(chunks).toString("utf8");
  return tryParseJson(raw);
}

function getCallbackIndex(args) {
  if (typeof args[0] === "function") return 0;
  if (typeof args[1] === "function") return 1;
  if (typeof args[2] === "function") return 2;
  return -1;
}

function getRequestHeaders(req, options) {
  if (req && typeof req.getHeaders === "function") {
    return req.getHeaders();
  }
  if (options && options.headers) return options.headers;
  return {};
}

function emitError(onRequest, err, base) {
  emitRequest(onRequest, {
    id: generateId(),
    timestamp: new Date().toISOString(),
    type: "http",
    method: base.method,
    url: base.url,
    requestHeaders: base.requestHeaders || {},
    requestBody: base.requestBody || null,
    status: 0,
    statusText: err && err.message ? err.message : "Request error",
    responseHeaders: {},
    responseBody: err && err.message ? err.message : null,
    duration: base.duration || 0,
  });
}

function emitRequest(onRequest, data) {
  try {
    onRequest(data);
  } catch (err) {
    console.warn(
      "[nextjs-server-inspector] Failed to handle http request:",
      err && err.message ? err.message : err
    );
  }
}

function tryParseJson(str) {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

module.exports = { patchHttp };
