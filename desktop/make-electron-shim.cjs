// Create the electron launcher shims in desktop/node_modules/.bin.
//
// The desktop install was interrupted before npm linked .bin, and the `start`
// script resolves `electron` through it. Recreating the shim by hand is more
// reliable here than another install attempt.
const fs = require('node:fs');
const path = require('node:path');

// This file lives at desktop/make-electron-shim.cjs, so __dirname is already
// the desktop package root that owns node_modules.
const desktopRoot = __dirname;
const binDir = path.join(desktopRoot, 'node_modules', '.bin');
const target = path.join(desktopRoot, 'node_modules', 'electron', 'dist', 'electron.exe');

if (!fs.existsSync(target)) {
  console.error(`electron binary missing at ${target}`);
  process.exit(1);
}
fs.mkdirSync(binDir, { recursive: true });

const rel = path.relative(binDir, target).replace(/\\/g, '/');
// A .cmd resolves relative paths against the *current directory*, not against
// its own location, so the wrapper has to anchor on %~dp0 (the batch file's
// own directory) the way npm's own shims do.
fs.writeFileSync(
  path.join(binDir, 'electron.cmd'),
  '@ECHO off\r\n' +
    'SETLOCAL\r\n' +
    `"%~dp0\\${rel}" %*\r\n`
);
fs.writeFileSync(path.join(binDir, 'electron'), `#!/bin/sh\nexec "$(dirname "$0")/${rel}" "$@"\n`);

console.log(`electron shims created -> ${rel}`);