// Add formula-hint boxes to №13 solutions according to solution_contract.json.
// Idempotent: removes previous formula_hint objects and inserts them again.

import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeProtoTexStyle } from './part2_13_tex_style.mjs';

const ROOT = process.cwd();
const DRAFT = path.join(ROOT, 'reports/part2_content_draft/part2_13.json');

function compact(tex) {
  return String(tex ?? '')
    .replace(/\\tfrac\b/g, '\\frac')
    .replace(/\\dfrac\b/g, '\\frac')
    .replace(/\\!/g, '')
    .replace(/\\,/g, '')
    .replace(/\\quad/g, '')
    .replace(/\\cdot/g, '')
    .replace(/\s+/g, '');
}

function isFormulaHintStep(step) {
  return !!step && typeof step === 'object' && step.kind === 'formula_hint';
}

function cleanStepArray(steps) {
  return (Array.isArray(steps) ? steps : []).filter((step) => !isFormulaHintStep(step));
}

function dropKnownPiExpansionLines(steps) {
  return steps.filter((step) => {
    if (typeof step !== 'string') return true;
    return !(step.includes('\\cos \\pi') || step.includes('\\sin \\pi'));
  });
}

function dropCoefficientLines(steps) {
  return steps.filter((step) => {
    if (typeof step !== 'string') return true;
    return !(/^\s*a\s*=/.test(step) && /\bb\s*=/.test(step) && /\bc\s*=/.test(step));
  });
}

function formulaHintSteps(formulas) {
  const clean = [];
  const seen = new Set();
  for (const formula of formulas) {
    if (!formula?.tex) continue;
    const key = compact(formula.tex);
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push({ tex: formula.tex });
  }
  return clean.map((formula) => ({
    kind: 'formula_hint',
    formulas: [formula],
  }));
}

function hasFuncArg(compacted, fn, arg) {
  const plain = `\\${fn}\\bigl(${arg}\\bigr)`;
  const squared = `\\${fn}^2\\bigl(${arg}\\bigr)`;
  return compacted.includes(plain) || compacted.includes(squared);
}

function funcArgIndex(compacted, fn, arg) {
  const plain = `\\${fn}\\bigl(${arg}\\bigr)`;
  const squared = `\\${fn}^2\\bigl(${arg}\\bigr)`;
  const indexes = [compacted.indexOf(plain), compacted.indexOf(squared)].filter((i) => i >= 0);
  return indexes.length ? Math.min(...indexes) : -1;
}

function reductionFormulas(beforeRaw, afterRaw) {
  const before = compact(beforeRaw);
  const after = compact(afterRaw);
  const rules = [
    { fn: 'sin', arg: '-x', title: 'Формула нечётности синуса', tex: '\\sin\\bigl(-x\\bigr) = -\\sin x' },
    { fn: 'cos', arg: '-x', title: 'Формула чётности косинуса', tex: '\\cos\\bigl(-x\\bigr) = \\cos x' },
    { fn: 'cos', arg: '\\pi-x', title: 'Формула приведения', tex: '\\cos\\bigl(\\pi - x\\bigr) = -\\cos x' },
    { fn: 'cos', arg: '\\pi+2x', title: 'Формула приведения', tex: '\\cos\\bigl(\\pi + 2x\\bigr) = -\\cos 2x' },
    { fn: 'cos', arg: '\\pi+x', title: 'Формула приведения', tex: '\\cos\\bigl(\\pi + x\\bigr) = -\\cos x' },
    { fn: 'cos', arg: 'x+\\pi', title: 'Формула приведения', tex: '\\cos\\bigl(x + \\pi\\bigr) = -\\cos x' },
    { fn: 'cos', arg: 'x-\\pi', title: 'Формула приведения', tex: '\\cos\\bigl(x - \\pi\\bigr) = -\\cos x' },
    { fn: 'sin', arg: 'x+\\pi', title: 'Формула приведения', tex: '\\sin\\bigl(x + \\pi\\bigr) = -\\sin x' },
    { fn: 'sin', arg: 'x-\\pi', title: 'Формула приведения', tex: '\\sin\\bigl(x - \\pi\\bigr) = -\\sin x' },
    { fn: 'cos', arg: '\\frac{\\pi}{2}-x', title: 'Формула приведения', tex: '\\cos\\bigl(\\frac{\\pi}{2} - x\\bigr) = \\sin x' },
    { fn: 'sin', arg: '\\frac{\\pi}{2}-x', title: 'Формула приведения', tex: '\\sin\\bigl(\\frac{\\pi}{2} - x\\bigr) = \\cos x' },
    { fn: 'cos', arg: '\\frac{3\\pi}{2}+x', title: 'Формула приведения', tex: '\\cos\\bigl(\\frac{3\\pi}{2} + x\\bigr) = \\sin x' },
    { fn: 'sin', arg: '\\frac{3\\pi}{2}-\\alpha', title: 'Формула приведения', tex: '\\sin\\bigl(\\frac{3\\pi}{2} - \\alpha\\bigr) = -\\cos\\alpha' },
    { fn: 'cos', arg: '\\pi-\\alpha', title: 'Формула приведения', tex: '\\cos\\bigl(\\pi - \\alpha\\bigr) = -\\cos\\alpha' },
  ];
  return rules
    .map((rule) => ({ ...rule, pos: funcArgIndex(before, rule.fn, rule.arg) }))
    .filter((rule) => rule.pos >= 0 && !hasFuncArg(after, rule.fn, rule.arg));
}

function doubleAngleFormulas(beforeRaw, afterRaw) {
  const before = compact(beforeRaw);
  const after = compact(afterRaw);
  const formulas = [];
  const sinPos = before.indexOf('\\sin2x');
  if (sinPos >= 0 && after.includes('\\sinx\\cosx')) {
    formulas.push({
      title: 'Формула двойного угла',
      tex: '\\sin 2x = 2\\sin x\\cos x',
      pos: sinPos,
    });
  }
  const cosAlphaPos = before.indexOf('\\cos2\\alpha');
  if (cosAlphaPos >= 0 && after.includes('2\\cos^2\\alpha-1')) {
    formulas.push({
      title: 'Формула двойного угла',
      tex: '\\cos 2\\alpha = 2\\cos^2\\alpha - 1',
      pos: cosAlphaPos,
    });
  }
  const cosPos = before.indexOf('\\cos2x');
  if (cosPos >= 0) {
    if (after.includes('1-2\\sin^2x')) {
      formulas.push({
        title: 'Формула двойного угла',
        tex: '\\cos 2x = 1 - 2\\sin^2 x',
        pos: cosPos,
      });
    } else if (after.includes('2\\cos^2x-1')) {
      formulas.push({
        title: 'Формула двойного угла',
        tex: '\\cos 2x = 2\\cos^2 x - 1',
        pos: cosPos,
      });
    } else if (after.includes('\\cos^2x-\\sin^2x')) {
      formulas.push({
        title: 'Формула двойного угла',
        tex: '\\cos 2x = \\cos^2 x - \\sin^2 x',
        pos: cosPos,
      });
    }
  }
  return formulas;
}

function pythagoreanFormulas(beforeRaw, afterRaw) {
  const before = compact(beforeRaw);
  const after = compact(afterRaw);
  const formulas = [];
  if (
    (before.includes('\\cos^2x') && !after.includes('\\cos^2x') && after.includes('1-\\sin^2x'))
    || (before.includes('1-\\sin^2x') && !after.includes('1-\\sin^2x') && after.includes('\\cos^2x'))
  ) {
    formulas.push({
      title: 'Основное тригонометрическое тождество',
      tex: '\\sin^2 x + \\cos^2 x = 1 \\Rightarrow \\cos^2 x = 1 - \\sin^2 x',
      pos: Math.max(0, before.indexOf('\\cos^2x')),
    });
  }
  if (
    (before.includes('\\sin^2x') && !after.includes('\\sin^2x') && after.includes('1-\\cos^2x'))
    || (before.includes('1-\\cos^2x') && !after.includes('1-\\cos^2x') && after.includes('\\sin^2x'))
    || (before.includes('\\sin^2x') && after.includes('2-2\\cos^2x'))
    || (before.includes('2-2\\cos^2x') && after.includes('\\sin^2x'))
  ) {
    formulas.push({
      title: 'Основное тригонометрическое тождество',
      tex: '\\sin^2 x + \\cos^2 x = 1 \\Rightarrow \\sin^2 x = 1 - \\cos^2 x',
      pos: Math.max(0, before.indexOf('\\sin^2x')),
    });
  }
  return formulas;
}

function sumDifferenceFormulas(beforeRaw, afterRaw) {
  const before = compact(beforeRaw);
  const after = compact(afterRaw);
  const formulas = [];
  const rules = [
    {
      fn: 'sin',
      op: '+',
      title: 'Формула синуса суммы',
      tex: '\\sin\\bigl(\\alpha + \\beta\\bigr) = \\sin\\alpha\\cos\\beta + \\cos\\alpha\\sin\\beta',
    },
    {
      fn: 'sin',
      op: '-',
      title: 'Формула синуса разности',
      tex: '\\sin\\bigl(\\alpha - \\beta\\bigr) = \\sin\\alpha\\cos\\beta - \\cos\\alpha\\sin\\beta',
    },
    {
      fn: 'cos',
      op: '+',
      title: 'Формула косинуса суммы',
      tex: '\\cos\\bigl(\\alpha + \\beta\\bigr) = \\cos\\alpha\\cos\\beta - \\sin\\alpha\\sin\\beta',
    },
    {
      fn: 'cos',
      op: '-',
      title: 'Формула косинуса разности',
      tex: '\\cos\\bigl(\\alpha - \\beta\\bigr) = \\cos\\alpha\\cos\\beta + \\sin\\alpha\\sin\\beta',
    },
  ];
  const angle = '(?:\\\\frac\\{\\\\pi\\}\\{6\\}|\\\\frac\\{\\\\pi\\}\\{4\\}|\\\\frac\\{\\\\pi\\}\\{3\\}|\\\\frac\\{2\\\\pi\\}\\{3\\}|\\\\frac\\{3\\\\pi\\}\\{4\\})';
  const variable = '(?:x|2x|\\\\alpha|2\\\\alpha)';
  for (const rule of rules) {
    const op = rule.op === '+' ? '\\+' : '-';
    const direct = new RegExp(`\\\\${rule.fn}(?:\\^2)?\\\\bigl\\(${variable}${op}${angle}\\\\bigr\\)`);
    const reverse = new RegExp(`\\\\${rule.fn}(?:\\^2)?\\\\bigl\\(${angle}${op}${variable}\\\\bigr\\)`);
    const directMatch = before.match(direct);
    const reverseMatch = before.match(reverse);
    if ((directMatch || reverseMatch) && !direct.test(after) && !reverse.test(after)) {
      formulas.push({
        title: rule.title,
        tex: rule.tex,
        pos: directMatch?.index ?? reverseMatch?.index ?? 0,
      });
    }
  }
  return formulas;
}

function tangentFormulas(beforeRaw, afterRaw) {
  const before = compact(beforeRaw);
  const after = compact(afterRaw);
  if (before.includes('\\frac{\\sinx}{\\cosx}') && /\\operatorname\{tg\}x|\\tanx/.test(after)) {
    return [{
      title: 'Определение тангенса',
      tex: '\\operatorname{tg} x = \\frac{\\sin x}{\\cos x}',
      pos: before.indexOf('\\frac{\\sinx}{\\cosx}'),
    }];
  }
  return [];
}

function formulasForTransition(before, after) {
  return [
    ...reductionFormulas(before, after),
    ...doubleAngleFormulas(before, after),
    ...pythagoreanFormulas(before, after),
    ...sumDifferenceFormulas(before, after),
    ...tangentFormulas(before, after),
  ].sort((a, b) => (a.pos ?? Number.MAX_SAFE_INTEGER) - (b.pos ?? Number.MAX_SAFE_INTEGER));
}

function formulaKey(formula) {
  return compact(formula?.tex || '');
}

function isCollapsibleFormula(formula) {
  const title = String(formula?.title || '');
  return (
    title.includes('Формула приведения')
    || title.includes('Формула нечётности')
    || title.includes('Формула чётности')
    || title.includes('Формула двойного угла')
    || title.includes('Формула синуса')
    || title.includes('Формула косинуса')
  );
}

function collapseFormulaOnlyChains(steps) {
  const out = [...steps];
  for (let i = 0; i < out.length - 2; i += 1) {
    const before = out[i];
    const middle = out[i + 1];
    const after = out[i + 2];
    if (typeof before !== 'string' || typeof middle !== 'string' || typeof after !== 'string') continue;

    const first = formulasForTransition(before, middle);
    const second = formulasForTransition(middle, after);
    if (!first.length || !second.length) continue;
    if (![...first, ...second].every(isCollapsibleFormula)) continue;

    const combined = formulasForTransition(before, after);
    const expected = new Set([...first, ...second].map(formulaKey));
    const actual = new Set(combined.map(formulaKey));
    if (![...expected].every((key) => actual.has(key))) continue;

    out.splice(i + 1, 1);
    i = Math.max(-1, i - 2);
  }
  return out;
}

function addHintsBetweenSteps(steps) {
  const clean = collapseFormulaOnlyChains(dropCoefficientLines(dropKnownPiExpansionLines(cleanStepArray(steps))));
  if (clean.length < 2) return clean;
  const out = [];
  for (let i = 0; i < clean.length; i += 1) {
    const current = clean[i];
    const quadraticHints = quadraticFormulaHintsForLine(current);
    if (isStandaloneQuadraticFormulaLine(current)) {
      out.push(...quadraticHints);
    } else {
      out.push(...quadraticHints, current);
    }
    if (i >= clean.length - 1) continue;
    const formulas = formulasForTransition(current, clean[i + 1]);
    if (formulas.length) out.push(...formulaHintSteps(formulas));
  }
  return out;
}

function isStandaloneQuadraticFormulaLine(step) {
  const n = compact(step);
  return n === 'D=b^2-4ac' || /^t_\{1,2\}=\\frac\{-b\\pm\\sqrt\{D\}\}\{2a\}$/.test(n);
}

function quadraticFormulaHintsForLine(step) {
  const n = compact(step);
  if (n === 'D=b^2-4ac' || /^D=/.test(n)) {
    return formulaHintSteps([{ tex: 'D = b^2 - 4ac' }]);
  }
  if (/^t_\{1,2\}=\\frac\{-b\\pm\\sqrt\{D\}\}\{2a\}$/.test(n)) {
    return formulaHintSteps([{ tex: 't_{1,2} = \\frac{-b \\pm \\sqrt{D}}{2a}' }]);
  }
  if (/^t_\{1\}=/.test(n)) {
    return formulaHintSteps([{ tex: 't_{1,2} = \\frac{-b \\pm \\sqrt{D}}{2a}' }]);
  }
  if (/^t=\\frac\{-b\}\{2a\}=/.test(n)) {
    return formulaHintSteps([{ tex: 't = \\frac{-b}{2a}' }]);
  }
  return [];
}

function firstStemEquation(stem) {
  const match = String(stem ?? '').match(/\\\((.*?)\\\)/s);
  return match ? match[1].trim() : '';
}

function equationToZero(tex) {
  const source = String(tex ?? '').trim();
  const eq = source.indexOf('=');
  if (eq === -1) return source;
  const left = source.slice(0, eq).trim();
  const right = source.slice(eq + 1).trim();
  if (compact(right) === '0') return `${left} = 0`;
  if (/^-/.test(right)) return `${left} + ${right.replace(/^-+\s*/, '').trim()} = 0`;
  return `${left} - ${right} = 0`;
}

function addSourceLineIfMissing(proto, steps) {
  if (!steps.length) return steps;
  const source = firstStemEquation(proto.stem);
  if (!source || compact(source) === compact(steps[0])) return steps;
  return [source, ...steps];
}

function removeLeadingSourceLine(proto, steps) {
  if (!steps.length) return steps;
  const source = firstStemEquation(proto.stem);
  if (!source || compact(source) !== compact(steps[0])) return steps;
  return steps.slice(1);
}

function ensureMathPrefix(steps, prefix) {
  const spec = Array.isArray(prefix) ? { prefix } : prefix;
  const nextPrefix = spec?.prefix || [];
  const dropLines = spec?.drop || nextPrefix;
  if (!nextPrefix.length) return steps;
  if (nextPrefix.every((line, index) => compact(steps[index]) === compact(line))) return steps;
  const dropKeys = new Set(dropLines.map((line) => compact(line)));
  let drop = 0;
  while (drop < steps.length && dropKeys.has(compact(steps[drop]))) drop += 1;
  return [...nextPrefix, ...steps.slice(drop)];
}

function bridgePrefixForProto(proto) {
  const exactSource = firstStemEquation(proto.stem);
  const source = equationToZero(firstStemEquation(proto.stem));
  const bridge = (prefix, drop = prefix) => ({ prefix, drop });
  const byId = {
    '13.trig.quad.22.2': bridge([
      '2\\sqrt{2}\\,\\sin x + 2\\sin\\bigl(-x\\bigr) - 4\\cos^2 x - \\sqrt{2} + 4 = 0',
      '2 \\sqrt{2} \\sin x - 2 \\sin x - 4 \\cos^2 x + 4 - \\sqrt{2} = 0',
    ], [
      '2\\sqrt{2}\\,\\sin x + 2\\sin\\bigl(-x\\bigr) - 4\\cos^2 x - \\sqrt{2} - 4 = 0',
      '2 \\sqrt{2} \\sin x - 2 \\sin x - 4 \\cos^2 x + 4 - \\sqrt{2} = 0',
    ]),
    '13.trig.quad.22.3': bridge([
      '2\\sqrt{3}\\,\\sin x + 2\\sin\\bigl(-x\\bigr) - 4\\cos^2 x - \\sqrt{3} + 4 = 0',
      '2 \\sqrt{3} \\sin x - 2 \\sin x - 4 \\cos^2 x + 4 - \\sqrt{3} = 0',
    ], [
      '2\\sqrt{3}\\,\\sin x + 2\\sin\\bigl(-x\\bigr) - 4\\cos^2 x - \\sqrt{3} - 4 = 0',
      '2 \\sqrt{3} \\sin x - 2 \\sin x - 4 \\cos^2 x + 4 - \\sqrt{3} = 0',
    ]),
    '13.trig.quad.97.3': bridge([
      '2\\sin^2 x = -3\\sqrt{2}\\,\\cos x + 4',
      '2\\bigl(1 - \\cos^2 x\\bigr) = -3\\sqrt{2}\\,\\cos x + 4',
      '2 - 2 \\cos^2 x = -3 \\sqrt{2} \\cos x + 4',
      '2 \\cos^2 x - 3 \\sqrt{2} \\cos x + 2 = 0',
    ], [
      '2\\sin^2 x + 3\\sqrt{2}\\,\\sin\\bigl(\\frac{\\pi}{2}-x\\bigr) + 4 = 0',
      '2 - 2 \\cos^2 x = -3 \\sqrt{2} \\cos x + 4',
      '2 \\cos^2 x - 3 \\sqrt{2} \\cos x + 2 = 0',
    ]),
    '13.trig.group.76.1': [
      source,
      '2 \\sin x \\cos x - \\sin x + 2 \\cos x - 1 = 0',
      '\\sin x\\bigl(2\\cos x - 1\\bigr) + \\bigl(2\\cos x - 1\\bigr) = 0',
    ],
    '13.trig.group.76.2': [
      source,
      '2 \\sin x \\cos x - \\sqrt{2} \\sin x + 2 \\cos x - \\sqrt{2} = 0',
      '\\sin x\\bigl(2\\cos x - \\sqrt{2}\\bigr) + \\bigl(2\\cos x - \\sqrt{2}\\bigr) = 0',
    ],
    '13.trig.group.76.3': [
      source,
      '2 \\sin x \\cos x - \\sqrt{3} \\sin x + 2 \\cos x - \\sqrt{3} = 0',
      '\\sin x\\bigl(2\\cos x - \\sqrt{3}\\bigr) + \\bigl(2\\cos x - \\sqrt{3}\\bigr) = 0',
    ],
    '13.trig.group.77.1': bridge([
      source,
      '2 \\sin x \\cos x - 2 \\sin x + \\sqrt{2} \\cos x - \\sqrt{2} = 0',
      '2 \\sin x\\bigl(\\cos x - 1\\bigr) + \\sqrt{2} \\bigl(\\cos x - 1\\bigr) = 0',
    ], [
      source,
      '\\sin 2x - 2 \\sin x + \\sqrt{2} \\cos x - \\sqrt{2} = 0',
      '2 \\sin x \\cos x - 2 \\sin x + \\sqrt{2} \\cos x - \\sqrt{2} = 0',
      '2 \\sin x\\bigl(\\cos x - 1\\bigr) + \\sqrt{2} \\bigl(\\cos x - 1\\bigr) = 0',
    ]),
    '13.trig.group.77.2': bridge([
      source,
      '2 \\sin x \\cos x - 2 \\sin x + \\sqrt{3} \\cos x - \\sqrt{3} = 0',
      '2 \\sin x\\bigl(\\cos x - 1\\bigr) + \\sqrt{3} \\bigl(\\cos x - 1\\bigr) = 0',
    ], [
      source,
      '\\sin 2x - 2 \\sin x + \\sqrt{3} \\cos x - \\sqrt{3} = 0',
      '2 \\sin x \\cos x - 2 \\sin x + \\sqrt{3} \\cos x - \\sqrt{3} = 0',
      '2 \\sin x\\bigl(\\cos x - 1\\bigr) + \\sqrt{3} \\bigl(\\cos x - 1\\bigr) = 0',
    ]),
    '13.trig.group.77.3': bridge([
      source,
      '2 \\sin x \\cos x - 2 \\sin x + 2 \\cos x - 2 = 0',
      '2 \\sin x\\bigl(\\cos x - 1\\bigr) + 2 \\bigl(\\cos x - 1\\bigr) = 0',
    ], [
      source,
      '\\sin 2x - 2 \\sin x + 2 \\cos x - 2 = 0',
      '2 \\sin x \\cos x - 2 \\sin x + 2 \\cos x - 2 = 0',
      '2 \\sin x\\bigl(\\cos x - 1\\bigr) + 2 \\bigl(\\cos x - 1\\bigr) = 0',
    ]),
    '13.trig.factor.50.1': bridge([
      source,
      '1 - 2 \\sin^2 x - \\sin x - 1 = 0',
      '-2 \\sin^2 x - \\sin x = 0',
      '-\\sin x\\bigl(2 \\sin x + 1\\bigr) = 0',
      '\\sin x\\bigl(2 \\sin x + 1\\bigr) = 0',
    ], [
      source,
      '\\cos 2x + \\bigl(\\sin x \\cos \\pi - \\cos x \\sin \\pi\\bigr) - 1 = 0',
      '\\cos 2x - \\sin x - 1 = 0',
      '1 - 2 \\sin^2 x - \\sin x - 1 = 0',
      '-2 \\sin^2 x - \\sin x = 0',
      '-\\sin x\\bigl(2 \\sin x + 1\\bigr) = 0',
      '\\sin x\\bigl(2 \\sin x + 1\\bigr) = 0',
    ]),
    '13.trig.factor.50.2': bridge([
      source,
      '1 - 2 \\sin^2 x - \\sqrt{3} \\sin x - 1 = 0',
      '-2 \\sin^2 x - \\sqrt{3} \\sin x = 0',
      '-\\sin x\\bigl(2 \\sin x + \\sqrt{3}\\bigr) = 0',
      '\\sin x\\bigl(2 \\sin x + \\sqrt{3}\\bigr) = 0',
    ], [
      source,
      '\\cos 2x + \\sqrt{3}\\bigl(\\sin x \\cos \\pi - \\cos x \\sin \\pi\\bigr) - 1 = 0',
      '\\cos 2x - \\sqrt{3} \\sin x - 1 = 0',
      '1 - 2 \\sin^2 x - \\sqrt{3} \\sin x - 1 = 0',
      '-2 \\sin^2 x - \\sqrt{3} \\sin x = 0',
      '-\\sin x\\bigl(2 \\sin x + \\sqrt{3}\\bigr) = 0',
      '\\sin x\\bigl(2 \\sin x + \\sqrt{3}\\bigr) = 0',
    ]),
    '13.trig.factor.50.3': bridge([
      source,
      '1 - 2 \\sin^2 x - 2 \\sin x - 1 = 0',
      '-2 \\sin^2 x - 2 \\sin x = 0',
      '-\\sin x\\bigl(2 \\sin x + 2\\bigr) = 0',
      '\\sin x\\bigl(2 \\sin x + 2\\bigr) = 0',
    ], [
      source,
      '\\cos 2x + 2\\bigl(\\sin x \\cos \\pi - \\cos x \\sin \\pi\\bigr) - 1 = 0',
      '\\cos 2x - 2 \\sin x - 1 = 0',
      '1 - 2 \\sin^2 x - 2 \\sin x - 1 = 0',
      '-2 \\sin^2 x - 2 \\sin x = 0',
      '-\\sin x\\bigl(2 \\sin x + 2\\bigr) = 0',
      '\\sin x\\bigl(2 \\sin x + 2\\bigr) = 0',
    ]),
    '13.trig.other.81.1': [
      source,
      '4\\sin x\\cos^2 x - 2\\bigl(2\\sin x\\cos x\\bigr) + \\sin x = 0',
    ],
    '13.trig.other.81.2': [
      source,
      '4\\sin x\\cos^2 x - 2\\sqrt{2}\\bigl(2\\sin x\\cos x\\bigr) + 2\\sin x = 0',
    ],
    '13.trig.other.81.3': [
      source,
      '4\\sin x\\cos^2 x + 2\\bigl(2\\sin x\\cos x\\bigr) + \\sin x = 0',
    ],
    '13.trig.other.83.1': bridge([
      source,
      '4\\cos^3 x - 2\\bigl(2\\cos^2 x - 1\\bigr) + \\cos x - 2 = 0',
      '4\\cos^3 x - 4\\cos^2 x + 2 + \\cos x - 2 = 0',
    ], [
      source,
      '4\\cos^3 x - 2\\bigl(2\\cos^2 x - 1\\bigr) + \\cos x - 2 = 0',
      '4\\cos^3 x - 4\\cos^2 x + 2 + \\cos x - 2 = 0',
      exactSource,
      source,
      '4\\cos^3 x - 2\\bigl(2\\cos^2 x - 1\\bigr) + \\cos x - 2 = 0',
      '4\\cos^3 x - 4\\cos^2 x + 2 + \\cos x - 2 = 0',
    ]),
    '13.trig.other.83.2': bridge([
      source,
      '4\\cos^3 x - 2\\sqrt{2}\\bigl(2\\cos^2 x - 1\\bigr) + 2\\cos x - 2\\sqrt{2} = 0',
      '4\\cos^3 x - 4\\sqrt{2}\\cos^2 x + 2\\sqrt{2} + 2\\cos x - 2\\sqrt{2} = 0',
    ], [
      source,
      '4\\cos^3 x - 2\\sqrt{2}\\bigl(2\\cos^2 x - 1\\bigr) + 2\\cos x - 2\\sqrt{2} = 0',
      '4\\cos^3 x - 4\\sqrt{2}\\cos^2 x + 2\\sqrt{2} + 2\\cos x - 2\\sqrt{2} = 0',
      exactSource,
      source,
      '4\\cos^3 x - 2\\sqrt{2}\\bigl(2\\cos^2 x - 1\\bigr) + 2\\cos x - 2\\sqrt{2} = 0',
      '4\\cos^3 x - 4\\sqrt{2}\\cos^2 x + 2\\sqrt{2} + 2\\cos x - 2\\sqrt{2} = 0',
    ]),
    '13.trig.other.83.3': bridge([
      source,
      '4\\cos^3 x + 2\\sqrt{2}\\bigl(2\\cos^2 x - 1\\bigr) + 2\\cos x + 2\\sqrt{2} = 0',
      '4\\cos^3 x + 4\\sqrt{2}\\cos^2 x - 2\\sqrt{2} + 2\\cos x + 2\\sqrt{2} = 0',
    ], [
      source,
      '4\\cos^3 x + 2\\sqrt{2}\\bigl(2\\cos^2 x - 1\\bigr) + 2\\cos x + 2\\sqrt{2} = 0',
      '4\\cos^3 x + 4\\sqrt{2}\\cos^2 x - 2\\sqrt{2} + 2\\cos x + 2\\sqrt{2} = 0',
      exactSource,
      source,
      '4\\cos^3 x + 2\\sqrt{2}\\bigl(2\\cos^2 x - 1\\bigr) + 2\\cos x + 2\\sqrt{2} = 0',
      '4\\cos^3 x + 4\\sqrt{2}\\cos^2 x - 2\\sqrt{2} + 2\\cos x + 2\\sqrt{2} = 0',
    ]),
    '13.trig.other.89-98.1': bridge([
      '\\sin 2x + \\sin x - 2\\cos x - 1 = 0',
      '2 \\sin x \\cos x + \\sin x - 2 \\cos x - 1 = 0',
      '2\\cos x \\bigl(\\sin x - 1\\bigr) + \\bigl(\\sin x - 1\\bigr) = 0',
      '\\bigl(\\sin x - 1\\bigr) \\bigl(2 \\cos x + 1\\bigr) = 0',
    ], [
      '\\sin 2x + \\sin x - 2\\cos x + 1 = 0',
      '2 \\sin x \\cos x + \\sin x - 2 \\cos x - 1 = 0',
      '2\\cos x \\bigl(\\sin x - 1\\bigr) + \\bigl(\\sin x - 1\\bigr) = 0',
      '\\bigl(\\sin x - 1\\bigr) \\bigl(2 \\cos x + 1\\bigr) = 0',
    ]),
    '13.trig.other.89-98.2': bridge([
      '\\sin 2x + \\sqrt{3}\\,\\sin x - 2\\cos x - \\sqrt{3} = 0',
      '2 \\sin x \\cos x + \\sqrt{3} \\sin x - 2 \\cos x - \\sqrt{3} = 0',
      '2\\cos x \\bigl(\\sin x - 1\\bigr) + \\sqrt{3} \\bigl(\\sin x - 1\\bigr) = 0',
      '\\bigl(\\sin x - 1\\bigr) \\bigl(2 \\cos x + \\sqrt{3}\\bigr) = 0',
    ], [
      '\\sin 2x + \\sqrt{3}\\,\\sin x - 2\\cos x + \\sqrt{3} = 0',
      '2 \\sin x \\cos x + \\sqrt{3} \\sin x - 2 \\cos x - \\sqrt{3} = 0',
      '2\\cos x \\bigl(\\sin x - 1\\bigr) + \\sqrt{3} \\bigl(\\sin x - 1\\bigr) = 0',
      '\\bigl(\\sin x - 1\\bigr) \\bigl(2 \\cos x + \\sqrt{3}\\bigr) = 0',
    ]),
    '13.trig.other.89-98.3': bridge([
      '\\sin 2x - \\sin x - 2\\cos x + 1 = 0',
      '2 \\sin x \\cos x - \\sin x - 2 \\cos x + 1 = 0',
      '2\\cos x \\bigl(\\sin x - 1\\bigr) - \\bigl(\\sin x - 1\\bigr) = 0',
      '\\bigl(\\sin x - 1\\bigr) \\bigl(2 \\cos x - 1\\bigr) = 0',
    ], [
      '\\sin 2x - \\sin x - 2\\cos x - 1 = 0',
      '2 \\sin x \\cos x - \\sin x - 2 \\cos x + 1 = 0',
      '2\\cos x \\bigl(\\sin x - 1\\bigr) + -1 \\bigl(\\sin x - 1\\bigr) = 0',
      '\\bigl(\\sin x - 1\\bigr) \\bigl(2 \\cos x - 1\\bigr) = 0',
    ]),
    '13.trig.other.101.1': bridge([
      '\\text{Пусть } \\alpha = \\frac{x}{2},\\quad x = 2\\alpha',
      '\\cos 2\\alpha + \\sin\\bigl(\\frac{3\\pi}{2} - \\alpha\\bigr) + 1 = 0',
      '\\cos 2\\alpha - \\cos\\alpha + 1 = 0',
      '2 \\cos^2\\alpha - 1 - \\cos\\alpha + 1 = 0',
      '2 \\cos^2\\alpha - \\cos\\alpha = 0',
      '\\cos\\alpha\\bigl(2\\cos\\alpha - 1\\bigr) = 0',
    ], [
      '\\text{Пусть } \\alpha = \\frac{x}{2},\\quad x = 2\\alpha',
      '\\cos x - \\cos\\frac{x}{2} + 1 = 0',
      '2 \\cos^2\\alpha - \\cos\\alpha = 0',
      '\\cos\\alpha\\bigl(2\\cos\\alpha - 1\\bigr) = 0',
    ]),
    '13.trig.other.101.2': bridge([
      '\\text{Пусть } \\alpha = \\frac{x}{2},\\quad x = 2\\alpha',
      '\\cos 2\\alpha + \\sqrt{2}\\sin\\bigl(\\frac{3\\pi}{2} - \\alpha\\bigr) + 1 = 0',
      '\\cos 2\\alpha - \\sqrt{2}\\cos\\alpha + 1 = 0',
      '2 \\cos^2\\alpha - 1 - \\sqrt{2}\\cos\\alpha + 1 = 0',
      '2 \\cos^2\\alpha - \\sqrt{2}\\cos\\alpha = 0',
      '\\cos\\alpha\\bigl(2\\cos\\alpha - \\sqrt{2}\\bigr) = 0',
    ], [
      '\\text{Пусть } \\alpha = \\frac{x}{2},\\quad x = 2\\alpha',
      '\\cos x - \\sqrt{2}\\cos\\frac{x}{2} + 1 = 0',
      '2 \\cos^2\\alpha - \\sqrt{2}\\cos\\alpha = 0',
      '\\cos\\alpha\\bigl(2\\cos\\alpha - \\sqrt{2}\\bigr) = 0',
    ]),
    '13.trig.other.101.3': bridge([
      '\\text{Пусть } \\alpha = \\frac{x}{2},\\quad x = 2\\alpha',
      '\\cos 2\\alpha + \\sqrt{3}\\cos\\bigl(\\pi - \\alpha\\bigr) + 1 = 0',
      '\\cos 2\\alpha - \\sqrt{3}\\cos\\alpha + 1 = 0',
      '2 \\cos^2\\alpha - 1 - \\sqrt{3}\\cos\\alpha + 1 = 0',
      '2 \\cos^2\\alpha - \\sqrt{3}\\cos\\alpha = 0',
      '\\cos\\alpha\\bigl(2\\cos\\alpha - \\sqrt{3}\\bigr) = 0',
    ], [
      '\\text{Пусть } \\alpha = \\frac{x}{2},\\quad x = 2\\alpha',
      '\\cos x - \\sqrt{3}\\cos\\frac{x}{2} + 1 = 0',
      '2 \\cos^2\\alpha - \\sqrt{3}\\cos\\alpha = 0',
      '\\cos\\alpha\\bigl(2\\cos\\alpha - \\sqrt{3}\\bigr) = 0',
    ]),
  };
  return byId[proto.id] || null;
}

function addMissingBridgeSteps(proto, steps) {
  const prefix = bridgePrefixForProto(proto);
  if (!prefix) return steps;
  return ensureMathPrefix(steps, prefix);
}

function stepKey(step) {
  if (typeof step === 'string') return `s:${compact(step)}`;
  if (step && typeof step === 'object') return `o:${JSON.stringify(step)}`;
  return `x:${String(step)}`;
}

function removeAdjacentDuplicateBlocks(steps) {
  const next = steps.slice();
  let changed = true;
  while (changed) {
    changed = false;
    for (let start = 0; start < next.length - 3 && !changed; start += 1) {
      const maxLen = Math.floor((next.length - start) / 2);
      for (let len = maxLen; len >= 2; len -= 1) {
        let same = true;
        for (let offset = 0; offset < len; offset += 1) {
          if (stepKey(next[start + offset]) !== stepKey(next[start + len + offset])) {
            same = false;
            break;
          }
        }
        if (same) {
          next.splice(start + len, len);
          changed = true;
          break;
        }
      }
    }
  }
  return next;
}

function visitProtos(draft, fn) {
  for (const cls of draft.classes || []) {
    for (const method of cls.methods || []) {
      for (const source of method.sources || []) {
        for (const proto of source.prototypes || []) fn(proto);
      }
    }
  }
}

function applyFormulaHints(proto) {
  const sol = proto.solution || {};
  let changed = false;

  if (Array.isArray(sol.steps)) {
    const bridgedSteps = addMissingBridgeSteps(proto, removeLeadingSourceLine(proto, cleanStepArray(sol.steps)));
    const nextSteps = removeAdjacentDuplicateBlocks(addHintsBetweenSteps(addSourceLineIfMissing(proto, bridgedSteps)));
    if (JSON.stringify(nextSteps) !== JSON.stringify(sol.steps)) {
      sol.steps = nextSteps;
      changed = true;
    }
  }

  for (const group of sol.gen_groups || []) {
    if (!Array.isArray(group.steps)) continue;
    const nextSteps = removeAdjacentDuplicateBlocks(addHintsBetweenSteps(group.steps));
    if (JSON.stringify(nextSteps) !== JSON.stringify(group.steps)) {
      group.steps = nextSteps;
      changed = true;
    }
  }

  if (changed) normalizeProtoTexStyle(proto);
  return changed;
}

const draft = JSON.parse(await fs.readFile(DRAFT, 'utf8'));
const changed = [];
visitProtos(draft, (proto) => {
  if (applyFormulaHints(proto)) changed.push(`${proto.cid || ''} ${proto.id || ''}`.trim());
});

await fs.writeFile(DRAFT, JSON.stringify(draft, null, 2) + '\n', 'utf8');
console.log(`[formula-hints] changed protos: ${changed.length}`);
for (const id of changed) console.log(`  ${id}`);
