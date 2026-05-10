const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const backendDir = path.join(rootDir, 'backend');
const envPath = path.join(rootDir, '.env.local');
const port = Number(process.env.PORT || 3000);
const subdomain = process.env.SERVEO_SUBDOMAIN;
const expoMode = process.env.EXPO_MODE || 'tunnel';
const tunnelUrlPattern = /https:\/\/[^\s]+\.serveousercontent\.com/;
const children = [];

function command(name) {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

function getSpawnEnv() {
  if (process.platform !== 'win32') {
    return process.env;
  }

  const env = {};
  const seen = new Set();

  for (const [key, value] of Object.entries(process.env)) {
    const normalized = key.toUpperCase();

    if (normalized === 'PATH') {
      continue;
    }

    if (seen.has(normalized) || value === undefined) {
      continue;
    }

    seen.add(normalized);
    env[key] = value;
  }

  env.Path = process.env.Path || process.env.PATH || '';
  return env;
}

function spawnChild(label, cmd, args, options = {}) {
  const child = spawn(cmd, args, {
    cwd: options.cwd || rootDir,
    env: getSpawnEnv(),
    stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
    shell: options.shell ?? (process.platform === 'win32' && /\.(cmd|bat)$/i.test(cmd)),
  });

  children.push(child);

  if (options.stdio === 'inherit' || (Array.isArray(options.stdio) && options.stdio.includes('inherit'))) {
    child.on('exit', (code) => {
      if (!options.allowExit) {
        console.log(`[${label}] exited with code ${code}`);
      }
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
    if (!options.allowExit) {
      console.log(`[${label}] exited with code ${code}`);
    }
  });

  return child;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function checkHealth() {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });

    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForBackend() {
  for (let i = 0; i < 30; i += 1) {
    if (await checkHealth()) return;
    await wait(1000);
  }

  throw new Error(`Backend did not become healthy on port ${port}`);
}

function writeEnvUrl(wsUrl) {
  const lines = fs.existsSync(envPath)
    ? fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
    : [];

  let found = false;
  const nextLines = lines.map((line) => {
    if (line.startsWith('EXPO_PUBLIC_WS_URL=')) {
      found = true;
      return `EXPO_PUBLIC_WS_URL=${wsUrl}`;
    }
    return line;
  });

  if (!found) {
    nextLines.push(`EXPO_PUBLIC_WS_URL=${wsUrl}`);
  }

  fs.writeFileSync(envPath, `${nextLines.filter(Boolean).join('\n')}\n`);
}

function startTunnel() {
  return new Promise((resolve, reject) => {
    let resolved = false;

    const tunnel = spawnChild(
      'tunnel',
      'ssh',
      [
        '-o',
        'StrictHostKeyChecking=no',
        '-o',
        'ServerAliveInterval=30',
        '-R',
        subdomain ? `${subdomain}:80:127.0.0.1:${port}` : `80:127.0.0.1:${port}`,
        'serveo.net',
      ],
      {
        onOutput(text) {
          const match = text.match(tunnelUrlPattern);
          if (!match || resolved) return;

          resolved = true;
          const wsUrl = match[0].replace(/^http/, 'ws');
          writeEnvUrl(wsUrl);
          console.log(`[dev] WebSocket URL: ${wsUrl}`);
          resolve(wsUrl);
        },
      }
    );

    tunnel.on('exit', (code) => {
      if (!resolved) {
        reject(new Error(`Tunnel exited before URL was ready. Code: ${code}`));
      }
    });

    setTimeout(() => {
      if (!resolved) {
        reject(new Error('Timed out waiting for WebSocket tunnel URL'));
      }
    }, 30000);
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
  if (await checkHealth()) {
    console.log(`[dev] Reusing existing backend on port ${port}`);
  } else {
    console.log('[dev] Starting backend...');
    spawnChild('backend', command('npm'), ['run', 'dev'], { cwd: backendDir });
  }

  console.log('[dev] Waiting for backend health...');
  await waitForBackend();

  console.log('[dev] Starting WebSocket tunnel...');
  await startTunnel();

  console.log('[dev] Starting Expo after tunnel URL is written...');
  const expoArgs = ['expo', 'start', '-c'];
  if (expoMode === 'tunnel') {
    expoArgs.push('--tunnel');
  } else {
    expoArgs.push('--lan');
  }

  spawnChild('expo', command('npx'), expoArgs, {
    cwd: rootDir,
    stdio: 'inherit',
  });
})().catch((error) => {
  console.error(`[dev] ${error.message || error}`);
  shutdown();
  process.exit(1);
});
