const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const processPath = path.join(rootDir, 'node_modules', '@expo', 'ngrok', 'src', 'process.js');
const clientPath = path.join(rootDir, 'node_modules', '@expo', 'ngrok', 'src', 'client.js');
const indexPath = path.join(rootDir, 'node_modules', '@expo', 'ngrok', 'index.js');

function patchFile(filePath, patcher) {
  if (!fs.existsSync(filePath)) {
    console.warn(`[patch-expo-ngrok] Skipping missing file: ${filePath}`);
    return false;
  }

  const before = fs.readFileSync(filePath, 'utf8');
  const after = patcher(before);

  if (after === before) {
    return false;
  }

  fs.writeFileSync(filePath, after);
  return true;
}

const changedProcess = patchFile(processPath, (source) => {
  let next = source;

  if (!next.includes('mkdirSync, writeFileSync')) {
    next = next.replace(
      'const { spawn, exec: execCallback } = require("child_process");\n',
      'const { spawn, exec: execCallback } = require("child_process");\nconst { mkdirSync, writeFileSync } = require("fs");\nconst { dirname } = require("path");\n'
    );
  }

  if (!next.includes('version: "3"\\nagent:')) {
    next = next.replace(
      '  const token = isOpts ? opts.authtoken : optsOrToken;\n\n',
      '  const token = isOpts ? opts.authtoken : optsOrToken;\n\n  if (opts.configPath) {\n    const version = await getVersion().catch(() => "");\n    if (version.startsWith("3.")) {\n      mkdirSync(dirname(opts.configPath), { recursive: true });\n      writeFileSync(\n        opts.configPath,\n        `version: "3"\\nagent:\\n  authtoken: ${JSON.stringify(token)}\\n`\n      );\n      return;\n    }\n  }\n\n'
    );
  }

  return next;
});

const changedClient = patchFile(clientPath, (source) => {
  if (source.includes('...tunnelOptions')) {
    return source;
  }

  return source.replace(
    '  startTunnel(options = {}) {\n    return this.request("post", "api/tunnels", options);\n  }\n',
    '  startTunnel(options = {}) {\n    const {\n      authtoken,\n      configPath,\n      onLogEvent,\n      onStatusChange,\n      port,\n      region,\n      ...tunnelOptions\n    } = options;\n    return this.request("post", "api/tunnels", tunnelOptions);\n  }\n'
  );
});

const changedIndex = patchFile(indexPath, (source) => {
  if (source.includes('already exists')) {
    return source;
  }

  return source.replace(
    '  } catch (err) {\n    if (!isRetriable(err) || retryCount >= 100) {\n',
    '  } catch (err) {\n    if (String(err?.body?.details?.err || "").includes("already exists")) {\n      opts.name = uuid.v4();\n      await new Promise((resolve) => setTimeout(resolve, 200));\n      return connectRetry(opts, ++retryCount);\n    }\n    if (!isRetriable(err) || retryCount >= 100) {\n'
  );
});

if (changedProcess || changedClient || changedIndex) {
  console.log('[patch-expo-ngrok] Applied ngrok v3 compatibility patch.');
} else {
  console.log('[patch-expo-ngrok] Patch already applied.');
}
