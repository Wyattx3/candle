const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const envPath = path.join(rootDir, '.env.local');
const port = Number(process.env.BACKEND_PORT || process.env.PORT || 3000);
const subdomain = process.env.SERVEO_SUBDOMAIN;
const urlPattern = /https:\/\/[^\s]+\.serveousercontent\.com/;

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

  if (!found) {
    nextLines.push(`${key}=${value}`);
  }

  fs.writeFileSync(filePath, `${nextLines.filter(Boolean).join('\n')}\n`);
}

console.log(`Starting WebSocket tunnel for 127.0.0.1:${port}`);

const tunnel = spawn(
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
  { stdio: ['ignore', 'pipe', 'pipe'] }
);

let hasUrl = false;

function handleOutput(chunk) {
  const text = chunk.toString();
  process.stdout.write(text);

  const match = text.match(urlPattern);
  if (!match || hasUrl) return;

  hasUrl = true;
  const wsUrl = match[0].replace(/^http/, 'ws');
  upsertEnvValue(envPath, 'EXPO_PUBLIC_WS_URL', wsUrl);

  console.log(`Backend WebSocket tunnel ready: ${wsUrl}`);
  console.log(`Updated ${envPath}`);
  console.log('Restart Expo with: npx expo start --tunnel -c');
  console.log('Leave this terminal open while testing on your phone.');
}

tunnel.stdout.on('data', handleOutput);
tunnel.stderr.on('data', handleOutput);

tunnel.on('exit', (code) => {
  console.log(`Backend WebSocket tunnel exited with code ${code}`);
  process.exit(code ?? 0);
});

tunnel.on('error', (error) => {
  console.error(error.message || error);
  process.exit(1);
});

setTimeout(() => {
  if (!hasUrl) {
    console.error('Timed out waiting for tunnel URL.');
    tunnel.kill();
    process.exit(1);
  }
}, 30_000);

process.once('SIGINT', () => {
  tunnel.kill();
  process.exit(0);
});

process.once('SIGTERM', () => {
  tunnel.kill();
  process.exit(0);
});
