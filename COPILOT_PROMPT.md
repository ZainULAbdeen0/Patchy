# Copilot Prompt — Finalize Next.js Server Inspector

## Context

This repo has two folders:
- `server/` — a Node.js package that patches `http`, `https`, and global `fetch` in a Next.js server to capture all outgoing API calls and broadcast them over a local WebSocket server on port 9119.
- `client/` — a Chrome DevTools Extension that connects to that WebSocket and displays server-side API calls in a custom "Server Inspector" panel inside Chrome DevTools, styled exactly like the native Network tab.

There is a `demo/` folder containing working prototype ZIPs of both. Unzip and read them fully before making any changes.

---

## Your Task

Read the demo code carefully and produce a finalized, production-quality version of both packages into `server/` and `client/` respectively.

---

## Server Package (`server/`)

### Must do:
1. Keep the 4-file structure: `index.js`, `httpPatcher.js`, `fetchPatcher.js`, `socketServer.js`
2. `httpPatcher.js` — patches `http.request` and `https.request`. Capture: URL, method, request headers, request body, response status, response headers, response body, duration, timestamp. Handle errors gracefully (don't crash the Next.js app).
3. `fetchPatcher.js` — patches `globalThis.fetch` (Node 18+). Clone the response before reading the body so the original is never consumed. Same fields as above.
4. `socketServer.js` — starts a WebSocket server (using the `ws` npm package) on a configurable port (default 9119). Broadcasts captured requests to all connected clients. Handle reconnections gracefully. Export `startSocketServer`, `broadcast`, `stopSocketServer`.
5. `index.js` — exports `init(options)`, `withInspector(middlewareFn)`, `trackRequest(method, url, fn)`. `init()` must: only run server-side (check `typeof window`), only run in development (`NODE_ENV`), be idempotent (calling twice does nothing), start the socket server, patch http and fetch.
6. Add a `package.json` with `"main": "src/index.js"`, `"name": "nextjs-server-inspector"`, and `ws` as a dependency.
7. Add usage instructions in `README.md`.

### Edge cases to handle:
- Requests that error out (network failure) — still log them with `status: 0`
- Large response bodies — truncate to 50kb max before broadcasting
- Internal Next.js calls (URLs starting with `/_next`) — skip by default, configurable via `filter` option
- The WebSocket server should not crash if no clients are connected

---

## Client Extension (`client/`)

### Must do:
1. Keep the file structure: `manifest.json`, `devtools.html`, `devtools.js`, `background.js`, `panel.html`, `panel.js`
2. `manifest.json` — Manifest V3, `devtools_page` pointing to `devtools.html`, permissions: `["storage"]`
3. `devtools.js` — registers a panel called "Server Inspector" with `chrome.devtools.panels.create`
4. `panel.html` — the full DevTools UI. Dark theme matching Chrome DevTools. Layout: toolbar at top, filter bar below it, then a split view (requests table left, detail panel right).
5. `panel.js` — all the logic (see below).

### panel.js requirements:

**WebSocket:**
- Connect to `ws://localhost:9119` on load
- Show connection status (dot indicator) in toolbar: green=connected, yellow=connecting, red=disconnected
- Auto-reconnect every 3 seconds on disconnect
- Show a "Connecting…" / "Connected" / "Disconnected" label

**Requests table columns (exactly like Chrome Network tab):**
- `#` (index), `Method`, `Status`, `URL` (path only, full URL in tooltip), `Type` (fetch/http/middleware/manual), `Initiator` (always "server"), `Size`, `Time`

**Toolbar controls:**
- Record button (red circle) — toggles pausing new requests
- Clear button — clears all requests
- Search/filter input — filters by URL or method (live)
- Method filter buttons: All, GET, POST, PUT, PATCH, DELETE
- Type filter chips: All, Fetch, HTTP, Middleware, Manual
- Request count display
- WS status indicator

**Detail panel (right side, opens on row click):**
- Close button (✕)
- 5 tabs: Overview, Request Headers, Response Headers, Payload, Response
- Overview: shows URL, method, status code (color-coded), type, duration, timestamp, size
- Request Headers / Response Headers: key-value list
- Payload: JSON syntax-highlighted request body with a Copy button
- Response: JSON syntax-highlighted response body with a Copy button
- Collapsible sections with arrow indicators
- Panel is resizable by dragging the left edge

**Status bar (bottom):**
- Total requests count
- Total time (sum of all durations)
- Transferred size (sum of all response sizes)
- Error count (red, only shown when > 0)

**Other:**
- Rows animate in (fade + slight slide) when a new request arrives
- Error rows (status >= 400 or status 0) have the URL colored red
- Status codes color-coded: 2xx green, 3xx blue, 4xx/5xx red
- Method names color-coded: GET green, POST blue, PUT yellow, PATCH orange, DELETE red
- Escape key closes detail panel
- Empty state shown when no requests yet

---

## How to use as a local package (without npm publish)

In the Next.js project that wants to use this, add to `package.json`:

```json
"dependencies": {
  "nextjs-server-inspector": "file:../path/to/server"
}
```

Then run `npm install`. This symlinks or copies the local folder into `node_modules` so you can `require('nextjs-server-inspector')` or `import { init } from 'nextjs-server-inspector'` normally.

To use in Next.js, create `instrumentation.js` in the project root:

```js
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { init } = await import('nextjs-server-inspector')
    init({ port: 9119, logToConsole: true })
  }
}
```

And enable it in `next.config.js`:

```js
module.exports = {
  experimental: { instrumentationHook: true }
}
```

---

## When ready to publish to npm:

1. Make sure `package.json` has `name`, `version`, `main`, `description`, `keywords`, `license`
2. Add a `.npmignore` to exclude `node_modules`, `test.js`, `.env`
3. Run `npm login` then `npm publish`

---

## Quality bar

- No console errors in either the extension or the server package
- The extension should work even if the WebSocket server is not yet running (graceful retry)
- The server package should never crash or interfere with the Next.js app
- Code should be clean, well-commented, and easy to extend
