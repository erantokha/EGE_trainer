// Refine №13 quadratic batch:
// - use grouping when the quadratic coefficient b is radical/awkward;
// - use ordinary discriminant when coefficients are clean;
// - keep the incomplete-square case without substitution.

import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeCosPmInProto } from './part2_13_trig_solution_contract.mjs';
import { normalizeProtoTexStyle } from './part2_13_tex_style.mjs';

const ROOT = process.cwd();
const FILES = [
  path.join(ROOT, 'content/tasks/part2/13/13.trig.quad.json'),
  path.join(ROOT, 'reports/part2_content_draft/part2_13.json'),
];

const GROUPING = {
  '13.trig.quad.22.2': {
    answer: [
      'x = \\frac{5 \\pi}{4} + 2\\pi n,\\ n \\in \\mathbb{Z}',
      'x = \\frac{7 \\pi}{4} + 2\\pi n,\\ n \\in \\mathbb{Z}',
      'x = \\frac{\\pi}{6} + 2\\pi n,\\ n \\in \\mathbb{Z}',
      'x = \\frac{5 \\pi}{6} + 2\\pi n,\\ n \\in \\mathbb{Z}',
    ],
    steps: [
      '2 \\sqrt{2} \\sin x - 2 \\sin x - 4 \\cos^2 x + 4 - \\sqrt{2} = 0',
      '2 \\sqrt{2} \\sin x - 2 \\sin x - 4\\bigl(1 - \\sin^2 x\\bigr) + 4 - \\sqrt{2} = 0',
      '2 \\sqrt{2} \\sin x - 2 \\sin x - 4 + 4 \\sin^2 x + 4 - \\sqrt{2} = 0',
      '4 \\sin^2 x + 2 \\sqrt{2} \\sin x - 2 \\sin x - \\sqrt{2} = 0',
      '2 \\sin x\\bigl(2 \\sin x + \\sqrt{2}\\bigr) - \\bigl(2 \\sin x + \\sqrt{2}\\bigr) = 0',
      '\\bigl(2 \\sin x + \\sqrt{2}\\bigr)\\bigl(2 \\sin x - 1\\bigr) = 0',
    ],
    groups: [
      group('2 \\sin x + \\sqrt{2} = 0', ['\\sin x = - \\frac{\\sqrt{2}}{2}'], ['x = \\frac{5 \\pi}{4} + 2\\pi n', 'x = \\frac{7 \\pi}{4} + 2\\pi n']),
      group('2 \\sin x - 1 = 0', ['\\sin x = \\frac{1}{2}'], ['x = \\frac{\\pi}{6} + 2\\pi n', 'x = \\frac{5 \\pi}{6} + 2\\pi n']),
    ],
  },
  '13.trig.quad.22.3': {
    answer: [
      'x = \\frac{4 \\pi}{3} + 2\\pi n,\\ n \\in \\mathbb{Z}',
      'x = \\frac{5 \\pi}{3} + 2\\pi n,\\ n \\in \\mathbb{Z}',
      'x = \\frac{\\pi}{6} + 2\\pi n,\\ n \\in \\mathbb{Z}',
      'x = \\frac{5 \\pi}{6} + 2\\pi n,\\ n \\in \\mathbb{Z}',
    ],
    steps: [
      '2 \\sqrt{3} \\sin x - 2 \\sin x - 4 \\cos^2 x + 4 - \\sqrt{3} = 0',
      '2 \\sqrt{3} \\sin x - 2 \\sin x - 4\\bigl(1 - \\sin^2 x\\bigr) + 4 - \\sqrt{3} = 0',
      '2 \\sqrt{3} \\sin x - 2 \\sin x - 4 + 4 \\sin^2 x + 4 - \\sqrt{3} = 0',
      '4 \\sin^2 x + 2 \\sqrt{3} \\sin x - 2 \\sin x - \\sqrt{3} = 0',
      '2 \\sin x\\bigl(2 \\sin x + \\sqrt{3}\\bigr) - \\bigl(2 \\sin x + \\sqrt{3}\\bigr) = 0',
      '\\bigl(2 \\sin x + \\sqrt{3}\\bigr)\\bigl(2 \\sin x - 1\\bigr) = 0',
    ],
    groups: [
      group('2 \\sin x + \\sqrt{3} = 0', ['\\sin x = - \\frac{\\sqrt{3}}{2}'], ['x = \\frac{4 \\pi}{3} + 2\\pi n', 'x = \\frac{5 \\pi}{3} + 2\\pi n']),
      group('2 \\sin x - 1 = 0', ['\\sin x = \\frac{1}{2}'], ['x = \\frac{\\pi}{6} + 2\\pi n', 'x = \\frac{5 \\pi}{6} + 2\\pi n']),
    ],
  },
  '13.trig.quad.24.1': {
    answer: [
      'x = \\pm \\frac{\\pi}{3} + 2\\pi n,\\ n \\in \\mathbb{Z}',
      'x = \\pm \\frac{3 \\pi}{4} + 2\\pi n,\\ n \\in \\mathbb{Z}',
    ],
    steps: [
      '2 + 2 \\cos 2x - 2 \\cos x = \\sqrt{2} - 2 \\sqrt{2} \\cos x',
      '2 + 2 \\bigl(2\\cos^2 x - 1\\bigr) - 2 \\cos x - \\sqrt{2} + 2 \\sqrt{2} \\cos x = 0',
      '4 \\cos^2 x - 2 \\cos x + 2 \\sqrt{2} \\cos x - \\sqrt{2} = 0',
      '2 \\cos x\\bigl(2 \\cos x - 1\\bigr) + \\sqrt{2}\\bigl(2 \\cos x - 1\\bigr) = 0',
      '\\bigl(2 \\cos x - 1\\bigr)\\bigl(2 \\cos x + \\sqrt{2}\\bigr) = 0',
    ],
    groups: [
      group('2 \\cos x - 1 = 0', ['\\cos x = \\frac{1}{2}'], ['x = \\pm \\frac{\\pi}{3} + 2\\pi n']),
      group('2 \\cos x + \\sqrt{2} = 0', ['\\cos x = - \\frac{\\sqrt{2}}{2}'], ['x = \\pm \\frac{3 \\pi}{4} + 2\\pi n']),
    ],
  },
  '13.trig.quad.24.2': {
    answer: [
      'x = \\pm \\frac{\\pi}{3} + 2\\pi n,\\ n \\in \\mathbb{Z}',
      'x = \\pm \\frac{5 \\pi}{6} + 2\\pi n,\\ n \\in \\mathbb{Z}',
    ],
    steps: [
      '2 + 2 \\cos 2x - 2 \\cos x = \\sqrt{3} - 2 \\sqrt{3} \\cos x',
      '2 + 2 \\bigl(2\\cos^2 x - 1\\bigr) - 2 \\cos x - \\sqrt{3} + 2 \\sqrt{3} \\cos x = 0',
      '4 \\cos^2 x - 2 \\cos x + 2 \\sqrt{3} \\cos x - \\sqrt{3} = 0',
      '2 \\cos x\\bigl(2 \\cos x - 1\\bigr) + \\sqrt{3}\\bigl(2 \\cos x - 1\\bigr) = 0',
      '\\bigl(2 \\cos x - 1\\bigr)\\bigl(2 \\cos x + \\sqrt{3}\\bigr) = 0',
    ],
    groups: [
      group('2 \\cos x - 1 = 0', ['\\cos x = \\frac{1}{2}'], ['x = \\pm \\frac{\\pi}{3} + 2\\pi n']),
      group('2 \\cos x + \\sqrt{3} = 0', ['\\cos x = - \\frac{\\sqrt{3}}{2}'], ['x = \\pm \\frac{5 \\pi}{6} + 2\\pi n']),
    ],
  },
  '13.trig.quad.24.3': {
    answer: [
      'x = \\pm \\frac{2 \\pi}{3} + 2\\pi n,\\ n \\in \\mathbb{Z}',
      'x = \\pm \\frac{\\pi}{4} + 2\\pi n,\\ n \\in \\mathbb{Z}',
    ],
    steps: [
      '2 + 2 \\cos 2x - 2 \\sqrt{2} \\cos x = \\sqrt{2} - 2 \\cos x',
      '2 + 2 \\bigl(2\\cos^2 x - 1\\bigr) - 2 \\sqrt{2} \\cos x - \\sqrt{2} + 2 \\cos x = 0',
      '4 \\cos^2 x + 2 \\cos x - 2 \\sqrt{2} \\cos x - \\sqrt{2} = 0',
      '2 \\cos x\\bigl(2 \\cos x + 1\\bigr) - \\sqrt{2}\\bigl(2 \\cos x + 1\\bigr) = 0',
      '\\bigl(2 \\cos x + 1\\bigr)\\bigl(2 \\cos x - \\sqrt{2}\\bigr) = 0',
    ],
    groups: [
      group('2 \\cos x + 1 = 0', ['\\cos x = - \\frac{1}{2}'], ['x = \\pm \\frac{2 \\pi}{3} + 2\\pi n']),
      group('2 \\cos x - \\sqrt{2} = 0', ['\\cos x = \\frac{\\sqrt{2}}{2}'], ['x = \\pm \\frac{\\pi}{4} + 2\\pi n']),
    ],
  },
  '13.trig.quad.27.2': {
    answer: [
      'x = \\frac{3 \\pi}{2} + 2\\pi n,\\ n \\in \\mathbb{Z}',
      'x = \\frac{\\pi}{4} + 2\\pi n,\\ n \\in \\mathbb{Z}',
      'x = \\frac{3 \\pi}{4} + 2\\pi n,\\ n \\in \\mathbb{Z}',
    ],
    steps: [
      '2 \\sin^2 x + 2 \\sin x = \\sqrt{2} + \\sqrt{2} \\sin x',
      '2 \\sin^2 x + 2 \\sin x - \\sqrt{2} \\sin x - \\sqrt{2} = 0',
      '2 \\sin x\\bigl(\\sin x + 1\\bigr) - \\sqrt{2}\\bigl(\\sin x + 1\\bigr) = 0',
      '\\bigl(\\sin x + 1\\bigr)\\bigl(2 \\sin x - \\sqrt{2}\\bigr) = 0',
    ],
    groups: [
      group('\\sin x + 1 = 0', ['\\sin x = -1'], ['x = \\frac{3 \\pi}{2} + 2\\pi n']),
      group('2 \\sin x - \\sqrt{2} = 0', ['\\sin x = \\frac{\\sqrt{2}}{2}'], ['x = \\frac{\\pi}{4} + 2\\pi n', 'x = \\frac{3 \\pi}{4} + 2\\pi n']),
    ],
  },
  '13.trig.quad.27.3': {
    answer: [
      'x = \\frac{\\pi}{2} + 2\\pi n,\\ n \\in \\mathbb{Z}',
      'x = \\frac{5 \\pi}{4} + 2\\pi n,\\ n \\in \\mathbb{Z}',
      'x = \\frac{7 \\pi}{4} + 2\\pi n,\\ n \\in \\mathbb{Z}',
    ],
    steps: [
      '2 \\sin^2 x + \\sqrt{2} \\sin x = \\sqrt{2} + 2 \\sin x',
      '2 \\sin^2 x - 2 \\sin x + \\sqrt{2} \\sin x - \\sqrt{2} = 0',
      '2 \\sin x\\bigl(\\sin x - 1\\bigr) + \\sqrt{2}\\bigl(\\sin x - 1\\bigr) = 0',
      '\\bigl(\\sin x - 1\\bigr)\\bigl(2 \\sin x + \\sqrt{2}\\bigr) = 0',
    ],
    groups: [
      group('\\sin x - 1 = 0', ['\\sin x = 1'], ['x = \\frac{\\pi}{2} + 2\\pi n']),
      group('2 \\sin x + \\sqrt{2} = 0', ['\\sin x = - \\frac{\\sqrt{2}}{2}'], ['x = \\frac{5 \\pi}{4} + 2\\pi n', 'x = \\frac{7 \\pi}{4} + 2\\pi n']),
    ],
  },
  '13.trig.quad.97.3': {
    answer: [
      'x = \\pm \\frac{\\pi}{4} + 2\\pi n,\\ n \\in \\mathbb{Z}',
    ],
    steps: [
      '2 - 2 \\cos^2 x = -3 \\sqrt{2} \\cos x + 4',
      '2 \\cos^2 x - 3 \\sqrt{2} \\cos x + 2 = 0',
      '2 \\cos^2 x - 2 \\sqrt{2} \\cos x - \\sqrt{2} \\cos x + 2 = 0',
      '2 \\cos x\\bigl(\\cos x - \\sqrt{2}\\bigr) - \\sqrt{2}\\bigl(\\cos x - \\sqrt{2}\\bigr) = 0',
      '\\bigl(\\cos x - \\sqrt{2}\\bigr)\\bigl(2 \\cos x - \\sqrt{2}\\bigr) = 0',
    ],
    groups: [
      group('\\cos x - \\sqrt{2} = 0', ['\\cos x = \\sqrt{2}', '\\cos x = \\sqrt{2} \\notin [-1;1]'], []),
      group('2 \\cos x - \\sqrt{2} = 0', ['\\cos x = \\frac{\\sqrt{2}}{2}'], ['x = \\pm \\frac{\\pi}{4} + 2\\pi n']),
    ],
  },
};

const DISCRIMINANT = {
  '13.trig.quad.26.1': discr('sin', '2 t^2 - 3t + 1 = 0', 'D = 9 - 8 = 1', ['\\frac{1}{2}', '1']),
  '13.trig.quad.26.2': discr('sin', '2 t^2 + t - 1 = 0', 'D = 1 + 8 = 9', ['-1', '\\frac{1}{2}']),
  '13.trig.quad.26.3': discr('sin', '2 t^2 - t - 1 = 0', 'D = 1 + 8 = 9', ['- \\frac{1}{2}', '1']),
  '13.trig.quad.27.1': discr('sin', '2 t^2 + 3t + 1 = 0', 'D = 9 - 8 = 1', ['-1', '- \\frac{1}{2}']),
  '13.trig.quad.73.1': discr('cos', '2 t^2 - 3t + 1 = 0', 'D = 9 - 8 = 1', ['\\frac{1}{2}', '1']),
  '13.trig.quad.73.2': discr('cos', '2 t^2 - t - 1 = 0', 'D = 1 + 8 = 9', ['- \\frac{1}{2}', '1']),
  '13.trig.quad.73.3': discr('cos', '2 t^2 + 3t + 1 = 0', 'D = 9 - 8 = 1', ['-1', '- \\frac{1}{2}']),
  '13.trig.quad.97.1': discr('cos', '2 t^2 + 3t - 2 = 0', 'D = 9 + 16 = 25', ['\\frac{1}{2}', '-2'], '-2'),
  '13.trig.quad.97.2': discr('cos', '2 t^2 - 3t - 2 = 0', 'D = 9 + 16 = 25', ['- \\frac{1}{2}', '2'], '2'),
};

function group(head, steps, series) {
  const out = { head };
  if (steps.length) out.steps = steps;
  if (series.length) out.series = series;
  return out;
}

function discr(fn, equation, d, roots, invalid = '') {
  return { fn, equation, d, roots, invalid };
}

const DISCRIMINANT_DETAILS = {
  '2 t^2 - 3t + 1 = 0': [
    'a = 2,\\quad b = -3,\\quad c = 1',
    'D = b^2 - 4ac',
    'D = \\bigl(-3\\bigr)^2 - 4 \\cdot 2 \\cdot 1 = 9 - 8 = 1',
    't_{1,2} = \\frac{-b \\pm \\sqrt{D}}{2a}',
    't_{1} = \\frac{3 - 1}{4} = \\frac{1}{2}',
    't_{2} = \\frac{3 + 1}{4} = 1',
  ],
  '2 t^2 + t - 1 = 0': [
    'a = 2,\\quad b = 1,\\quad c = -1',
    'D = b^2 - 4ac',
    'D = 1^2 - 4 \\cdot 2 \\cdot \\bigl(-1\\bigr) = 1 + 8 = 9',
    't_{1,2} = \\frac{-b \\pm \\sqrt{D}}{2a}',
    't_{1} = \\frac{-1 - 3}{4} = -1',
    't_{2} = \\frac{-1 + 3}{4} = \\frac{1}{2}',
  ],
  '2 t^2 - t - 1 = 0': [
    'a = 2,\\quad b = -1,\\quad c = -1',
    'D = b^2 - 4ac',
    'D = \\bigl(-1\\bigr)^2 - 4 \\cdot 2 \\cdot \\bigl(-1\\bigr) = 1 + 8 = 9',
    't_{1,2} = \\frac{-b \\pm \\sqrt{D}}{2a}',
    't_{1} = \\frac{1 - 3}{4} = - \\frac{1}{2}',
    't_{2} = \\frac{1 + 3}{4} = 1',
  ],
  '2 t^2 + 3t + 1 = 0': [
    'a = 2,\\quad b = 3,\\quad c = 1',
    'D = b^2 - 4ac',
    'D = 3^2 - 4 \\cdot 2 \\cdot 1 = 9 - 8 = 1',
    't_{1,2} = \\frac{-b \\pm \\sqrt{D}}{2a}',
    't_{1} = \\frac{-3 - 1}{4} = -1',
    't_{2} = \\frac{-3 + 1}{4} = - \\frac{1}{2}',
  ],
  '2 t^2 + 3t - 2 = 0': [
    'a = 2,\\quad b = 3,\\quad c = -2',
    'D = b^2 - 4ac',
    'D = 3^2 - 4 \\cdot 2 \\cdot \\bigl(-2\\bigr) = 9 + 16 = 25',
    't_{1,2} = \\frac{-b \\pm \\sqrt{D}}{2a}',
    't_{1} = \\frac{-3 + 5}{4} = \\frac{1}{2}',
    't_{2} = \\frac{-3 - 5}{4} = -2',
  ],
  '2 t^2 - 3t - 2 = 0': [
    'a = 2,\\quad b = -3,\\quad c = -2',
    'D = b^2 - 4ac',
    'D = \\bigl(-3\\bigr)^2 - 4 \\cdot 2 \\cdot \\bigl(-2\\bigr) = 9 + 16 = 25',
    't_{1,2} = \\frac{-b \\pm \\sqrt{D}}{2a}',
    't_{1} = \\frac{3 - 5}{4} = - \\frac{1}{2}',
    't_{2} = \\frac{3 + 5}{4} = 2',
  ],
};

function trigTex(fn) {
  return fn === 'cos' ? '\\cos x' : '\\sin x';
}

function convertTToTrigEquation(head, fn) {
  return String(head || '').replace(/^t\s*=/, `${trigTex(fn)} =`);
}

function isOldTStep(step) {
  const s = String(step || '');
  const trimmed = s.trim();
  return /^t\s*=/.test(trimmed)
    || /t\^2/.test(s)
    || /^a\s*=/.test(trimmed)
    || /^D\s*=/.test(trimmed)
    || /^t_\{?1/.test(trimmed)
    || /^t_\{?2/.test(trimmed)
    || /\\notin\s*\[-1;1\]/.test(s);
}

function applyGrouping(proto, config) {
  proto.method = 'группировка';
  proto.uses = ['формулы приведения', 'основное тригонометрическое тождество', 'группировка', 'вынесение общего множителя'];
  proto.answer.general = config.answer.slice();
  proto.solution.steps = config.steps.slice();
  proto.solution.gen_groups = config.groups.map(g => ({ ...g, steps: g.steps?.slice(), series: g.series?.slice() }));
}

function applyDiscriminant(proto, config) {
  proto.method = 'сведение к квадратному';
  proto.uses = ['формулы приведения', 'основное тригонометрическое тождество', 'замена переменной', 'дискриминант'];
  const steps = (proto.solution.steps || []).filter(step => !isOldTStep(step));
  proto.solution.steps = [
    ...steps,
    `t = ${trigTex(config.fn)}`,
    config.equation,
    ...(DISCRIMINANT_DETAILS[config.equation] || [
      'D = b^2 - 4ac',
      config.d,
      `t_{1} = ${config.roots[0]},\\quad t_{2} = ${config.roots[1]}`,
    ]),
  ];
  if (config.invalid) {
    proto.solution.steps.push(`t = ${config.invalid} \\notin [-1;1]`);
  }
  for (const g of proto.solution.gen_groups || []) {
    if (/^t\s*=/.test(String(g.head || ''))) {
      const trigEq = convertTToTrigEquation(g.head, config.fn);
      g.steps = [trigEq, ...(g.steps || []).filter(step => step !== trigEq)];
    }
  }
}

function visit(value, changed) {
  if (!value || typeof value !== 'object') return;
  if (GROUPING[value.id]) {
    applyGrouping(value, GROUPING[value.id]);
    normalizeCosPmInProto(value);
    normalizeProtoTexStyle(value);
    changed.add(value.id);
  } else if (DISCRIMINANT[value.id]) {
    applyDiscriminant(value, DISCRIMINANT[value.id]);
    normalizeCosPmInProto(value);
    normalizeProtoTexStyle(value);
    changed.add(value.id);
  }
  if (Array.isArray(value)) {
    for (const item of value) visit(item, changed);
    return;
  }
  for (const item of Object.values(value)) visit(item, changed);
}

async function main() {
  for (const file of FILES) {
    const data = JSON.parse(await fs.readFile(file, 'utf8'));
    const changed = new Set();
    visit(data, changed);
    await fs.writeFile(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log(`${path.relative(ROOT, file)}: ${changed.size} ids refined`);
    for (const id of [...changed].sort()) console.log(`  ${id}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
