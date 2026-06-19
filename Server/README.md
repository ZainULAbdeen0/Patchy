# nextjs-server-inspector

Debug Next.js server-side API calls directly in your browser DevTools.

## How it works

```
Next.js Server
  ↓ patches http + fetch
  ↓ captures request/response
  ↓ WebSocket server (port 9119)
      ↓
  Chrome Extension (WebSocket client)
      ↓
  Custom DevTools Panel
```

## Installation

```bash
npm install nextjs-server-inspector
```

## Setup in Next.js

### Option 1 — instrumentation.ts (Recommended)

Create an `instrumentation.ts` (or `.js`) file. Place it in your **project root**, or inside **`src/`** if your app uses a `src/` directory (e.g. `src/instrumentation.ts`):

```js
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { init } = await import('nextjs-server-inspector')
    init({ port: 9119 })
  }
}
```

On **Next.js 15+** instrumentation is stable — no extra config is required. On **Next.js 13.4–14**, enable it in `next.config.js`:

```js
module.exports = {
  experimental: { instrumentationHook: true }
}
```

### Option 2 — next.config.js

```js
if (process.env.NODE_ENV === 'development') {
  const { init } = require('nextjs-server-inspector')
  init()
}

module.exports = { /* your config */ }
```

> **Restart required:** the `instrumentation` / `next.config.js` hook runs only when the server boots. Restart your dev server after installing the package or after changing the `port` passed to `init()`.

---

## Options

```js
init({
  port: 9119,           // WebSocket port (default: 9119)
  logToConsole: true,   // Also log to terminal (default: false)
  filter: (req) => true, // Optional override (defaults to skipping /_next)
})
```

---

## Manual tracking (fallback)

If your app uses a custom HTTP client that isn't auto-detected:

```js
import { trackRequest } from 'nextjs-server-inspector'

const data = await trackRequest('GET', 'https://api.example.com/users', async () => {
  return await myCustomApiCall()
})
```

---

## Middleware tracking

```js
import { withInspector } from 'nextjs-server-inspector'

export default withInspector(async function middleware(req) {
  // your middleware logic
})
```

---

## Browser Extension (required)

This package only runs the **server** side. To view captured calls you need the companion Chrome extension.

Install **[Next.js Server Inspector](https://chromewebstore.google.com/detail/nextjs-server-inspector/lmneolmmljgfdbjaljojombpmcdoleah)** from the Chrome Web Store, then open DevTools on any page — a **"Server Inspector"** panel appears.

> Prefer to run it from source? The extension lives in the [`Client/`](https://github.com/ZainULAbdeen0/Patchy/tree/main/Client) folder. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and select the `Client/` folder.

The extension connects to `ws://localhost:9119` by default and shows all server-side calls captured by `init()`. To inspect an app on a different port, type the port into the **Port** box in the panel toolbar and press Enter. Each DevTools instance remembers its own port, so you can open DevTools on several tabs and inspect multiple apps at once — each running `init()` on its own port.

---

## Security

This is a **development-only** tool. It patches `http`, `https`, and `fetch` and captures full request/response headers and bodies — which may include `Authorization` headers, cookies, tokens, and other secrets — then broadcasts them over a local WebSocket.

- `init()` is a no-op unless `NODE_ENV === 'development'`. **Never enable it in production.**
- The WebSocket server binds to `127.0.0.1` only, so it is not exposed to your LAN.
- Any local process (including web pages open in your browser) that connects to `ws://localhost:9119` can read captured traffic. Only run it on a trusted machine.

---

## Using as a local package (no npm publish)

In the Next.js project that wants to use this, add to `package.json`:

```json
"dependencies": {
  "nextjs-server-inspector": "file:../path/to/Server"
}
```

Then run `npm install`. This symlinks or copies the local folder into `node_modules` so you can `require('nextjs-server-inspector')` or `import { init } from 'nextjs-server-inspector'` normally.
