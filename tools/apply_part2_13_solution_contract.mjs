// Apply shared №13 solution contract normalizations to source task JSON.

import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeCosPmInProto } from './part2_13_trig_solution_contract.mjs';
import { normalizeProtoTexStyle } from './part2_13_tex_style.mjs';

const ROOT = process.cwd();
const CONTENT_DIR = path.join(ROOT, 'content/tasks/part2/13');
const FILES = [
  ...(await fs.readdir(CONTENT_DIR))
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => path.join(CONTENT_DIR, name)),
  path.join(ROOT, 'reports/part2_content_draft/part2_13.json'),
];

function visit(value, changedIds) {
  if (!value || typeof value !== 'object') return;
  const changedCosPm = normalizeCosPmInProto(value);
  const changedTexStyle = normalizeProtoTexStyle(value);
  const changed = changedCosPm || changedTexStyle;
  if (changed && value.id) changedIds.add(value.id);
  if (Array.isArray(value)) {
    for (const item of value) visit(item, changedIds);
    return;
  }
  for (const item of Object.values(value)) visit(item, changedIds);
}

for (const file of FILES) {
  const data = JSON.parse(await fs.readFile(file, 'utf8'));
  const changedIds = new Set();
  visit(data, changedIds);
  if (changedIds.size) await fs.writeFile(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`${path.relative(ROOT, file)}: ${changedIds.size} ids normalized`);
  for (const id of [...changedIds].sort()) console.log(`  ${id}`);
}
