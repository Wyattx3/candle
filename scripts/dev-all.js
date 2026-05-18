/**
 * Starts the full dev stack:
 *   1. backend WebSocket server on localhost:3000
 *   2. Cloudflare tunnel for wss://ws.candlecan.art
 *   3. Expo Metro with --tunnel
 *
 * Leave this terminal open while testing on a phone.
 */

const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const { spawn } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const backendDir = path.join(rootDir, 'backend');
const envPath = path.join(rootDir, '.env.local');

const backendTunnelConfig = path.join(rootDir, 'cloudflare-tunnel.yml');
const cloudflaredBin = path.join(rootDir, 'cloudflared.exe');

const BACKEND_PORT = Number(process.env.PORT || 3000);
const WS_URL = 'wss://ws.candlecan.art';
const WS_HEALTH_URL = WS_URL.replace(/^ws/, 'http') + '/health';

const children = [];

function command(name) {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

function getSpawnEnv(extra = {}) {
  if (process.platform !== 'win32') return { ...process.env, ...extra };

  const env = {};
  const seen = new Set();
  for (const [key, value] of Object.entries(process.env)) {
    const norm = key.toUpperCase();
    if (norm === 'PATH' || seen.has(norm) || value === undefined) continue;
    seen.add(norm);
    env[key] = value;
  }
  env.Path = process.env.Path || process.env.PATH || '';
  return { ...env, ...extra };
}

function spawnChild(label, cmd, args, options = {}) {
  const child = spawn(cmd, args, {
    cwd: options.cwd || rootDir,
    env: getSpawnEnv(options.env || {}),
    stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
    shell: options.shell ?? (process.platform === 'win32' && /\.(cmd|bat)$/i.test(cmd)),
  });

  children.push(child);

  if (options.stdio === 'inherit') {
    child.on('exit', (code) => {
      if (!options.allowExit) console.log(`[${label}] exited with code ${code}`);
    });
    return child;
  }

  child.stdout?.on('data', (chunk) => {
    process.stdout.write(`[${label}] ${chunk}`);
    options.onOutput?.(chunk.toString());
  });
  child.stderr?.on('data', (chunk) => {
    process.stderr.write(`[${label}] ${chunk}`);
    options.onOutput?.(chunk.toString());
  });
  child.on('exit', (code) => {
    if (!options.allowExit) console.log(`[${label}] exited with code ${code}`);
  });

  return child;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function checkLocalHealth(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function checkUrl(url) {
  return new Promise((resolve) => {
    const client = url.startsWith('https:') ? https : http;
    const req = client.get(url, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForLocalBackend(port, retries = 30) {
  for (let i = 0; i < retries; i += 1) {
    if (await checkLocalHealth(port)) return;
    await wait(1000);
  }
  throw new Error(`Backend did not become healthy on port ${port}`);
}

async function waitForPublicBackend(retries = 30) {
  for (let i = 0; i < retries; i += 1) {
    if (await checkUrl(WS_HEALTH_URL)) return;
    await wait(1000);
  }
  throw new Error(`Backend tunnel did not become healthy at ${WS_HEALTH_URL}`);
}

function writeEnvUrl(wsUrl) {
  const lines = fs.existsSync(envPath)
    ? fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
    : [];
  let found = false;
  const next = lines.map((line) => {
    if (line.startsWith('EXPO_PUBLIC_WS_URL=')) {
      found = true;
      return `EXPO_PUBLIC_WS_URL=${wsUrl}`;
    }
    return line;
  });
  if (!found) next.push(`EXPO_PUBLIC_WS_URL=${wsUrl}`);
  fs.writeFileSync(envPath, `${next.filter(Boolean).join('\n')}\n`);
}

function startCloudflareTunnel(label, configFile) {
  const bin = fs.existsSync(cloudflaredBin) ? cloudflaredBin : 'cloudflared';

  return new Promise((resolve, reject) => {
    const tunnel = spawnChild(label, bin, ['tunnel', '--config', configFile, 'run'], {
      onOutput(text) {
        if (text.includes('Registered tunnel connection')) resolve();
        if (text.includes('level=fatal') || text.includes('failed to unmarshal')) {
          reject(new Error(`[${label}] tunnel config error: ${text.trim()}`));
        }
      },
    });

    tunnel.on('exit', (code) => reject(new Error(`[${label}] exited unexpectedly. Code: ${code}`)));
    setTimeout(() => reject(new Error(`[${label}] timed out`)), 30000);
  });
}

function shutdown() {
  for (const child of children.reverse()) {
    if (!child.killed) child.kill();
  }
}

process.once('SIGINT', () => {
  shutdown();
  process.exit(0);
});
process.once('SIGTERM', () => {
  shutdown();
  process.exit(0);
});

(async () => {
  if (await checkLocalHealth(BACKEND_PORT)) {
    console.log(`[dev] Reusing existing backend on port ${BACKEND_PORT}`);
  } else {
    console.log('[dev] Starting backend...');
    spawnChild('backend', command('npm'), ['run', 'dev'], { cwd: backendDir });
  }

  console.log('[dev] Waiting for backend...');
  await waitForLocalBackend(BACKEND_PORT);
  console.log('[dev] Backend healthy');

  writeEnvUrl(WS_URL);
  console.log(`[dev] Backend WS URL: ${WS_URL}`);

  console.log('[dev] Starting backend tunnel (ws.candlecan.art)...');
  await startCloudflareTunnel('cf-backend', backendTunnelConfig);
  await waitForPublicBackend();
  console.log('[dev] Backend tunnel healthy');

  console.log('[dev] Starting Expo Metro with --tunnel...');
  spawnChild('expo', command('npx'), ['expo', 'start', '-c', '--tunnel'], {
    cwd: rootDir,
    stdio: 'inherit',
  });

  console.log('');
  console.log('Candle is live');
  console.log(`Backend: ${WS_URL}`);
  console.log('Expo: ngrok URL will appear above (--tunnel)');
  console.log('Share the Expo QR while this terminal stays open.');
})().catch((err) => {
  console.error(`[dev] Fatal: ${err.message || err}`);
  shutdown();
  process.exit(1);
});
