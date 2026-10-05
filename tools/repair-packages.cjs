// Repair packages whose package.json never landed.
//
// Repeated interrupted `npm install` runs left several packages half-extracted
// (files present, manifest missing), which makes them unresolvable. npm itself
// keeps dying mid-extraction in this environment, so repair the tarballs
// directly: read name+version from package-lock.json, download from the
// registry, and untar over the existing directory with --strip-components=1.
//
// Only the packages reported by audit-manifest.cjs are touched; optional deps
// that are empty because they target other platforms are deliberately skipped.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const repoRoot = path.join(__dirname, '..');
const lock = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package-lock.json'), 'utf8'));
const nodeModules = path.join(repoRoot, 'node_modules');

// `pkg@version` from the lockfile. Version matters: the tarball URL is pinned.
const targets = process.argv.slice(2);
if (!targets.length) {
  console.error('usage: node repair-packages.cjs <pkg>[@version] ...');
  process.exit(1);
}

const tmpRoot = path.join(os.tmpdir(), 'opencode', 'repair');
fs.mkdirSync(tmpRoot, { recursive: true });

for (const spec of targets) {
  // Split name from an optional @version. A scoped name starts with '@', so the
  // separator is the *second* '@' in "@scope/name@1.2.3".
  const sep = spec.indexOf('@', spec.startsWith('@') ? 1 : 0);
  const name = sep === -1 ? spec : spec.slice(0, sep);
  const version = sep === -1 ? null : spec.slice(sep + 1);

  const lockKey = `node_modules/${name}`;
  const entry = lock.packages[lockKey];
  const ver = version || (entry && entry.version);
  if (!ver) {
    console.error(`  ${name}: no version in lockfile, skipping`);
    continue;
  }

  // Scoped names keep their slash in the tarball URL.
  const tarName = name.startsWith('@') ? name.split('/')[1] : name;
  const url = `https://registry.npmjs.org/${name}/-/${tarName}-${ver}.tgz`;
  const tgz = path.join(tmpRoot, `${tarName}-${ver}.tgz`);
  const dest = path.join(nodeModules, name);

  try {
    execFileSync(
      'powershell.exe',
      ['-NoProfile', '-Command',
        `[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;` +
        `Invoke-WebRequest -Uri '${url}' -OutFile '${tgz}' -TimeoutSec 300`],
      { stdio: 'pipe' }
    );

    fs.mkdirSync(dest, { recursive: true });
    // Overwrite in place; tar replaces files it has and leaves the rest alone.
    execFileSync('tar', ['-xzf', tgz, '-C', dest, '--strip-components=1'], { stdio: 'pipe' });

    const ok = fs.existsSync(path.join(dest, 'package.json'));
    console.log(`  ${name}@${ver}: ${ok ? 'repaired' : 'EXTRACTED BUT NO MANIFEST'}`);
  } catch (err) {
    const detail = [err.message, err.stdout, err.stderr]
      .filter(Boolean)
      .map((d) => String(d).trim())
      .join(' | ');
    console.error(`  ${name}@${ver}: FAILED - ${detail.slice(0, 600)}`);
  }
}