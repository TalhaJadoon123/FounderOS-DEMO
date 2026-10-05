// Repair esbuild's platform binary packages.
//
// The interrupted installs left every @esbuild/* directory empty — the wrapper
// package extracted, the per-platform binary did not. Two distinct copies are
// needed and they are pinned to different versions:
//   node_modules/@esbuild/win32-x64              (0.28.0, for vitest)
//   node_modules/vite/node_modules/@esbuild/win32-x64 (0.21.5, for vite)
//
// Only the host platform matters; the other 20-odd directories are optional
// deps for other OSes and stay empty by design.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const repoRoot = path.join(__dirname, '..');
const lock = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package-lock.json'), 'utf8'));
const tmpRoot = path.join(os.tmpdir(), 'opencode', 'repair');
fs.mkdirSync(tmpRoot, { recursive: true });

const pkg = '@esbuild/win32-x64';

for (const base of ['node_modules', 'node_modules/vite/node_modules']) {
  const key = `${base}/${pkg}`;
  const entry = lock.packages[key];
  if (!entry) {
    console.log(`  ${key}: not in lockfile, skipped`);
    continue;
  }
  const version = entry.version;
  const url = entry.resolved || `https://registry.npmjs.org/${pkg}/-/${pkg.split('/')[1]}-${version}.tgz`;
  const tgz = path.join(tmpRoot, `esbuild-win32-x64-${version}.tgz`);
  const dest = path.join(repoRoot, base, '@esbuild', 'win32-x64');

  try {
    execFileSync(
      'powershell.exe',
      ['-NoProfile', '-Command',
        `[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;` +
        `Invoke-WebRequest -Uri '${url}' -OutFile '${tgz}' -TimeoutSec 300`],
      { stdio: 'pipe' }
    );
    fs.mkdirSync(dest, { recursive: true });
    execFileSync('tar', ['-xzf', tgz, '-C', dest, '--strip-components=1'], { stdio: 'pipe' });
    console.log(`  ${key}: ${fs.existsSync(path.join(dest, 'package.json')) ? 'repaired' : 'NO MANIFEST'}`);
  } catch (err) {
    const detail = [err.message, err.stderr].filter(Boolean).map(String).join(' | ');
    console.error(`  ${key}: FAILED - ${detail.slice(0, 400)}`);
  }
}

// esbuild's wrapper resolves the binary through a generated ESBUILD_BINARY_PATH
// or the sibling package; verify both copies actually have an executable.
for (const base of ['node_modules', 'node_modules/vite/node_modules']) {
  const exe = path.join(repoRoot, base, '@esbuild', 'win32-x64', 'esbuild.exe');
  console.log(`  ${base}: esbuild.exe ${fs.existsSync(exe) ? 'present' : 'MISSING'}`);
}