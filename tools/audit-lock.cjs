// Compare the lockfile's expected top-level packages against what is actually
// on disk, so we know whether node_modules is complete or still half-installed.
const fs = require('node:fs');
const path = require('node:path');

const lock = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package-lock.json'), 'utf8'));
const root = path.join(__dirname, '..', 'node_modules');

const expected = Object.keys(lock.packages).filter((k) => k.startsWith('node_modules/'));

let missing = 0;
let present = 0;
const missingList = [];

for (const key of expected) {
  // Only top-level entries: node_modules/foo or node_modules/@scope/foo.
  const rel = key.slice('node_modules/'.length);
  const segments = rel.split('/');
  if (segments.length > 2) continue; // nested/transitive copy
  if (fs.existsSync(path.join(root, rel))) present++;
  else {
    missing++;
    missingList.push(rel);
  }
}

console.log(`lock top-level packages: ${present + missing}`);
console.log(`present: ${present}`);
console.log(`missing: ${missing}`);
if (missingList.length) {
  console.log('--- first 60 missing ---');
  missingList.slice(0, 60).forEach((m) => console.log('  ' + m));
}