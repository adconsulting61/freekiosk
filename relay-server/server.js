const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

// Load .env file if present (local PC use)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [key, ...val] = line.split('=');
    if (key && !key.startsWith('#') && val.length) {
      process.env[key.trim()] = val.join('=').trim();
    }
  });
}

const PORT = process.env.PORT || 3000;
const SECRET = process.env.STREAM_SECRET || '';

// deviceId -> WebSocket (one tablet per device)
const tablets = new Map();
// deviceId -> Set<WebSocket> (many admin viewers per device)
const admins = new Map();

// ── HTTP server (serves admin dashboard + REST) ────────────────────────────
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost`);

  if (url.pathname === '/setup') {
    const setupPath = path.join(__dirname, 'public', 'setup.html');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    fs.createReadStream(setupPath).pipe(res);
    return;
  }

  if (url.pathname === '/api/devices') {
    const list = Array.from(tablets.entries()).map(([id, ws]) => ({
      deviceId: id,
      viewers: admins.get(id)?.size ?? 0,
      connected: ws.readyState === WebSocket.OPEN,
    }));
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(list));
    return;
  }

  // Serve admin dashboard
  const dashboardPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(dashboardPath)) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    fs.createReadStream(dashboardPath).pipe(res);
  } else {
    res.writeHead(404);
    res.end('Admin dashboard not found');
  }
});

// ── WebSocket relay ────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'ws://localhost');
  const role = url.searchParams.get('role');      // 'tablet' | 'admin'
  const deviceId = url.searchParams.get('deviceId');
  const secret = url.searchParams.get('secret') || '';

  // Optional secret check
  if (SECRET && secret !== SECRET) {
    ws.close(4001, 'Unauthorized');
    return;
  }

  if (!deviceId) {
    ws.close(4002, 'Missing deviceId');
    return;
  }

  if (role === 'tablet') {
    // Disconnect any existing tablet for this device
    const existing = tablets.get(deviceId);
    if (existing && existing.readyState === WebSocket.OPEN) {
      existing.close(1000, 'Replaced by new connection');
    }
    tablets.set(deviceId, ws);
    console.log(`[+] Tablet connected: ${deviceId} (${tablets.size} total)`);

    ws.on('message', (data, isBinary) => {
      // Forward JPEG frame to all admin viewers of this device
      const watchers = admins.get(deviceId);
      if (!watchers || watchers.size === 0) return;
      watchers.forEach(adminWs => {
        if (adminWs.readyState === WebSocket.OPEN) {
          adminWs.send(data, { binary: isBinary });
        }
      });
    });

    ws.on('close', () => {
      tablets.delete(deviceId);
      console.log(`[-] Tablet disconnected: ${deviceId}`);
      // Notify admin viewers that tablet went offline
      const watchers = admins.get(deviceId);
      if (watchers) {
        const msg = JSON.stringify({ type: 'tablet_offline', deviceId });
        watchers.forEach(a => {
          if (a.readyState === WebSocket.OPEN) a.send(msg);
        });
      }
    });

    ws.on('error', (err) => console.error(`Tablet ${deviceId} error:`, err.message));

  } else if (role === 'admin') {
    if (!admins.has(deviceId)) admins.set(deviceId, new Set());
    admins.get(deviceId).add(ws);
    console.log(`[+] Admin viewing: ${deviceId} (${admins.get(deviceId).size} viewers)`);

    // Tell admin if tablet is currently offline
    if (!tablets.has(deviceId) || tablets.get(deviceId).readyState !== WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'tablet_offline', deviceId }));
    }

    ws.on('close', () => {
      admins.get(deviceId)?.delete(ws);
      if (admins.get(deviceId)?.size === 0) admins.delete(deviceId);
      console.log(`[-] Admin left: ${deviceId}`);
    });

    ws.on('error', (err) => console.error(`Admin ${deviceId} error:`, err.message));

  } else {
    ws.close(4003, 'Invalid role');
  }
});

server.listen(PORT, () => {
  console.log(`FreeKiosk relay server running on port ${PORT}`);
  if (SECRET) {
    console.log('Secret auth: enabled');
  } else {
    console.log('Secret auth: disabled (set STREAM_SECRET env var to enable)');
  }
});
