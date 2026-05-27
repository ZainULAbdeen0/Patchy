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

### Option 1 — instrumentation.js (Recommended, Next.js 13.4+)

Create `instrumentation.js` in your project root:

```js
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { init } = await import('nextjs-server-inspector')
    init({ port: 9119 })
  }
}
```

Enable it in `next.config.js`:

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

## Browser Extension

Install the companion Chrome extension (see `/Client` folder) to see calls in DevTools.

The extension connects to `ws://localhost:9119` and shows all server-side calls in a custom **"Server Inspector"** panel in Chrome DevTools.

---

## Using as a local package (no npm publish)

In the Next.js project that wants to use this, add to `package.json`:

```json
"dependencies": {
  "nextjs-server-inspector": "file:../path/to/Server"
}
```

Then run `npm install`. This symlinks or copies the local folder into `node_modules` so you can `require('nextjs-server-inspector')` or `import { init } from 'nextjs-server-inspector'` normally.
