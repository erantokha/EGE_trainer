// Apply the approved №13 solution-style batch to quadratic-method prototypes.
// Keeps generated content and source draft in sync.

import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeCosPmInProto } from './part2_13_trig_solution_contract.mjs';

const ROOT = process.cwd();
const FILES = [
  path.join(ROOT, 'content/tasks/part2/13/13.trig.quad.json'),
  path.join(ROOT, 'reports/part2_content_draft/part2_13.json'),
];

const INVALID_ROOTS = {
  '13.trig.quad.97.1': '-2',
  '13.trig.quad.97.2': '2',
  '13.trig.quad.97.3': '\\sqrt{2}',
};

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

function detectTrig(proto) {
  const groups = proto.solution?.gen_groups || [];
  const source = groups.map(g => `${g.head || ''} ${(g.steps || []).join(' ')}`).join(' ');
  if (/\\cos\s*x/.test(source)) return { fn: 'cos', tex: '\\cos x' };
  return { fn: 'sin', tex: '\\sin x' };
}

function convertQuadraticToT(expr, fn) {
  return String(expr || '')
    .replaceAll(`\\${fn}^2 x`, 't^2')
    .replaceAll(`\\${fn} x`, 't');
}

function valueFromEquation(eq) {
  const parts = String(eq || '').split('=');
  return parts.length >= 2 ? parts.slice(1).join('=').trim() : '';
}

function firstTrigEquation(group, trigTex) {
  if (String(group.head || '').includes(trigTex)) return group.head;
  const step = (group.steps || []).find(s => String(s).includes(trigTex));
  return step || '';
}

function isTStep(step) {
  const s = norm(step);
  return s === 't=\\sinx' || s === 't=\\cosx' || /t\^2/.test(s) || /^t_/.test(s);
}

function setSteps(proto, extraSteps) {
  const steps = Array.isArray(proto.solution?.steps) ? proto.solution.steps : [];
  const base = steps.filter(step => !isTStep(step) && !/\\notin\s*\[-1;1\]/.test(String(step)));
  proto.solution.steps = [...base, ...extraSteps];
}

function applyIncompleteSquare(proto) {
  if (proto.id !== '13.trig.quad.22.1') return false;
  const steps = Array.isArray(proto.solution?.steps) ? proto.solution.steps : [];
  const wanted = '\\sin^2 x = \\frac{1}{4}';
  if (!steps.some(step => norm(step) === norm(wanted))) {
    proto.solution.steps = [...steps, wanted];
    return true;
  }
  return false;
}

function applyFullQuadratic(proto) {
  if (proto.id === '13.trig.quad.22.1') return false;
  const sol = proto.solution || {};
  const groups = Array.isArray(sol.gen_groups) ? sol.gen_groups : [];
  if (!groups.length) return false;

  const trig = detectTrig(proto);
  const steps = Array.isArray(sol.steps) ? sol.steps : [];
  const baseSteps = steps.filter(step => !isTStep(step) && !/\\notin\s*\[-1;1\]/.test(String(step)));
  const finalQuadratic = baseSteps[baseSteps.length - 1] || steps[steps.length - 1] || '';
  const tQuadratic = convertQuadraticToT(finalQuadratic, trig.fn);

  const validValues = [];
  for (const group of groups) {
    const trigEq = firstTrigEquation(group, trig.tex) || group.head;
    const value = valueFromEquation(trigEq);
    if (value) validValues.push(value);

    if (!String(group.head || '').startsWith('t =')) {
      group.head = `t = ${value}`;
    }
    group.steps = [trigEq, ...(group.steps || []).filter(step => norm(step) !== norm(trigEq))];
  }

  const roots = [...validValues];
  const invalid = INVALID_ROOTS[proto.id];
  if (invalid) roots.push(invalid);
  const rootLine = roots
    .map((value, idx) => `t_{${idx + 1}} = ${value}`)
    .join(',\\quad ');

  const extraSteps = [
    `t = ${trig.tex}`,
    tQuadratic,
    rootLine,
  ];
  if (invalid) {
    extraSteps.push(`t = ${invalid} \\notin [-1;1]`);
  }
  setSteps(proto, extraSteps);
  return true;
}

function applyToProto(proto) {
  if (!proto || typeof proto !== 'object') return false;
  if (!String(proto.id || '').startsWith('13.trig.quad.')) return false;
  let changed = false;
  changed = applyIncompleteSquare(proto) || changed;
  changed = applyFullQuadratic(proto) || changed;
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
