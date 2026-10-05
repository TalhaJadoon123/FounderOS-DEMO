// One-off integrity audit: the interrupted npm installs left packages partially
// extracted (files missing). Webpack resolves via the "import" condition, so a
// package missing its .mjs entry fails as "Can't resolve '<pkg>'".
// Walks every installed package and checks that the entry points its own
// package.json advertises actually exist on disk.
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'node_modules');
const broken = [];
let checked = 0;

/** Collect the file targets an exports map points at. */
function exportTargets(exportsField, out) {
  if (typeof exportsField === 'string') {
    out.push(exportsField);
    return;
  }
  if (Array.isArray(exportsField)) {
    exportsField.forEach((e) => exportTargets(e, out));
    return;
  }
  if (exportsField && typeof exportsField === 'object') {
    for (const v of Object.values(exportsField)) exportTargets(v, out);
  }
}

/** Scoped dirs (@next/x) nest one level deeper. */
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

for (const dir of packageDirs()) {
  const pkgJson = path.join(dir, 'package.json');
  if (!fs.existsSync(pkgJson)) continue;
  checked++;

  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
  } catch {
    broken.push({ pkg: path.relative(root, dir), reason: 'package.json is unparseable' });
    continue;
  }

  const targets = [];
  if (pkg.main) targets.push(pkg.main);
  if (pkg.module) targets.push(pkg.module);
  if (pkg.types) targets.push(pkg.types);
  if (typeof pkg.exports === 'string' || Array.isArray(pkg.exports)) {
    exportTargets(pkg.exports, targets);
  } else if (pkg.exports && typeof pkg.exports === 'object') {
    for (const [key, value] of Object.entries(pkg.exports)) {
      if (key === './package.json') continue;
      exportTargets(value, targets);
    }
  }

  // npm manifests frequently point at an extensionless path ("ms" -> "./index"),
  // so a bare existsSync check reports false breakage. Resolve like Node does.
  const EXTENSIONS = ['', '.js', '.cjs', '.mjs', '.json', '.ts', '.node'];
  const INDEX_FILES = ['index.js', 'index.cjs', 'index.mjs', 'index.json', 'index.ts'];

  function resolves(target) {
    const clean = target.replace(/^\.\//, '');
    const base = path.join(dir, clean);
    if (EXTENSIONS.some((ext) => fs.existsSync(base + ext))) return true;
    if (fs.existsSync(base) && fs.statSync(base).isDirectory()) {
      // Directory target: package may expose a nested index or its own manifest.
      if (INDEX_FILES.some((f) => fs.existsSync(path.join(base, f)))) return true;
      if (fs.existsSync(path.join(base, 'package.json'))) return true;
    }
    return false;
  }

  const missing = targets.filter((t) => {
    if (typeof t !== 'string') return false;
    const clean = t.replace(/^\.\//, '');
    if (clean.includes('*')) return false; // wildcard patterns can't be checked cheaply
    return !resolves(t);
  });

  if (missing.length) {
    broken.push({
      pkg: pkg.name || path.relative(root, dir),
      reason: `missing ${[...new Set(missing)].join(', ')}`,
    });
  }
}

console.log(`audited ${checked} packages, ${broken.length} broken`);
for (const b of broken) console.log(`  ${b.pkg}: ${b.reason}`);
process.exit(broken.length ? 1 : 0);