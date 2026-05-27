const MAX_BODY_BYTES = 50 * 1024;

/**
 * Patches the global fetch function in Node.js 18+
 * to intercept all outgoing fetch calls.
 * @param {Function} onRequest - callback(requestData) called for every fetch
 */
function patchFetch(onRequest) {
  if (typeof globalThis.fetch !== "function") {
    console.warn(
      "[nextjs-server-inspector] global fetch not found. Requires Node.js 18+."
    );
    return;
  }

  if (globalThis.fetch.__nextjsInspectorPatched) return;
  const originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async function (input, init = {}) {
    const startTime = Date.now();
    const url = input instanceof Request ? input.url : String(input);
    const method = (
      init.method ||
      (input instanceof Request ? input.method : "GET")
    ).toUpperCase();

    const requestHeaders = mergeHeaders(input, init);
    const requestBody = parseRequestBody(init.body);

    let response;
    let status = 0;
    let statusText = "";
    let responseHeaders = {};
    let responseBody = null;

    try {
      response = await originalFetch(input, init);
      status = response.status;
      statusText = response.statusText;
      responseHeaders = headersToObject(response.headers);

      const cloned = response.clone();
      let rawBody = "";
      try {
        rawBody = await readResponseBody(cloned);
      } catch (err) {
        console.warn(
          "[nextjs-server-inspector] Failed to read fetch response body:",
          err && err.message ? err.message : err
        );
      }
      responseBody = tryParseJson(rawBody);

      emitRequest(onRequest, {
        id: generateId(),
        timestamp: new Date().toISOString(),
        type: "fetch",
        method,
        url,
        requestHeaders,
        requestBody,
        status,
        statusText,
        responseHeaders,
        responseBody,
        duration: Date.now() - startTime,
      });

      return response;
    } catch (err) {
      status = 0;
      statusText = err && err.message ? err.message : "Fetch error";
      responseBody = err && err.message ? err.message : null;

      emitRequest(onRequest, {
        id: generateId(),
        timestamp: new Date().toISOString(),
        type: "fetch",
        method,
        url,
        requestHeaders,
        requestBody,
        status,
        statusText,
        responseHeaders,
        responseBody,
        duration: Date.now() - startTime,
      });

      throw err;
    }
  };
  globalThis.fetch.__nextjsInspectorPatched = true;
}

function mergeHeaders(input, init) {
  const base = input instanceof Request ? normalizeHeaders(input.headers) : {};
  const override = normalizeHeaders(init.headers);
  return { ...base, ...override };
}

function normalizeHeaders(headers) {
  const result = {};
  if (!headers) return result;

  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  if (Array.isArray(headers)) {
    headers.forEach(([key, value]) => {
      if (key) result[String(key)] = String(value);
    });
    return result;
  }

  if (typeof headers === "object") {
    Object.entries(headers).forEach(([key, value]) => {
      result[key] = Array.isArray(value) ? value.join(", ") : String(value);
    });
  }

  return result;
}

function headersToObject(headers) {
  const result = {};
  if (!headers || typeof headers.forEach !== "function") return result;
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

function parseRequestBody(body) {
  if (body === undefined || body === null) return null;

  if (typeof body === "string") return tryParseJson(body);
  if (Buffer.isBuffer(body)) return tryParseJson(body.toString("utf8"));
  if (body instanceof ArrayBuffer) {
    return tryParseJson(Buffer.from(body).toString("utf8"));
  }
  if (ArrayBuffer.isView(body)) {
    return tryParseJson(Buffer.from(body.buffer, body.byteOffset, body.byteLength).toString("utf8"));
  }
  if (body instanceof URLSearchParams) return tryParseJson(body.toString());

  if (typeof body === "object") {
    try {
      return JSON.parse(JSON.stringify(body));
    } catch {
      return String(body);
    }
  }

  return String(body);
}

async function readResponseBody(response) {
  if (!response) return "";
  if (!response.body || typeof response.body.getReader !== "function") {
    const text = await response.text();
    return truncateText(text);
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    const buffer = Buffer.from(value);
    if (total < MAX_BODY_BYTES) {
      const remaining = MAX_BODY_BYTES - total;
      chunks.push(buffer.slice(0, remaining));
    }
    total += buffer.length;

    if (total >= MAX_BODY_BYTES) {
      try {
        await reader.cancel();
      } catch {}
      break;
    }
  }

  return Buffer.concat(chunks).toString("utf8");
}

function truncateText(text) {
  if (typeof text !== "string") return "";
  if (Buffer.byteLength(text, "utf8") <= MAX_BODY_BYTES) return text;
  return text.slice(0, MAX_BODY_BYTES);
}

function emitRequest(onRequest, data) {
  try {
    onRequest(data);
  } catch (err) {
    console.warn(
      "[nextjs-server-inspector] Failed to handle fetch request:",
      err && err.message ? err.message : err
    );
  }
}

function tryParseJson(str) {
  if (typeof str !== "string") return str;
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

module.exports = { patchFetch };
