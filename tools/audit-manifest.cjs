// Find installed package directories that are structurally incomplete.
//
// The repeated interrupted installs left some packages half-extracted. The
// earlier audit skipped any directory without a package.json, which is exactly
// the worst case, so this one reports those explicitly: a directory that npm
// created but whose manifest never landed is a package that cannot be resolved.
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'node_modules');
const damaged = [];

function packageDirs() {
  const dirs = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === '.bin') continue;
    if (entry.name.startsWith('@')) {
      const scope = path.join(root, entry.name);
      if (!fs.existsSync(scope)) continue;
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
  if (!fs.existsSync(pkgJson)) {
    const fileCount =
      fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).length;
    damaged.push({ pkg: path.relative(root, dir).replace(/\\/g, '/'), fileCount, why: 'package.json missing' });
  }
}

console.log(`scanned ${packageDirs().length} package dirs, ${damaged.length} damaged`);
for (const d of damaged) console.log(`  ${d.pkg} (${d.fileCount} loose files) - ${d.why}`);
process.exit(damaged.length ? 1 : 0);