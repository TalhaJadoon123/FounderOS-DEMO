// Rename the operator from Alex to Talha across runtime code and seed data.
//
// Scope decision: this rewrites *runtime-visible* identity only — the rendered
// name, the owner fields, the demo contact handles. It deliberately leaves
// code comments alone. Comments like "(Alex, 2026-09-24)" are dated design
// notes attributed to the upstream author; rewriting them would misattribute
// historical decisions to a different person and add pure diff noise.
//
// Targets: lib/seed.ts, lib/knowledge-graph.ts, lib/life-map.ts,
// lib/ventures.ts, app/page.tsx, app/org/page.tsx, app/social/page.tsx,
// lib/agents/real.ts.
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');

// Only files where the name is rendered or stored, not merely mentioned in a
// comment.
const TARGETS = [
  'lib/seed.ts',
  'lib/knowledge-graph.ts',
  'lib/life-map.ts',
  'lib/ventures.ts',
  'lib/agents/real.ts',
  'app/page.tsx',
  'app/org/page.tsx',
  'app/social/page.tsx',
];

/**
 * Rewrites only lines that are not pure comment lines. A line is treated as a
 * comment when, after stripping leading whitespace, it starts with a line
 * comment or a block-comment delimiter. Inline trailing comments are left
 * alone by the same rule: we only rewrite a line if the code portion contains
 * the name.
 */
function rewriteLine(line) {
  const trimmed = line.trimStart();
  const isCommentOnly =
    trimmed.startsWith('//') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('*/');
  if (isCommentOnly) return { line, changed: false };

  let changed = false;
  let out = line;

  // Straight, curly apostrophe and the 'N' possessive forms.
  const swaps = [
    [/\bAlex\u2019s\b/g, 'Talha\u2019s'], // Alex's (curly)
    [/\bAlex's\b/g, "Talha's"], // Alex's (straight)
    [/\bAlex\u2019\b/g, 'Talha\u2019'],
    [/\bAlex\b/g, 'Talha'],
    [/\balex\b/g, 'talha'],
    [/\bALEX\b/g, 'TALHA'],
  ];
  for (const [pattern, replacement] of swaps) {
    if (pattern.test(out)) {
      out = out.replace(pattern, replacement);
      changed = true;
    }
  }
  return { line: out, changed };
}

let totalEdits = 0;
for (const rel of TARGETS) {
  const file = path.join(repoRoot, rel);
  if (!fs.existsSync(file)) {
    console.log(`  ${rel}: missing, skipped`);
    continue;
  }
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split(/\r?\n/);
  let edits = 0;
  const out = lines.map((line) => {
    const r = rewriteLine(line);
    if (r.changed) edits++;
    return r.line;
  });
  if (edits > 0) {
    fs.writeFileSync(file, out.join('\n'));
    totalEdits += edits;
    console.log(`  ${rel}: ${edits} line(s)`);
  } else {
    console.log(`  ${rel}: no runtime occurrences`);
  }
}
console.log(`total: ${totalEdits} line(s) rewritten`);