// Apply the №13 logarithmic + exponential solution-style batch.

import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeProtoTexStyle } from './part2_13_tex_style.mjs';

const ROOT = process.cwd();
const FILES = [
  path.join(ROOT, 'content/tasks/part2/13/13.log.json'),
  path.join(ROOT, 'content/tasks/part2/13/13.exp.json'),
  path.join(ROOT, 'reports/part2_content_draft/part2_13.json'),
];

const FIXES = {
  '13.log.93.1': {
    steps: [
      '\\text{ОДЗ: } 2\\sin x > 0',
      'w = \\log_{2}(2\\sin x)',
      '2 w^2 - 5 w + 2 = 0',
      '2\\bigl(w - \\frac{1}{2}\\bigr)\\bigl(w - 2\\bigr) = 0',
      'w = \\frac{1}{2},\\quad w = 2',
      '\\log_{2}(2\\sin x) = \\frac{1}{2},\\quad \\log_{2}(2\\sin x) = 2',
      '2\\sin x = 2^{\\frac{1}{2}},\\quad 2\\sin x = 2^2',
      '\\sin x = \\frac{\\sqrt{2}}{2},\\quad \\sin x = 2',
      '\\sin x = 2 \\text{ не подходит, так как } |\\sin x| \\le 1',
    ],
    groups: [group('\\sin x = \\frac{\\sqrt{2}}{2}', [], ['x = \\frac{\\pi}{4} + 2\\pi n', 'x = \\frac{3 \\pi}{4} + 2\\pi n'])],
  },
  '13.log.93.2': {
    steps: [
      '\\text{ОДЗ: } 4\\sin x > 0',
      'w = \\log_{2}(4\\sin x)',
      'w^2 - 4 w + 3 = 0',
      '\\bigl(w - 1\\bigr)\\bigl(w - 3\\bigr) = 0',
      'w = 1,\\quad w = 3',
      '\\log_{2}(4\\sin x) = 1,\\quad \\log_{2}(4\\sin x) = 3',
      '4\\sin x = 2^1,\\quad 4\\sin x = 2^3',
      '\\sin x = \\frac{1}{2},\\quad \\sin x = 2',
      '\\sin x = 2 \\text{ не подходит, так как } |\\sin x| \\le 1',
    ],
    groups: [group('\\sin x = \\frac{1}{2}', [], ['x = \\frac{\\pi}{6} + 2\\pi n', 'x = \\frac{5 \\pi}{6} + 2\\pi n'])],
  },
  '13.log.93.3': {
    steps: [
      '\\text{ОДЗ: } 2\\sin x > 0',
      'w = \\log_{3}(2\\sin x)',
      '2 w^2 - 3 w + 1 = 0',
      '2\\bigl(w - \\frac{1}{2}\\bigr)\\bigl(w - 1\\bigr) = 0',
      'w = \\frac{1}{2},\\quad w = 1',
      '\\log_{3}(2\\sin x) = \\frac{1}{2},\\quad \\log_{3}(2\\sin x) = 1',
      '2\\sin x = 3^{\\frac{1}{2}},\\quad 2\\sin x = 3^1',
      '\\sin x = \\frac{\\sqrt{3}}{2},\\quad \\sin x = \\frac{3}{2}',
      '\\sin x = \\frac{3}{2} \\text{ не подходит, так как } |\\sin x| \\le 1',
    ],
    groups: [group('\\sin x = \\frac{\\sqrt{3}}{2}', [], ['x = \\frac{\\pi}{3} + 2\\pi n', 'x = \\frac{2 \\pi}{3} + 2\\pi n'])],
  },
  '13.exp.92.1': {
    steps: [
      'u = 4^{\\sin x},\\quad u > 0',
      '16^{\\sin x} = \\bigl(4^{\\sin x}\\bigr)^2 = u^2',
      '8 u^2 - 6 u + 1 = 0',
      '8\\bigl(u - \\frac{1}{4}\\bigr)\\bigl(u - \\frac{1}{2}\\bigr) = 0',
      'u = \\frac{1}{4},\\quad u = \\frac{1}{2}',
      '4^{\\sin x} = \\frac{1}{4},\\quad 4^{\\sin x} = \\frac{1}{2}',
      '4^{\\sin x} = 4^{-1},\\quad 4^{\\sin x} = 4^{-\\frac{1}{2}}',
      '\\sin x = -1,\\quad \\sin x = -\\frac{1}{2}',
    ],
    groups: [
      group('\\sin x = -1', [], ['x = - \\frac{\\pi}{2} + 2\\pi n']),
      group('\\sin x = -\\frac{1}{2}', [], ['x = - \\frac{\\pi}{6} + 2\\pi n', 'x = \\frac{7 \\pi}{6} + 2\\pi n']),
    ],
  },
  '13.exp.92.2': {
    steps: [
      'u = 16^{\\sin x},\\quad u > 0',
      '256^{\\sin x} = \\bigl(16^{\\sin x}\\bigr)^2 = u^2',
      '4 u^2 - 17 u + 4 = 0',
      '4\\bigl(u - \\frac{1}{4}\\bigr)\\bigl(u - 4\\bigr) = 0',
      'u = \\frac{1}{4},\\quad u = 4',
      '16^{\\sin x} = \\frac{1}{4},\\quad 16^{\\sin x} = 4',
      '16^{\\sin x} = 16^{-\\frac{1}{2}},\\quad 16^{\\sin x} = 16^{\\frac{1}{2}}',
      '\\sin x = -\\frac{1}{2},\\quad \\sin x = \\frac{1}{2}',
    ],
    groups: [
      group('\\sin x = -\\frac{1}{2}', [], ['x = - \\frac{\\pi}{6} + 2\\pi n', 'x = \\frac{7 \\pi}{6} + 2\\pi n']),
      group('\\sin x = \\frac{1}{2}', [], ['x = \\frac{\\pi}{6} + 2\\pi n', 'x = \\frac{5 \\pi}{6} + 2\\pi n']),
    ],
  },
  '13.exp.92.3': {
    steps: [
      'u = 25^{\\sin x},\\quad u > 0',
      '625^{\\sin x} = \\bigl(25^{\\sin x}\\bigr)^2 = u^2',
      '5 u^2 - 26 u + 5 = 0',
      '5\\bigl(u - \\frac{1}{5}\\bigr)\\bigl(u - 5\\bigr) = 0',
      'u = \\frac{1}{5},\\quad u = 5',
      '25^{\\sin x} = \\frac{1}{5},\\quad 25^{\\sin x} = 5',
      '25^{\\sin x} = 25^{-\\frac{1}{2}},\\quad 25^{\\sin x} = 25^{\\frac{1}{2}}',
      '\\sin x = -\\frac{1}{2},\\quad \\sin x = \\frac{1}{2}',
    ],
    groups: [
      group('\\sin x = -\\frac{1}{2}', [], ['x = - \\frac{\\pi}{6} + 2\\pi n', 'x = \\frac{7 \\pi}{6} + 2\\pi n']),
      group('\\sin x = \\frac{1}{2}', [], ['x = \\frac{\\pi}{6} + 2\\pi n', 'x = \\frac{5 \\pi}{6} + 2\\pi n']),
    ],
  },
};

function group(head, steps, series) {
  const out = { head };
  if (steps.length) out.steps = steps;
  if (series.length) out.series = series;
  return out;
}

function applyFix(proto, fix) {
  proto.solution.steps = fix.steps.slice();
  proto.solution.gen_groups = fix.groups.map((g) => ({
    ...g,
    steps: g.steps?.slice(),
    series: g.series?.slice(),
  }));
  return true;
}

function visit(value, changedIds) {
  if (!value || typeof value !== 'object') return;
  const fix = FIXES[value.id];
  if (fix) {
    applyFix(value, fix);
    normalizeProtoTexStyle(value);
    changedIds.add(value.id);
  }
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
  console.log(`${path.relative(ROOT, file)}: ${changedIds.size} ids changed`);
  for (const id of [...changedIds].sort()) console.log(`  ${id}`);
}
