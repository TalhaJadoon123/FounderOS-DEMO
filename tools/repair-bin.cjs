// Repair node_modules/.bin.
//
// npm never finished its link phase (the install was interrupted repeatedly), so
// .bin is empty. That breaks more than it looks: package install scripts such as
// better-sqlite3's `prebuild-install || node-gyp rebuild` resolve prebuild-install
// *through .bin*, and with .bin empty the prebuild download is skipped and it
// falls through to a node-gyp compile that needs Visual Studio C++ (not
// installed here) and fails.
//
// Regenerating the shims from each package's own `bin` field restores both
// `npm run dev` and the install-script PATH lookup. Windows needs a .cmd wrapper
// (plus a POSIX sh wrapper for completeness) because .bin entries are not
// real executables.
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'node_modules');
const binDir = path.join(root, '.bin');
fs.mkdirSync(binDir, { recursive: true });

/** @returns {Array<{name: string, target: string}>} */
function collectBins(pkgDir) {
  const pkgJson = path.join(pkgDir, 'package.json');
  if (!fs.existsSync(pkgJson)) return [];
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
  } catch {
    return [];
  }
  if (!pkg.bin) return [];

  // `bin` is either a string (named after the package) or a name->path map.
  if (typeof pkg.bin === 'string') {
    const name = pkg.name.startsWith('@') ? pkg.name.split('/')[1] : pkg.name;
    return [{ name, target: pkg.bin }];
  }
  return Object.entries(pkg.bin)
    .filter(([, target]) => typeof target === 'string')
    .map(([name, target]) => ({ name, target }));
}

function packageDirs() {
  const dirs = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === '.bin') continue;
    if (entry.name.startsWith('@')) {
      const scope = path.join(root, entry.name);
      for (const sub of fs.readdirSync(scope, { withFileTypes: true })) {
        if (sub.isDirectory()) dirs.push(path.join(scope, sub.name));
      }
    } else {
      dirs.push(path.join(root, entry.name));
    }
  }
  return dirs;
}

let created = 0;
for (const dir of packageDirs()) {
  for (const { name, target } of collectBins(dir)) {
    const targetPath = path.join(dir, target);
    if (!fs.existsSync(targetPath)) continue; // package incomplete; skip

    // Relative path keeps the tree movable, matching npm's own shims.
    const rel = path.relative(binDir, targetPath).replace(/\\/g, '/');

    fs.writeFileSync(
      path.join(binDir, `${name}.cmd`),
      `@ECHO off\r\n` +
        `SETLOCAL\r\n` +
        `CALL :find_dp0\r\n` +
        `IF EXIST "%dp0%\\node.exe" (SET "_prog=%dp0%\\node.exe") ELSE (` +
        `SET "_prog=node"\r\nSET PATHEXT=%PATHEXT:;.JS;=;%\r\n)\r\n` +
        `endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%" ` +
        `"%dp0%\\${rel}" %*\r\n` +
        `:find_dp0\r\nSET dp0=%~dp0\r\nEXIT /b\r\n`,
      { mode: 0o777 }
    );

    fs.writeFileSync(
      path.join(binDir, name),
      `#!/bin/sh\nbasedir=$(dirname "$(echo "$0" | sed -e 's,\\\\,/,g')")\n` +
        `exec node "$basedir/${rel}" "$@"\n`,
      { mode: 0o755 }
    );
    created++;
  }
}

console.log(`created ${created} bin shims in ${binDir}`);