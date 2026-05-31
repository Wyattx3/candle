# Cloudflare Tunnel setup (backend WebSocket)

The Candle backend's WebSocket and REST endpoints are exposed to the mobile app
through a **Cloudflare Tunnel**, not ngrok. The dev scripts already wire this
up — you just need to install `cloudflared`, authorise it once, and drop a
`cloudflare-tunnel.yml` next to `cloudflare-tunnel.example.yml`.

## What is already wired

- `scripts/backend-tunnel.js` and `scripts/dev-all.js` spawn `cloudflared
  tunnel --config cloudflare-tunnel.yml run` and wait for the public health
  check at `https://<host>/health`.
- The hostname defaults to `wss://ws.candlecan.art`. `backend-tunnel.js`
  honours `EXPO_PUBLIC_WS_URL` if you want to override it; `dev-all.js`
  hard-codes the URL — edit the `WS_URL` constant if you point at a different
  domain.
- After the tunnel comes up, the Expo client picks the WS URL from
  `.env.local` (`EXPO_PUBLIC_WS_URL`), which the scripts upsert
  automatically.
- `cloudflare-tunnel.yml` and `*.exe` are gitignored so credentials and the
  binary never get committed.

## One-time setup

1. **Install cloudflared.**
   - Windows: `winget install --id Cloudflare.cloudflared` (or download the
     `cloudflared.exe` from Cloudflare's GitHub releases and drop it in the
     repo root — the dev scripts prefer a local `./cloudflared.exe` over PATH).
   - macOS: `brew install cloudflared`.
   - Linux: see https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/.

2. **Log in.** This opens a browser to authorise your Cloudflare account and
   pick the zone (domain) you want to use.
   ```bash
   cloudflared tunnel login
   ```

3. **Create a tunnel** (any name; Candle's scripts don't care about the
   name, only the UUID).
   ```bash
   cloudflared tunnel create candle-backend
   ```
   This prints a UUID and writes `<UUID>.json` credentials under
   `~/.cloudflared/` (or `C:\Users\<you>\.cloudflared\` on Windows).

4. **Create the config file.** Copy the example and fill in the real UUID,
   credentials path, and hostname.
   ```bash
   cp cloudflare-tunnel.example.yml cloudflare-tunnel.yml
   # then edit cloudflare-tunnel.yml
   ```

5. **Route a DNS record** to the tunnel. Pick any hostname under a zone you
   own (the example uses `ws.candlecan.art`).
   ```bash
   cloudflared tunnel route dns candle-backend ws.candlecan.art
   ```

6. **Run it.**
   ```bash
   npm run backend:tunnel    # backend + tunnel only
   # or
   npm run dev:all           # backend + tunnel + Expo Metro
   ```

   On a healthy boot you should see `[backend:tunnel] Ready: wss://...` and
   `https://<host>/health` returning `{ "status": "ok" }`.

## Using a different hostname

- For ad-hoc tunnel runs, set `EXPO_PUBLIC_WS_URL` before running
  `backend:tunnel`:
  ```powershell
  $env:EXPO_PUBLIC_WS_URL = 'wss://my-other-host.example.com'
  npm run backend:tunnel
  ```
- For the combined `dev:all` flow, edit the `WS_URL` constant in
  `scripts/dev-all.js` (it's only the public-facing URL the script writes
  into `.env.local` for the Expo client).

## WebSocket-specific notes

- The backend uses raw `ws` (`new WebSocketServer({ server })`). Cloudflare
  proxies WebSockets transparently as long as the zone has WebSockets
  enabled (default ON). No special headers required.
- If you see `Upgrade required` or a 502, double-check the `service:` URL in
  the YAML actually points at the local Express port (default `:3000`).
- The Expo client opens `wss://...` directly (no fallback to plain `ws://`),
  so the tunnel hostname must serve a valid TLS certificate — Cloudflare
  Tunnel does this for you automatically.

## Cleanup

When you're done with a host:

```bash
cloudflared tunnel route dns --overwrite-dns candle-backend new-host.example.com
# or to delete the tunnel entirely:
cloudflared tunnel delete candle-backend
```

## Files involved

- `scripts/backend-tunnel.js` — tunnel-only launcher.
- `scripts/dev-all.js` — backend + tunnel + Expo Metro launcher.
- `cloudflare-tunnel.yml` (gitignored) — your local tunnel config.
- `cloudflare-tunnel.example.yml` — committed template you copy from.
- `.env.local` (gitignored) — `EXPO_PUBLIC_WS_URL` is auto-written by the
  scripts.
