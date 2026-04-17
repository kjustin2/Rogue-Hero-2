#!/usr/bin/env node
// check-syntax.js — syntax-check all src/*.js files using Node's module parser
// Usage: node check-syntax.js
// Output: syntax-report.txt (and stdout)

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const SRC = join(__dirname, 'src');
const OUT = join(__dirname, 'syntax-report.txt');

function collectJs(dir) {
  const out = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...collectJs(full));
    else if (ent.isFile() && ent.name.endsWith('.js')) out.push(full);
  }
  return out;
}
const files = collectJs(SRC).sort();

const lines = [];
const stamp = new Date().toISOString();
lines.push(`Syntax check — ${stamp}`);
lines.push(`Checked ${files.length} files in src/`);
lines.push('='.repeat(60));

let errorCount = 0;
let okCount = 0;

for (const file of files) {
  const rel = file.replace(__dirname, '').replace(/\\/g, '/');

  // Use node --check (parse-only, no execution) which works for both CJS and ESM syntax
  const result = spawnSync(process.execPath, ['--input-type=module', '--check'], {
    input: readFileSync(file, 'utf8'),
    encoding: 'utf8',
  });

  if (result.status === 0) {
    lines.push(`  OK   ${rel}`);
    okCount++;
  } else {
    const err = (result.stderr || result.stdout || '').trim()
      // Node prints the synthetic filename "stdin" — replace with actual path
      .replace(/stdin:/g, `${rel}:`)
      .replace(/\[stdin\]/g, rel);
    lines.push(`  FAIL ${rel}`);
    lines.push(`       ${err.split('\n').join('\n       ')}`);
    errorCount++;
  }
}

lines.push('='.repeat(60));
lines.push(`Result: ${okCount} OK, ${errorCount} error(s)`);

const report = lines.join('\n');
console.log(report);
writeFileSync(OUT, report + '\n', 'utf8');
console.log(`\nReport written to: ${OUT}`);
process.exit(errorCount > 0 ? 1 : 0);
