<p align="center">
  <img src="Client/icons/icon128.png" alt="Next.js Server Inspector" width="120" height="120" />
</p>

<h1 align="center">Next.js Server Inspector</h1>

<p align="center">Debug your Next.js <strong>server-side</strong> API calls directly in Chrome DevTools.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/nextjs-server-inspector"><img alt="npm version" src="https://img.shields.io/npm/v/nextjs-server-inspector?color=cb3837&logo=npm"></a>
  <a href="https://chromewebstore.google.com/detail/nextjs-server-inspector/lmneolmmljgfdbjaljojombpmcdoleah"><img alt="Chrome Web Store" src="https://img.shields.io/badge/Chrome%20Web%20Store-Install-4285F4?logo=googlechrome&logoColor=white"></a>
  <img alt="license" src="https://img.shields.io/badge/license-MIT-blue">
</p>

---

## What it does

Next.js runs a lot of code on the server: route handlers, server components, server actions, and middleware. Any `fetch`, `http`, or `https` call made there never shows up in your browser's Network tab, because it happens on the server, out of sight.

**Next.js Server Inspector** brings those calls into the browser. A small package patches the server's HTTP clients, streams every request and response over a local WebSocket, and a companion Chrome extension displays them in a familiar Network-style panel inside DevTools.

```
Next.js server
  ├─ patches http, https, and fetch
  ├─ captures method, URL, headers, body, status, and timing
  └─ WebSocket server (localhost:9119)
        │
        ▼
  Chrome extension  ──►  "Server Inspector" DevTools panel
```

## What you need

The tool has two halves that work together:

| Part | Where it runs | Install |
| --- | --- | --- |
| **npm package** (`nextjs-server-inspector`) | Your Next.js dev server | `npm i nextjs-server-inspector` |
| **Chrome extension** | Your browser's DevTools | [Chrome Web Store](https://chromewebstore.google.com/detail/nextjs-server-inspector/lmneolmmljgfdbjaljojombpmcdoleah) |

## Getting started

### 1. Install the package

```bash
npm i nextjs-server-inspector
```

### 2. Start it when your server boots

Create an `instrumentation.ts` (or `.js`) file in your project root, or in `src/` if your app uses a `src/` directory:

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { init } = await import('nextjs-server-inspector')
    init({ port: 9119 })
  }
}
```

On Next.js 15+ this works out of the box. On 13.4 to 14, enable instrumentation in `next.config.js`:

```js
module.exports = {
  experimental: { instrumentationHook: true },
}
```

`init()` only runs in development. It is a no-op when `NODE_ENV` is not `development`, so it is safe to leave in place.

> **Restart required:** `instrumentation` runs only when the server boots. Restart your dev server after installing the package or after changing the `port` passed to `init()`.

### 3. Install the Chrome extension

Add **[Next.js Server Inspector](https://chromewebstore.google.com/detail/nextjs-server-inspector/lmneolmmljgfdbjaljojombpmcdoleah)** from the Chrome Web Store.

### 4. Open the panel

Start your app with `npm run dev`, open Chrome DevTools on any page, and select the **Server Inspector** tab. As your app makes server-side calls, they appear in the panel in real time.

## Using the panel

The panel mirrors the Chrome Network tab:

- **Request list** shows method, status, URL, type (fetch, http, middleware, or manual), size, and timing.
- **Filters** let you search by URL or method, filter by HTTP method, or filter by request type.
- **Detail view** has tabs for Overview, request headers, response headers, payload, and response body, with JSON highlighting and one-click copy.
- **Record and Clear** pause capture or clear the list.
- **Port** sets the WebSocket port the panel connects to (defaults to `9119`).

### Inspecting several apps at once

Each DevTools window keeps its own port. If you run more than one app, each calling `init()` on a different port, open DevTools on each tab and set its **Port** box accordingly:

```ts
// app A — instrumentation.ts
init({ port: 9119 })

// app B — instrumentation.ts
init({ port: 9120 })
```

Tab A on `9119` and tab B on `9120` stay live at the same time. Each tab remembers its port the next time you open DevTools there. Restart each app after setting or changing its `port`.

## Options

```js
init({
  port: 9119,            // WebSocket port (default: 9119)
  logToConsole: false,   // also log each call to the terminal (default: false)
  filter: (req) => true, // decide which calls to capture (default: skips /_next)
})
```

## Capturing custom clients

Most calls are caught automatically. For a client that is not, wrap it:

```js
import { trackRequest } from 'nextjs-server-inspector'

const data = await trackRequest('GET', 'https://api.example.com/users', () =>
  myCustomApiCall()
)
```

Middleware can be wrapped too:

```js
import { withInspector } from 'nextjs-server-inspector'

export default withInspector(async function middleware(req) {
  // your middleware logic
})
```

## Security

This is a **development-only** tool. It patches `http`, `https`, and `fetch` and captures full request and response headers and bodies, which can include `Authorization` headers, cookies, and tokens, then broadcasts them over a local WebSocket.

- `init()` is a no-op unless `NODE_ENV === 'development'`. Never enable it in production.
- The WebSocket server binds to `127.0.0.1` only, so it is not exposed to your network.
- Any local process that connects to the port can read captured traffic. Only run it on a machine you trust.

## Repository layout

```
Patchy/
├─ Server/   the npm package (nextjs-server-inspector)
└─ Client/   the Chrome extension (DevTools panel)
```

- [`Server/`](Server) — the published npm package and its full API docs.
- [`Client/`](Client) — the extension source, loadable unpacked for local development.

## License

MIT
