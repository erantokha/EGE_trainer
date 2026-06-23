// Apply the first approved №13 solution-style batch to factor-method prototypes.
// Keeps generated content and source draft in sync.

import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeCosPmInProto } from './part2_13_trig_solution_contract.mjs';

const ROOT = process.cwd();
const FILES = [
  path.join(ROOT, 'content/tasks/part2/13/13.trig.factor.json'),
  path.join(ROOT, 'reports/part2_content_draft/part2_13.json'),
];

function norm(s) {
  return String(s ?? '')
    .replace(/\\tfrac\b/g, '\\frac')
    .replace(/\\dfrac\b/g, '\\frac')
    .replace(/\s+/g, '')
    .replace(/\\,/g, '')
    .replace(/\\quad/g, '')
    .replace(/\\left/g, '')
    .replace(/\\right/g, '');
}

function replaceSeriesPair(arr, firstTest, secondTest, replacement) {
  if (!Array.isArray(arr)) return false;
  const first = arr.findIndex(firstTest);
  if (first < 0) return false;
  const second = arr.findIndex((item, idx) => idx !== first && secondTest(item));
  if (second < 0) return false;
  const remove = [first, second].sort((a, b) => b - a);
  for (const idx of remove) arr.splice(idx, 1);
  arr.splice(Math.min(first, second), 0, replacement);
  return true;
}

function isPiOver2TwoPi(s) {
  return /x=\\frac\{\\pi\}\{2\}\+2\\pin/.test(norm(s));
}

function isThreePiOver2TwoPi(s) {
  const t = norm(s);
  return /x=\\frac\{3\\pi\}\{2\}\+2\\pin/.test(t);
}

function isZeroTwoPi(s) {
  return /^x=2\\pin/.test(norm(s));
}

function isPiPlusTwoPi(s) {
  return /^x=\\pi\+2\\pin/.test(norm(s));
}

function isPi4TwoPi(s) {
  return /^x=\\frac\{\\pi\}\{4\}\+2\\pin/.test(norm(s));
}

function isFivePi4TwoPi(s) {
  return /^x=\\frac\{5\\pi\}\{4\}\+2\\pin/.test(norm(s));
}

function isPi3TwoPi(s) {
  return /^x=\\frac\{\\pi\}\{3\}\+2\\pin/.test(norm(s));
}

function isFourPi3TwoPi(s) {
  return /^x=\\frac\{4\\pi\}\{3\}\+2\\pin/.test(norm(s));
}

function isThreePi4TwoPi(s) {
  return /^x=\\frac\{3\\pi\}\{4\}\+2\\pin/.test(norm(s));
}

function isSevenPi4TwoPi(s) {
  return /^x=\\frac\{7\\pi\}\{4\}\+2\\pin/.test(norm(s));
}

function shortCosZero(proto) {
  let changed = false;
  changed = replaceSeriesPair(
    proto.answer?.general,
    isPiOver2TwoPi,
    isThreePiOver2TwoPi,
    'x = \\frac{\\pi}{2} + \\pi n,\\ n \\in \\mathbb{Z}'
  ) || changed;

  for (const group of proto.solution?.gen_groups || []) {
    if (norm(group.head) !== '\\cosx=0') continue;
    changed = replaceSeriesPair(
      group.series,
      isPiOver2TwoPi,
      isThreePiOver2TwoPi,
      'x = \\frac{\\pi}{2} + \\pi n'
    ) || changed;
  }
  return changed;
}

function shortSinZero(proto) {
  let changed = false;
  changed = replaceSeriesPair(
    proto.answer?.general,
    isZeroTwoPi,
    isPiPlusTwoPi,
    'x = \\pi n,\\ n \\in \\mathbb{Z}'
  ) || changed;

  for (const group of proto.solution?.gen_groups || []) {
    if (norm(group.head) !== '\\sinx=0') continue;
    changed = replaceSeriesPair(
      group.series,
      isZeroTwoPi,
      isPiPlusTwoPi,
      'x = \\pi n'
    ) || changed;
  }
  return changed;
}

const TG_FIXES = {
  '13.trig.factor.99.1': {
    head: '2 \\sin x - 2 \\cos x = 0',
    step: '\\operatorname{tg} x = 1',
    answer: 'x = \\frac{\\pi}{4} + \\pi n,\\ n \\in \\mathbb{Z}',
    series: 'x = \\frac{\\pi}{4} + \\pi n',
    first: isPi4TwoPi,
    second: isFivePi4TwoPi,
  },
  '13.trig.factor.99.2': {
    head: '2 \\sin x - 2 \\sqrt{3}\\cos x = 0',
    step: '\\operatorname{tg} x = \\sqrt{3}',
    answer: 'x = \\frac{\\pi}{3} + \\pi n,\\ n \\in \\mathbb{Z}',
    series: 'x = \\frac{\\pi}{3} + \\pi n',
    first: isPi3TwoPi,
    second: isFourPi3TwoPi,
  },
  '13.trig.factor.99.3': {
    head: '2 \\sin x + 2 \\cos x = 0',
    step: '\\operatorname{tg} x = -1',
    answer: 'x = - \\frac{\\pi}{4} + \\pi n,\\ n \\in \\mathbb{Z}',
    series: 'x = - \\frac{\\pi}{4} + \\pi n',
    first: isThreePi4TwoPi,
    second: isSevenPi4TwoPi,
  },
};

function fixOldOrBranch(proto) {
  const fix = TG_FIXES[proto.id];
  if (!fix) return false;
  let changed = false;

  const steps = proto.solution?.steps;
  if (Array.isArray(steps)) {
    const next = steps.filter((s) => !/\\text\{или\}|или/.test(String(s)) && norm(s) !== norm(fix.step));
    if (next.length !== steps.length) {
      proto.solution.steps = next;
      changed = true;
    }
  }

  const groups = proto.solution?.gen_groups || [];
  const tgGroup = groups.find((g) => norm(g.head) === norm(fix.step));
  if (tgGroup) {
    tgGroup.head = fix.head;
    tgGroup.steps = [fix.step];
    tgGroup.series = [fix.series];
    changed = true;
  }

  changed = replaceSeriesPair(proto.answer?.general, fix.first, fix.second, fix.answer) || changed;
  return changed;
}

function applyToProto(proto) {
  if (!proto || typeof proto !== 'object') return false;
  if (!String(proto.id || '').startsWith('13.trig.factor.')) return false;
  let changed = false;
  changed = shortCosZero(proto) || changed;
  changed = shortSinZero(proto) || changed;
  changed = fixOldOrBranch(proto) || changed;
  changed = normalizeCosPmInProto(proto) || changed;
  return changed;
}

function visit(value, changedIds) {
  if (!value || typeof value !== 'object') return;
  if (applyToProto(value)) changedIds.add(value.id);
  if (Array.isArray(value)) {
    for (const item of value) visit(item, changedIds);
    return;
  }
  for (const item of Object.values(value)) visit(item, changedIds);
}

async function main() {
  for (const file of FILES) {
    const data = JSON.parse(await fs.readFile(file, 'utf8'));
    const changedIds = new Set();
    visit(data, changedIds);
    await fs.writeFile(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log(`${path.relative(ROOT, file)}: ${changedIds.size} ids changed`);
    for (const id of [...changedIds].sort()) console.log(`  ${id}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
