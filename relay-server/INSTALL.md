# FreeKiosk Relay Server — Installation Guide

Relay server for FreeKiosk remote screen monitoring.  
Tablets stream JPEG frames → relay → admin browser dashboard.

---

## Architecture

```
Android Tablet
  └─ ScreenStreamService (MediaProjection → JPEG)
       └─ WebSocket  →  Relay Server  →  WebSocket  →  Admin Browser
```

---

## Option A — Railway (free cloud, 500 hrs/month)

**Best for: getting started, low cost**

1. Push the `relay-server/` folder to a GitHub repository
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
3. Select your repository
4. Railway auto-detects Node.js and deploys
5. In Railway dashboard: **Variables** → add `STREAM_SECRET` = any random string (e.g. `mySecret123`)
6. In Railway dashboard: **Settings → Networking → Generate Domain**
7. Your WebSocket URL: `wss://your-project.up.railway.app`

When free hours run out → switch to Option C (Windows PC).

---

## Option B — Render (free cloud)

**Note: spins down after 15 min idle, cold start ~30 seconds**

1. Push `relay-server/` folder to a GitHub repository
2. Go to [render.com](https://render.com) → New → Web Service → connect repo
3. Build command: `npm install`
4. Start command: `node server.js`
5. Add env var: `STREAM_SECRET` = any random string
6. Deploy → your URL: `wss://your-app.onrender.com`

---

## Option C — Windows PC (local, permanent)

**Best for: always-on after Railway hours run out**

### Prerequisites
- Windows 10 or 11
- Internet connection

### Steps

1. Copy the `relay-server/` folder to your PC (e.g. `C:\freekiosk-relay`)
2. Open PowerShell **as Administrator** (right-click Start → Windows PowerShell (Admin))
3. Navigate to the folder:
   ```powershell
   cd C:\freekiosk-relay
   ```
4. Run the installer:
   ```powershell
   powershell -ExecutionPolicy Bypass -File install-windows.ps1
   ```
5. The script will:
   - Install Node.js 20 (if not present)
   - Install pm2 process manager
   - Copy files to `C:\freekiosk-relay`
   - Generate a random secret key
   - Open firewall port 3000
   - Start the server (survives reboots automatically)
6. **Note the secret key printed at the end** — you need it in the kiosk app

### For internet access (tablets not on same WiFi)

Option 1 — Port forwarding:
- Log into your router (usually `192.168.1.1`)
- Port forwarding: external port `3000` → your PC's local IP, port `3000`
- Find your public IP at [whatismyip.com](https://www.whatismyip.com)
- Relay URL: `ws://YOUR-PUBLIC-IP:3000`

Option 2 — DuckDNS (free, stable URL even if home IP changes):
- Create free account at [duckdns.org](https://www.duckdns.org)
- Set up auto-update client on your PC
- Relay URL: `ws://yourname.duckdns.org:3000`

### Useful commands (run in PowerShell)
```powershell
pm2 status                      # Check if running
pm2 logs FreeKioskRelay         # View live logs
pm2 restart FreeKioskRelay      # Restart server
pm2 stop FreeKioskRelay         # Stop server
```

---

## Option D — Linux VPS (e.g. DigitalOcean $4/month)

```bash
# SSH into your server, then:
bash install-linux.sh
```

The script installs Node.js 20, pm2, opens port 3000, and starts the service on boot.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the server listens on |
| `STREAM_SECRET` | *(empty)* | Secret token required by tablets and admin browser. Leave empty to disable auth (local network only). |

Set these in a `.env` file (local) or via the cloud dashboard (Railway/Render).

**`.env` example:**
```
PORT=3000
STREAM_SECRET=change-me-to-random-string
```

---

## Kiosk App Configuration

After the relay server is running:

1. On the tablet: enter admin PIN → Settings → **Advanced** tab
2. Scroll to **Remote Monitoring**
3. Toggle **Enable Remote Screen Monitoring** ON
4. Enter **Relay Server URL** (`ws://` or `wss://` address from above)
5. Tap **Start Streaming**
6. Android shows a *"Start recording?"* system dialog → tap **Start now**
7. Stream begins

> The device ID shown in the settings is the unique identifier for this tablet. It persists across sessions.

---

## Admin Dashboard

Open `http://YOUR-SERVER-IP:3000` in any browser.

- Left sidebar: connected tablets
- Click a tablet to watch its live stream (~2 fps)
- **📷 Snapshot** button saves a JPEG screenshot
- FPS counter shown in bottom-right of stream

Setup guide also available at: `http://YOUR-SERVER-IP:3000/setup`

---

## Switching from Railway to Windows PC mid-month

1. Run `install-windows.ps1` on your PC (Option C above)
2. Set up port forwarding on your router
3. Note your new relay URL (`ws://YOUR-PUBLIC-IP:3000`)
4. On each tablet: Settings → Advanced → Remote Monitoring → update URL → Stop → Start Streaming
5. In Railway: pause or delete the project to stop consuming hours

The tablet's device ID does not change — the admin dashboard reconnects automatically.

---

## Security Notes

- Always set `STREAM_SECRET` if the relay server is exposed to the internet
- Use `wss://` (WebSocket over TLS) for production — set up nginx as a reverse proxy with a Let's Encrypt SSL certificate
- The stream contains live screen content — treat the secret key like a password

---

## Files in this folder

| File | Purpose |
|---|---|
| `server.js` | Node.js WebSocket relay server |
| `package.json` | Dependencies (only `ws`) |
| `install-windows.ps1` | One-click Windows installer |
| `install-linux.sh` | Linux/Mac installer |
| `railway.toml` | Railway cloud deploy config |
| `render.yaml` | Render cloud deploy config |
| `Dockerfile` | Docker container config |
| `.env.example` | Environment variable template |
| `public/index.html` | Admin browser dashboard |
| `public/setup.html` | Interactive setup guide |
