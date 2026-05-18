const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const { spawn } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const envPath = path.join(rootDir, '.env.local');
const cloudflaredBin = path.join(rootDir, 'cloudflared.exe');
const configPath = path.join(rootDir, 'cloudflare-tunnel.yml');
const port = Number(process.env.BACKEND_PORT || process.env.PORT || 3000);
const wsUrl = process.env.EXPO_PUBLIC_WS_URL || 'wss://ws.candlecan.art';
const healthUrl = wsUrl.replace(/^ws/, 'http') + '/health';
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

function upsertEnvValue(filePath, key, value) {
  const lines = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
    : [];

  let found = false;
  const nextLines = lines.map((line) => {
    if (line.startsWith(`${key}=`)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });

  if (!found) nextLines.push(`${key}=${value}`);
  fs.writeFileSync(filePath, `${nextLines.filter(Boolean).join('\n')}\n`);
}

function checkLocalHealth() {
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

async function waitForLocalBackend() {
  for (let i = 0; i < 30; i += 1) {
    if (await checkLocalHealth()) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Backend did not become healthy on port ${port}`);
}

async function waitForPublicHealth() {
  for (let i = 0; i < 30; i += 1) {
    if (await checkUrl(healthUrl)) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Tunnel did not become healthy at ${healthUrl}`);
}

function spawnChild(label, cmd, args, options = {}) {
  const child = spawn(cmd, args, {
    cwd: options.cwd || rootDir,
    env: getSpawnEnv(options.env || {}),
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(cmd),
  });

  child.stdout.on('data', (chunk) => process.stdout.write(`[${label}] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[${label}] ${chunk}`));
  children.push(child);
  return child;
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
  upsertEnvValue(envPath, 'EXPO_PUBLIC_WS_URL', wsUrl);

  if (!(await checkLocalHealth())) {
    console.log(`[backend:tunnel] Starting backend on port ${port}...`);
    spawnChild('backend', command('npm'), ['run', 'dev'], {
      cwd: path.join(rootDir, 'backend'),
    });
  }

  console.log('[backend:tunnel] Waiting for local backend...');
  await waitForLocalBackend();

  const bin = fs.existsSync(cloudflaredBin) ? cloudflaredBin : 'cloudflared';
  console.log(`[backend:tunnel] Starting Cloudflare tunnel for ${wsUrl}...`);
  const tunnel = spawnChild('cloudflared', bin, ['tunnel', '--config', configPath, 'run']);

  tunnel.on('exit', (code) => {
    console.log(`[backend:tunnel] Cloudflare tunnel exited with code ${code}`);
    process.exit(code ?? 0);
  });

  tunnel.on('error', (error) => {
    console.error(error.message || error);
    process.exit(1);
  });

  await waitForPublicHealth();
  console.log(`[backend:tunnel] Ready: ${wsUrl}`);
  console.log(`[backend:tunnel] Updated ${envPath}`);
  console.log('[backend:tunnel] Leave this terminal open while testing on your phone.');
})().catch((error) => {
  console.error(`[backend:tunnel] Fatal: ${error.message || error}`);
  process.exit(1);
});
