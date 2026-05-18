const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const keepAwakeIndexPath = path.join(
  rootDir,
  'node_modules',
  'expo-keep-awake',
  'src',
  'index.ts'
);

if (!fs.existsSync(keepAwakeIndexPath)) {
  console.warn(`[patch-expo-keep-awake] Skipping missing file: ${keepAwakeIndexPath}`);
  process.exit(0);
}

const before = fs.readFileSync(keepAwakeIndexPath, 'utf8');

if (before.includes('non-fatal native wake-lock activation failures')) {
  console.log('[patch-expo-keep-awake] Patch already applied.');
  process.exit(0);
}

const target = `    activateKeepAwakeAsync(tagOrDefault).then(() => {
      if (isMounted && ExpoKeepAwake.addListenerForTag && options?.listener) {
        addListener(tagOrDefault, options.listener);
      }
    });`;

const replacement = `    activateKeepAwakeAsync(tagOrDefault)
      .then(() => {
        if (isMounted && ExpoKeepAwake.addListenerForTag && options?.listener) {
          addListener(tagOrDefault, options.listener);
        }
      })
      .catch((error) => {
        // Expo dev tools pass suppressDeactivateWarnings; use the same flag to avoid
        // surfacing non-fatal native wake-lock activation failures as redboxes.
        if (!options?.suppressDeactivateWarnings) {
          throw error;
        }
      });`;

const after = before.replace(target, replacement);

if (after === before) {
  console.warn('[patch-expo-keep-awake] Expected source block not found; no changes made.');
  process.exit(0);
}

fs.writeFileSync(keepAwakeIndexPath, after);
console.log('[patch-expo-keep-awake] Applied dev keep-awake rejection patch.');
