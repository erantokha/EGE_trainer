// Check №13 solution data against content/tasks/part2/13/solution_contract.json.
// The JSON contract is the source of truth; this script is the machine guard.

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  findCosSplitPair,
  groupHasCosEvidence,
  identifyCosPmRuleInItems,
} from './part2_13_trig_solution_contract.mjs';
import { findRoundParenStyleIssues } from './part2_13_tex_style.mjs';

const ROOT = process.cwd();
const CONTRACT_PATH = path.join(ROOT, 'content/tasks/part2/13/solution_contract.json');
const CONTENT_DIR = path.dirname(CONTRACT_PATH);

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function removeTexCommandWithBalancedArg(source, command) {
  let s = String(source ?? '');
  const needle = `\\${command}{`;
  let start = s.indexOf(needle);
  while (start !== -1) {
    let depth = 0;
    let end = -1;
    for (let i = start + needle.length - 1; i < s.length; i += 1) {
      if (s[i] === '{') depth += 1;
      else if (s[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) break;
    s = s.slice(0, start) + s.slice(end + 1);
    start = s.indexOf(needle);
  }
  return s;
}

function norm(s) {
  return removeTexCommandWithBalancedArg(s, 'vphantom')
    .replace(/\\tfrac\b/g, '\\frac')
    .replace(/\\dfrac\b/g, '\\frac')
    .replace(/\s+/g, '')
    .replace(/\\,/g, '')
    .replace(/\\quad/g, '')
    .replace(/\\left/g, '')
    .replace(/\\right/g, '')
    .replace(/\\bigl/g, '')
    .replace(/\\bigr/g, '');
}

function firstStemEquation(stem) {
  const match = String(stem ?? '').match(/\\\((.*?)\\\)/s);
  return match ? match[1].trim() : '';
}

function firstMathStep(steps) {
  return (steps || []).find((step) => typeof step === 'string') || '';
}

function hasTrigFunction(s) {
  return /\\(?:sin|cos|operatorname\{tg\}|tan)\b/.test(String(s ?? ''));
}

function isFormulaHintStep(step) {
  return !!step && typeof step === 'object' && step.kind === 'formula_hint';
}

function formulaHintItems(step) {
  if (!isFormulaHintStep(step)) return [];
  if (Array.isArray(step.formulas)) return step.formulas;
  if (typeof step.tex === 'string') return [{ tex: step.tex }];
  return [];
}

function isMathStep(step) {
  return typeof step === 'string';
}

function mathSteps(steps) {
  return (steps || []).filter(isMathStep);
}

function isCosZeroHead(s) {
  return /^\\cosx=0$/.test(norm(s));
}

function isSinZeroHead(s) {
  return /^\\sinx=0$/.test(norm(s));
}

function includesPiOver2TwoPi(s) {
  return /x=\\frac\{\\pi\}\{2\}\+2\\pin/.test(norm(s));
}

function includesThreePiOver2TwoPi(s) {
  const n = norm(s);
  return /x=\\frac\{3\\pi\}\{2\}\+2\\pin/.test(n)
    || /x=\\frac\{3\*?\\pi\}\{2\}\+2\\pin/.test(n);
}

function hasSingleCosZeroSeries(series) {
  return (series || []).some((s) => /x=\\frac\{\\pi\}\{2\}\+\\pin/.test(norm(s)));
}

function isUnreducedTrigEquation(s) {
  const t = norm(s);
  if (!hasTrigFunction(s)) return false;
  if (!/=0$/.test(t)) return false;
  if (/^\\(?:sin|cos)x=/.test(t)) return false;
  if (/^\\operatorname\{tg\}x=/.test(t)) return false;
  if (/^\\tanx=/.test(t)) return false;
  return /[()+-]/.test(t.replace(/=0$/, ''));
}

function hasProductStep(steps) {
  return (steps || []).some((s) => {
    const t = norm(s);
    return /=0$/.test(t) && (/\)\(/.test(t) || /x\(/.test(t));
  });
}

function hasTopLevelAddition(left) {
  let parenDepth = 0;
  let braceDepth = 0;
  for (let i = 0; i < left.length; i += 1) {
    const ch = left[i];
    if (ch === '(') parenDepth += 1;
    else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
    else if (ch === '{') braceDepth += 1;
    else if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);
    else if ((ch === '+' || ch === '-') && parenDepth === 0 && braceDepth === 0 && i > 0) return true;
  }
  return false;
}

function isPureProductZeroStep(s) {
  const t = norm(s);
  if (!/=0$/.test(t)) return false;
  const left = t.replace(/=0$/, '');
  if (!left || left.includes('=')) return false;
  if (hasTopLevelAddition(left)) return false;
  return /\)\(/.test(left) || /x\(/.test(left);
}

function isNegativeToPositiveProduct(first, second) {
  if (!isPureProductZeroStep(first) || !isPureProductZeroStep(second)) return false;
  const firstLeft = leftSide(first);
  const secondLeft = leftSide(second);
  return firstLeft.startsWith('-') && firstLeft.slice(1) === secondLeft;
}

function findPostProductRefactors(steps) {
  const out = [];
  for (let i = 0; i < (steps || []).length - 1; i += 1) {
    if (isNegativeToPositiveProduct(steps[i], steps[i + 1])) continue;
    if (isPureProductZeroStep(steps[i]) && isPureProductZeroStep(steps[i + 1])) {
      out.push({ first: steps[i], second: steps[i + 1], index: i });
    }
  }
  return out;
}

function startsWithPositiveTrigProduct(step) {
  return /^(?:\\sinx|\\cosx)\(/.test(leftSide(step));
}

function findNegativeCommonFactorJumps(steps) {
  const out = [];
  for (let i = 0; i < (steps || []).length - 1; i += 1) {
    const before = steps[i];
    const after = steps[i + 1];
    if (leftSide(before).startsWith('-') && !isPureProductZeroStep(before) && startsWithPositiveTrigProduct(after)) {
      out.push({ index: i, before, after });
    }
  }
  return out;
}

function isReducedSinCosEquation(s) {
  return /^\\(?:sin|cos)x=/.test(norm(s));
}

function isNegativeLinearTrigEquation(s) {
  const t = norm(s);
  if (!/=0$/.test(t)) return false;
  const left = leftSide(s);
  if (!left.startsWith('-')) return false;
  if (!/\\(?:sin|cos)x/.test(left)) return false;
  if (/\\(?:sin|cos)\^2x/.test(left)) return false;
  if (isPureProductZeroStep(s)) return false;
  return true;
}

function findNegativeLinearReductionJumps(lines) {
  const out = [];
  for (let i = 0; i < (lines || []).length - 1; i += 1) {
    const before = lines[i];
    const after = lines[i + 1];
    if (isNegativeLinearTrigEquation(before) && isReducedSinCosEquation(after)) {
      out.push({ index: i, before, after });
    }
  }
  return out;
}

function findAngleSumFormulaIssues(proto, steps) {
  const source = compactTex([proto.stem || '', ...(steps || [])].join('\n'));
  const stepSource = compactTex((steps || []).join('\n'));
  const issues = [];

  const hasSin2xPi4 = /\\sin\\bigl\(2x\+\\frac\{\\pi\}\{4\}\\bigr\)/.test(source);
  const hasSin2xPi4Formula = /\\sin2x\\cos\\frac\{\\pi\}\{4\}/.test(stepSource)
    && /\\cos2x\\sin\\frac\{\\pi\}\{4\}/.test(stepSource);
  if (hasSin2xPi4 && !hasSin2xPi4Formula) {
    issues.push({
      kind: 'sin(2x+pi/4)',
      message: 'Для sin(2x + pi/4) не найдена строка с формулой sin 2x cos(pi/4) + cos 2x sin(pi/4).',
    });
  }

  return issues;
}

function hasTangent(s) {
  return /\\operatorname\{tg\}\s*x|\\tan\s*x/.test(String(s ?? ''));
}

function hasSinOverCosFraction(s) {
  return /\\frac\{\\sinx\}\{\\cosx\}/.test(norm(s));
}

function findTangentDivisionJumps(lines) {
  const out = [];
  for (let i = 0; i < (lines || []).length; i += 1) {
    if (!hasTangent(lines[i])) continue;
    if (i > 0 && hasTangent(lines[i - 1])) continue;
    const previousWindow = lines.slice(Math.max(0, i - 3), i);
    if (!previousWindow.some(hasSinOverCosFraction)) {
      out.push({ index: i, line: lines[i], previous: previousWindow.join('\n') });
    }
  }
  return out;
}

function findDoubleAngleBeforeFactorJumps(steps) {
  const out = [];
  for (let i = 0; i < (steps || []).length - 1; i += 1) {
    const before = norm(steps[i]);
    const after = norm(steps[i + 1]);
    if (/\\sin2x/.test(before) && isPureProductZeroStep(steps[i + 1]) && !/2\\sinx\\cosx/.test(after)) {
      out.push({ index: i, before: steps[i], after: steps[i + 1] });
    }
  }
  return out;
}

function findFormulaHintShapeIssues(steps, basePath = 'solution.steps') {
  const out = [];
  (steps || []).forEach((step, index) => {
    if (typeof step === 'string') return;
    if (!isFormulaHintStep(step)) {
      out.push({ path: `${basePath}[${index}]`, index, message: 'Нештатный объект в шагах решения.', step });
      return;
    }
    const formulas = formulaHintItems(step);
    if ('title' in step) {
      out.push({ path: `${basePath}[${index}].title`, index, message: 'В formula_hint не должно быть заголовка title.', step });
    }
    if (!formulas.length) {
      out.push({ path: `${basePath}[${index}]`, index, message: 'formula_hint без массива formulas или tex.', step });
      return;
    }
    if (formulas.length !== 1) {
      out.push({ path: `${basePath}[${index}].formulas`, index, message: 'В одной рамке должна быть ровно одна формула.', step });
    }
    formulas.forEach((formula, formulaIndex) => {
      if (!formula || typeof formula !== 'object') {
        out.push({ path: `${basePath}[${index}].formulas[${formulaIndex}]`, index, formulaIndex, message: 'Формула должна быть объектом { tex }.', step });
        return;
      }
      if ('title' in formula) {
        out.push({ path: `${basePath}[${index}].formulas[${formulaIndex}].title`, index, formulaIndex, message: 'У формулы в рамке не должно быть подписи title.', step });
      }
      if (typeof formula.tex !== 'string' || !formula.tex.trim()) {
        out.push({ path: `${basePath}[${index}].formulas[${formulaIndex}]`, index, formulaIndex, message: 'У формулы нет непустого tex.', step });
      }
    });
  });
  return out;
}

function findKnownPiExpansionLines(steps, basePath = 'solution.steps') {
  const out = [];
  (steps || []).forEach((step, index) => {
    if (typeof step !== 'string') return;
    if (step.includes('\\cos \\pi') || step.includes('\\sin \\pi')) {
      out.push({ path: `${basePath}[${index}]`, index, step });
    }
  });
  return out;
}

function findCoefficientLines(steps, basePath = 'solution.steps') {
  const out = [];
  (steps || []).forEach((step, index) => {
    if (typeof step !== 'string') return;
    if (/^\s*a\s*=/.test(step) && /\bb\s*=/.test(step) && /\bc\s*=/.test(step)) {
      out.push({ path: `${basePath}[${index}]`, index, step });
    }
  });
  return out;
}

function containsFormulaHint(steps, fromExclusive, toExclusive) {
  return (steps || []).slice(fromExclusive, toExclusive).some(isFormulaHintStep);
}

function looksLikeFormulaTransition(beforeRaw, afterRaw) {
  const before = norm(beforeRaw);
  const after = norm(afterRaw);
  if (!before || !after || before === after) return false;
  if (/\\sin2x/.test(before) && /2\\sinx\\cosx/.test(after)) return true;
  if (/\\cos2x/.test(before) && (/(?:1-2\\sin\^2x|2\\cos\^2x-1|\\cos\^2x-\\sin\^2x)/.test(after))) return true;
  if (/\\frac\{\\sinx\}\{\\cosx\}/.test(before) && /\\operatorname\{tg\}x|\\tanx/.test(after)) return true;
  if (
    (before.includes('2\\sin^2x') && after.includes('2-2\\cos^2x'))
    || (before.includes('2-2\\cos^2x') && after.includes('2\\sin^2x'))
    || (before.includes('1-\\cos^2x') && after.includes('\\sin^2x'))
    || (before.includes('1-\\sin^2x') && after.includes('\\cos^2x'))
  ) {
    return true;
  }
  if (/\\(?:sin|cos)(?:\^2)?\((?:-[^)]+|[^)]*(?:\\pi|\\frac\{\\pi\})[^)]*)\)/.test(before)) {
    return !/\\(?:sin|cos)(?:\^2)?\((?:-[^)]+|[^)]*(?:\\pi|\\frac\{\\pi\})[^)]*)\)/.test(after);
  }
  if (findSignedPythagoreanJumps([beforeRaw, afterRaw]).length) return true;
  return false;
}

function findMissingFormulaHints(steps, basePath = 'solution.steps') {
  const out = [];
  for (let i = 0; i < (steps || []).length; i += 1) {
    if (!isMathStep(steps[i])) continue;
    let nextIndex = i + 1;
    while (nextIndex < steps.length && !isMathStep(steps[nextIndex])) nextIndex += 1;
    if (nextIndex >= steps.length) continue;
    if (/^\s*\\text\{/.test(String(steps[nextIndex] ?? ''))) continue;
    if (containsFormulaHint(steps, i + 1, nextIndex)) continue;
    if (looksLikeFormulaTransition(steps[i], steps[nextIndex])) {
      out.push({ path: basePath, index: i, nextIndex, before: steps[i], after: steps[nextIndex] });
    }
  }
  return out;
}

function stripOuterParens(s) {
  let t = String(s ?? '');
  while (t.startsWith('(') && t.endsWith(')')) {
    let depth = 0;
    let wraps = true;
    for (let i = 0; i < t.length; i += 1) {
      if (t[i] === '(') depth += 1;
      else if (t[i] === ')') depth -= 1;
      if (depth === 0 && i < t.length - 1) {
        wraps = false;
        break;
      }
    }
    if (!wraps) break;
    t = t.slice(1, -1);
  }
  return t;
}

function productFactorLeft(s) {
  return stripOuterParens(norm(s).replace(/=0$/, ''));
}

function leftSide(s) {
  return norm(s).replace(/=0$/, '');
}

function compactTex(s) {
  return String(s ?? '')
    .replace(/\s+/g, '')
    .replace(/\\!/g, '')
    .replace(/\\tfrac\b/g, '\\frac')
    .replace(/\\dfrac\b/g, '\\frac')
    .replace(/\\left/g, '')
    .replace(/\\right/g, '');
}

function collectStrings(value, basePath = '', out = []) {
  if (typeof value === 'string') {
    out.push({ path: basePath, text: value });
    return out;
  }
  if (!value || typeof value !== 'object') return out;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStrings(item, `${basePath}[${index}]`, out));
    return out;
  }
  for (const [key, item] of Object.entries(value)) {
    collectStrings(item, basePath ? `${basePath}.${key}` : key, out);
  }
  return out;
}

function findTightTrigArgumentSpacing(proto) {
  return collectStrings(proto)
    .filter((item) => /\\(?:sin|cos)\\!\s*(?:\\bigl|\\left|\()/.test(item.text));
}

function splitSignedTerms(expr) {
  const terms = [];
  let current = '';
  let parenDepth = 0;
  let braceDepth = 0;
  const text = String(expr || '');
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '(') parenDepth += 1;
    else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
    else if (ch === '{') braceDepth += 1;
    else if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);

    if ((ch === '+' || ch === '-') && parenDepth === 0 && braceDepth === 0) {
      if (current) terms.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  if (current) terms.push(current);
  return terms
    .map((raw, index) => {
      const sign = raw.startsWith('-') ? '-' : '+';
      const body = raw.startsWith('+') || raw.startsWith('-') ? raw.slice(1) : raw;
      return { raw, sign, body, index };
    })
    .filter((term) => term.body);
}

function normalizeCoeff(coeff) {
  const c = String(coeff || '').replace(/\*/g, '');
  return c || '1';
}

function parseSquareTerm(term) {
  const match = term.body.match(/^(.*)\\(sin|cos)\^2x$/);
  if (!match) return null;
  return {
    sign: term.sign,
    coeff: normalizeCoeff(match[1]),
    func: match[2],
    index: term.index,
    raw: term.raw,
  };
}

function parseConstantTerm(term) {
  if (!term.body || /x|\\(?:sin|cos|operatorname\{tg\}|tan)/.test(term.body)) return null;
  return {
    sign: term.sign,
    coeff: normalizeCoeff(term.body),
    index: term.index,
    raw: term.raw,
  };
}

function hasSquareTerm(terms, func, coeff, sign) {
  return terms
    .map(parseSquareTerm)
    .some((term) => term && term.func === func && term.coeff === coeff && term.sign === sign);
}

function findSignedPythagoreanJumps(lines) {
  const issues = [];
  for (let i = 0; i < (lines || []).length - 1; i += 1) {
    const before = lines[i];
    const after = lines[i + 1];
    const beforeTerms = splitSignedTerms(leftSide(before));
    const afterTerms = splitSignedTerms(leftSide(after));
    const squareTerms = beforeTerms.map(parseSquareTerm).filter(Boolean);
    const constantTerms = beforeTerms.map(parseConstantTerm).filter(Boolean);

    for (const square of squareTerms) {
      const constant = constantTerms.find((term) => term.coeff === square.coeff && term.sign !== square.sign);
      if (!constant) continue;
      const otherFunc = square.func === 'cos' ? 'sin' : 'cos';
      const expectedSign = constant.sign;
      if (!hasSquareTerm(afterTerms, otherFunc, square.coeff, expectedSign)) continue;

      const alreadyOrderedIdentity = square.sign === '-' && constant.sign === '+' && constant.index < square.index;
      if (alreadyOrderedIdentity) continue;

      issues.push({
        index: i,
        before,
        after,
        square: square.raw,
        constant: constant.raw,
      });
    }
  }
  return issues;
}

function extractProductFactors(step) {
  const left = norm(step).replace(/=0$/, '');
  const factors = [];
  for (let i = 0; i < left.length;) {
    if (left[i] === '(') {
      let depth = 0;
      let end = i;
      for (; end < left.length; end += 1) {
        if (left[end] === '(') depth += 1;
        else if (left[end] === ')') {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      factors.push(left.slice(i + 1, end));
      i = end + 1;
    } else {
      let end = i;
      while (end < left.length && left[end] !== '(') end += 1;
      const chunk = left.slice(i, end);
      if (chunk) factors.push(chunk);
      i = end;
    }
  }
  return factors.map(stripOuterParens).filter(Boolean);
}

function findGroupHeadFactorMismatches(steps, groups) {
  const productStep = [...(steps || [])].reverse().find(isPureProductZeroStep);
  if (!productStep || !groups?.length) return [];
  const factors = extractProductFactors(productStep);
  const out = [];
  const count = Math.min(factors.length, groups.length);
  for (let i = 0; i < count; i += 1) {
    const factor = productFactorLeft(factors[i]);
    const head = productFactorLeft(groups[i]?.head || '');
    if (factor && head && factor !== head) {
      out.push({ index: i, factor: factors[i], head: groups[i].head || '' });
    }
  }
  return out;
}

function hasTextOr(steps) {
  return (steps || []).some((s) => /\\text\{или\}|или/.test(String(s)));
}

function mentionsSubstitution(steps) {
  return (steps || []).some((s) => /(?:пусть|t\s*=|t=|замен)/i.test(String(s)));
}

function isIncompleteSquareStep(s) {
  const t = norm(s);
  const withoutSquares = t.replace(/\\sin\^2x|\\cos\^2x/g, '');
  if (/\\sinx|\\cosx/.test(withoutSquares)) return false;
  return /(?:\\sin\^2x|\\cos\^2x)=/.test(t)
    || /(?:\\sinx|\\cosx)\^2=/.test(t)
    || /(?:\\sin\^2x|\\cos\^2x)[+-][^=]+=0/.test(t);
}

function hasIncompleteSquare(steps) {
  const candidates = (steps || []).filter((s) => {
    const t = norm(s);
    return !/^t=/.test(t) && !/t\^2/.test(t) && /(?:\\sin\^2x|\\cos\^2x)/.test(t);
  });
  const last = candidates[candidates.length - 1];
  return last ? isIncompleteSquareStep(last) : false;
}

function hasFactorableNoConstant(steps) {
  return (steps || []).some((s) => {
    const t = norm(s);
    if (!/(?:\\sin\^2x|\\cos\^2x)/.test(t) || !/(?:\\sinx|\\cosx)/.test(t) || !/=0$/.test(t)) return false;
    const left = t.replace(/=0$/, '');
    const leftover = left
      .replace(/[+-]?[^+-=]*(?:\\sin\^2x|\\cos\^2x|\\sinx|\\cosx)/g, '')
      .replace(/[()+]/g, '');
    return leftover === '';
  });
}

function hasHalfAngleWithoutSubstitution(proto, steps) {
  const source = [
    proto.stem || '',
    ...steps,
    ...(proto.solution?.gen_groups || []).flatMap((group) => [
      group.head || '',
      ...(Array.isArray(group.steps) ? mathSteps(group.steps) : []),
      ...(group.series || []),
    ]),
  ].join('\n');
  return /\\frac\{x\}\{2\}|\\tfrac\{x\}\{2\}/.test(source)
    && !/\\alpha\s*=\s*\\frac\{x\}\{2\}|α\s*=\s*x\s*\/\s*2/.test(source);
}

function hasCollapsedPerfectSquare(steps) {
  return (steps || []).some((s) => {
    const t = norm(s);
    return /(?:\\sin|\\cos)x/.test(t) && /\\right\)\^2=0|\)\^2=0/.test(t);
  });
}

function hasPositiveImplicationShortcut(steps) {
  return (steps || []).some((s) => />\s*0\s*\\Rightarrow|>\s*0\s*⇒/.test(String(s)));
}

function hasAnswerRepeatedIntegerNote(general) {
  return (general || []).filter((s) => /\\in\s*\\mathbb\{Z\}/.test(String(s))).length > 1;
}

function flattenRules(contract) {
  const byId = new Map();
  for (const section of contract.sections || []) {
    for (const rule of section.rules || []) {
      byId.set(rule.id, { ...rule, section_id: section.id, section_title: section.title });
    }
  }
  return byId;
}

function checkIndex(contract, ruleById) {
  const byCheck = new Map();
  const integrityIssues = [];

  for (const check of contract.audit?.checks || []) {
    byCheck.set(check.id, check);
    if (!ruleById.has(check.contract_rule)) {
      integrityIssues.push({
        id: 'contract',
        cid: '',
        file: path.relative(ROOT, CONTRACT_PATH),
        topic: 'contract',
        method: '',
        check: check.id,
        rule: 'contract.integrity.missing_rule',
        contract_rule: check.contract_rule,
        level: 'error',
        message: 'Audit-check ссылается на правило, которого нет в sections.',
        fragment: JSON.stringify(check, null, 2),
        suggestion: `Добавить правило ${check.contract_rule} или поправить audit.checks.`,
      });
    }
  }

  return { byCheck, integrityIssues };
}

function makeIssue(proto, file, check, message, fragment, suggestion, ruleById) {
  const contractRule = ruleById.get(check.contract_rule);
  return {
    id: proto.id,
    cid: proto.cid || '',
    file,
    topic: proto.__topic || '',
    method: proto.method || '',
    check: check.id,
    rule: check.contract_rule,
    rule_title: contractRule?.title || '',
    section: contractRule?.section_title || '',
    level: check.level || contractRule?.level || 'warning',
    message,
    fragment: fragment || '',
    suggestion: suggestion || '',
  };
}

function addIssue(issues, checks, ruleById, proto, file, checkId, message, fragment, suggestion) {
  const check = checks.get(checkId);
  if (!check) {
    issues.push({
      id: proto.id,
      cid: proto.cid || '',
      file,
      topic: proto.__topic || '',
      method: proto.method || '',
      check: checkId,
      rule: 'contract.integrity.missing_check',
      contract_rule: '',
      level: 'error',
      message: `Скрипт вызвал проверку ${checkId}, которой нет в solution_contract.json.`,
      fragment: fragment || '',
      suggestion: `Добавить audit.checks entry для ${checkId}.`,
    });
    return;
  }
  issues.push(makeIssue(proto, file, check, message, fragment, suggestion, ruleById));
}

function auditProto(proto, file, checks, ruleById) {
  const issues = [];
  const sol = proto.solution || {};
  const ans = proto.answer || {};
  const rawSteps = Array.isArray(sol.steps) ? sol.steps : [];
  const steps = mathSteps(rawSteps);
  const groups = Array.isArray(sol.gen_groups) ? sol.gen_groups : [];
  const general = Array.isArray(ans.general) ? ans.general : [];
  const cosPmRuleIdsInGroups = new Set();

  const parenIssues = findRoundParenStyleIssues(proto);
  if (parenIssues.length) {
    addIssue(
      issues,
      checks,
      ruleById,
      proto,
      file,
      'layout.uniform.parens',
      'В TeX найдены круглые скобки не в каноническом виде \\bigl(...\\bigr).',
      parenIssues.map((issue) => `${issue.path}: ${issue.reasons.join(', ')}\n${issue.tex}`).join('\n\n'),
      'Заменить обычные (...) и \\left(...\\right) на \\bigl(...\\bigr).'
    );
  }

  const sourceEquation = firstStemEquation(proto.stem);
  const firstStep = firstMathStep(rawSteps);
  if (sourceEquation && firstStep && norm(sourceEquation) !== norm(firstStep)) {
    addIssue(
      issues,
      checks,
      ruleById,
      proto,
      file,
      'rhythm.first.line.source',
      'Первая математическая строка решения не повторяет исходное уравнение из условия.',
      `condition: ${sourceEquation}\nfirst step: ${firstStep}`,
      'Начать solution.steps с исходного уравнения из условия; переносы и преобразования выполнять следующими строками.'
    );
  }

  const tightTrigIssues = findTightTrigArgumentSpacing(proto);
  if (tightTrigIssues.length) {
    addIssue(
      issues,
      checks,
      ruleById,
      proto,
      file,
      'layout.no.tight.trig.argument',
      'В TeX найден отрицательный отступ между sin/cos и скобкой аргумента.',
      tightTrigIssues.map((issue) => `${issue.path}: ${issue.text}`).join('\n'),
      'Убрать \\! после \\sin или \\cos: писать \\sin\\bigl(...\\bigr), \\cos\\bigl(...\\bigr).'
    );
  }

  const formulaHintShapeIssues = [
    ...findFormulaHintShapeIssues(rawSteps, 'solution.steps'),
    ...groups.flatMap((group, groupIndex) => (
      findFormulaHintShapeIssues(
        Array.isArray(group.steps) ? group.steps : [],
        `solution.gen_groups[${groupIndex}].steps`
      )
    )),
  ];
  if (formulaHintShapeIssues.length) {
    addIssue(
      issues,
      checks,
      ruleById,
      proto,
      file,
      'formula.hint.valid',
      'В solution.steps найден некорректный formula_hint.',
      formulaHintShapeIssues
        .map((item) => `${item.path}: ${item.message}\n${JSON.stringify(item.step)}`)
        .join('\n\n'),
      'Использовать объект { "kind": "formula_hint", "formulas": [{ "tex": "..." }] }; для нескольких формул поставить несколько formula_hint подряд.'
    );
  }

  const missingFormulaHints = [
    ...findMissingFormulaHints(rawSteps, 'solution.steps'),
    ...groups.flatMap((group, groupIndex) => (
      findMissingFormulaHints(
        Array.isArray(group.steps) ? group.steps : [],
        `solution.gen_groups[${groupIndex}].steps`
      )
    )),
  ];
  if (missingFormulaHints.length) {
    addIssue(
      issues,
      checks,
      ruleById,
      proto,
      file,
      'formula.hint.required',
      'Похоже, формула применена без рамки-подсказки между строками.',
      missingFormulaHints
        .slice(0, 8)
        .map((item) => `${item.path}, строки ${item.index + 1}-${item.nextIndex + 1}:\n${item.before}\n${item.after}`)
        .join('\n\n'),
      'Добавить formula_hint между строкой до применения формулы и строкой после применения.'
    );
  }

  const piExpansionLines = [
    ...findKnownPiExpansionLines(rawSteps, 'solution.steps'),
    ...groups.flatMap((group, groupIndex) => (
      findKnownPiExpansionLines(
        Array.isArray(group.steps) ? group.steps : [],
        `solution.gen_groups[${groupIndex}].steps`
      )
    )),
  ];
  if (piExpansionLines.length) {
    addIssue(
      issues,
      checks,
      ruleById,
      proto,
      file,
      'formula.hint.no.pi.expansion',
      'Стандартный случай приведения раскрыт через sin pi / cos pi.',
      piExpansionLines
        .map((item) => `${item.path}: ${item.step}`)
        .join('\n'),
      'Использовать конкретную формулу приведения, например \\sin\\bigl(x - \\pi\\bigr) = -\\sin x, без промежуточной общей формулы суммы/разности.'
    );
  }

  const coefficientLines = [
    ...findCoefficientLines(rawSteps, 'solution.steps'),
    ...groups.flatMap((group, groupIndex) => (
      findCoefficientLines(
        Array.isArray(group.steps) ? group.steps : [],
        `solution.gen_groups[${groupIndex}].steps`
      )
    )),
  ];
  if (coefficientLines.length) {
    addIssue(
      issues,
      checks,
      ruleById,
      proto,
      file,
      'quadratic.no.coefficient.line',
      'В решении квадратного уравнения есть отдельная строка с коэффициентами a, b, c.',
      coefficientLines
        .map((item) => `${item.path}: ${item.step}`)
        .join('\n'),
      'Убрать строку коэффициентов; значения коэффициентов сразу подставлять в рамку/формулу дискриминанта и корней.'
    );
  }

  for (const group of groups) {
    const head = group.head || '';
    const series = Array.isArray(group.series) ? group.series : [];
    const groupSteps = Array.isArray(group.steps) ? mathSteps(group.steps) : [];

    if (isCosZeroHead(head)) {
      const hasLongPair = series.some(includesPiOver2TwoPi) && series.some(includesThreePiOver2TwoPi);
      if (hasLongPair) {
        addIssue(
          issues,
          checks,
          ruleById,
          proto,
          file,
          'simple.cos.zero.short',
          'cos x = 0 записан двумя семействами через 2πn.',
          `head: ${head}\nseries: ${series.join(' | ')}`,
          'Заменить на x = \\frac{\\pi}{2} + \\pi n.'
        );
      }
      if (!hasSingleCosZeroSeries(series) && !hasLongPair) {
        addIssue(
          issues,
          checks,
          ruleById,
          proto,
          file,
          'simple.cos.zero.short',
          'cos x = 0 требует ручной проверки формы общего решения.',
          `head: ${head}\nseries: ${series.join(' | ')}`,
          'Ожидаемая форма: x = \\frac{\\pi}{2} + \\pi n.'
        );
      }
    }

    if (isSinZeroHead(head)) {
      const joined = series.map(norm).join('|');
      if (!/x=\\pin/.test(joined)) {
        addIssue(
          issues,
          checks,
          ruleById,
          proto,
          file,
          'simple.sin.zero.review',
          'sin x = 0 не выглядит как короткая стандартная запись.',
          `head: ${head}\nseries: ${series.join(' | ')}`,
          'Ожидаемая форма: x = \\pi n.'
        );
      }
    }

    if (groupHasCosEvidence(group)) {
      const knownRule = identifyCosPmRuleInItems(series);
      if (knownRule) cosPmRuleIdsInGroups.add(knownRule.id);

      const split = findCosSplitPair(series);
      if (split) {
        cosPmRuleIdsInGroups.add(split.rule.id);
        addIssue(
          issues,
          checks,
          ruleById,
          proto,
          file,
          'simple.cos.nonzero.pm',
          'cos x = a записан двумя симметричными семействами вместо формы через ±.',
          `head: ${head}\nsteps: ${groupSteps.join(' | ')}\nseries: ${series.join(' | ')}`,
          `Заменить пару на ${split.replacement}.`
        );
      }
    }

    if (isUnreducedTrigEquation(head) && groupSteps.length === 0) {
      addIssue(
        issues,
        checks,
        ruleById,
        proto,
        file,
        'simple.unreduced.head',
        'В варианте осталось неприведённое простейшее уравнение без промежуточного шага.',
        `head: ${head}`,
        'Добавить group.steps с приведением, например sin x + 1/2 = 0 -> sin x = -1/2.'
      );
    }
  }

  if (cosPmRuleIdsInGroups.size) {
    const split = findCosSplitPair(general, cosPmRuleIdsInGroups);
    if (split) {
      addIssue(
        issues,
        checks,
        ruleById,
        proto,
        file,
        'answer.cos.nonzero.split',
        'В общем ответе cos x = a записан двумя симметричными семействами вместо формы через ±.',
        general.join(' | '),
        `Заменить пару на ${split.replacement}.`
      );
    }
  }

  for (const s of general) {
    if (includesPiOver2TwoPi(s)) {
      const hasPair = general.some(includesThreePiOver2TwoPi);
      if (hasPair) {
        addIssue(
          issues,
          checks,
          ruleById,
          proto,
          file,
          'answer.cos.zero.long',
          'В общем ответе, вероятно, cos x = 0 записан двумя семействами.',
          general.join(' | '),
          'В итоговом ответе заменить пару на x = \\frac{\\pi}{2} + \\pi n.'
        );
        break;
      }
    }
  }

  if (hasTextOr(steps)) {
    addIssue(
      issues,
      checks,
      ruleById,
      proto,
      file,
      'product.text.or',
      'В steps есть строка с «или». По контракту варианты должны быть в gen_groups.',
      steps.filter((s) => /\\text\{или\}|или/.test(String(s))).join('\n'),
      'Перенести разветвление в gen_groups: 1), 2), ...'
    );
  }

  if (hasProductStep(steps) && groups.length < 2 && proto.class === 'тригонометрическое') {
    addIssue(
      issues,
      checks,
      ruleById,
      proto,
      file,
      'product.no.variants',
      'Есть произведение, но меньше двух вариантов gen_groups.',
      steps.join('\n'),
      'Проверить, нужно ли оформить множители как варианты.'
    );
  }

  const postProductRefactors = findPostProductRefactors(steps);
  if (postProductRefactors.length) {
    addIssue(
      issues,
      checks,
      ruleById,
      proto,
      file,
      'product.no.post.factor.refactor',
      'После уже полученного произведения есть ещё одна строка преобразования произведения.',
      postProductRefactors
        .map((item) => `строки ${item.index + 1}-${item.index + 2}:\n${item.first}\n${item.second}`)
        .join('\n\n'),
      'Остановиться на первой строке произведения и перенести каждый множитель в gen_groups как отдельный вариант.'
    );
  }

  const negativeFactorJumps = findNegativeCommonFactorJumps(steps);
  if (negativeFactorJumps.length) {
    addIssue(
      issues,
      checks,
      ruleById,
      proto,
      file,
      'factor.negative.common.factor',
      'При вынесении общего множителя одновременно потерян минус.',
      negativeFactorJumps
        .map((item) => `строки ${item.index + 1}-${item.index + 2}:\n${item.before}\n${item.after}`)
        .join('\n\n'),
      'Сначала вынести отрицательный общий множитель, затем отдельной строкой поделить уравнение на -1.'
    );
  }

  const negativeLinearJumps = [
    ...findNegativeLinearReductionJumps(steps),
    ...groups.flatMap((group) => findNegativeLinearReductionJumps([
      group.head || '',
      ...(Array.isArray(group.steps) ? mathSteps(group.steps) : []),
    ])),
  ];
  if (negativeLinearJumps.length) {
    addIssue(
      issues,
      checks,
      ruleById,
      proto,
      file,
      'trig.negative.linear.reduction.visible',
      'Отрицательное линейное тригонометрическое уравнение приведено к простейшему виду одним скачком.',
      negativeLinearJumps
        .map((item) => `строки ${item.index + 1}-${item.index + 2}:\n${item.before}\n${item.after}`)
        .join('\n\n'),
      'Добавить промежуточную строку: отдельно убрать минус или перенести свободный член, затем отдельно разделить на коэффициент.'
    );
  }

  const angleSumIssues = findAngleSumFormulaIssues(proto, steps);
  if (angleSumIssues.length) {
    addIssue(
      issues,
      checks,
      ruleById,
      proto,
      file,
      'trig.angle.sum.formula',
      'Сумма или разность в аргументе sin упрощена без явной формулы.',
      angleSumIssues.map((issue) => `${issue.kind}: ${issue.message}`).join('\n'),
      'Добавить строку с формулой суммы/разности, затем строку с подстановкой значений известных углов.'
    );
  }

  const tangentDivisionJumps = [
    ...findTangentDivisionJumps(steps),
    ...groups.flatMap((group) => (
      hasTangent(group.head)
        ? []
        : findTangentDivisionJumps([
          group.head || '',
          ...(Array.isArray(group.steps) ? mathSteps(group.steps) : []),
        ])
    )),
  ];
  if (tangentDivisionJumps.length) {
    addIssue(
      issues,
      checks,
      ruleById,
      proto,
      file,
      'trig.tangent.division.visible',
      'Переход к tg x сделан без явной строки деления на cos x.',
      tangentDivisionJumps
        .map((item) => `строка ${item.index + 1}:\n${item.line}\nпредыдущие строки:\n${item.previous}`)
        .join('\n\n'),
      'Перед tg x добавить строку с \\frac{\\sin x}{\\cos x}; при необходимости явно указать \\cos x \\ne 0.'
    );
  }

  const doubleAngleFactorJumps = findDoubleAngleBeforeFactorJumps(steps);
  if (doubleAngleFactorJumps.length) {
    addIssue(
      issues,
      checks,
      ruleById,
      proto,
      file,
      'trig.double.angle.before.factor',
      'sin 2x раскрыт и сразу использован для вынесения множителя в соседней строке.',
      doubleAngleFactorJumps
        .map((item) => `строки ${item.index + 1}-${item.index + 2}:\n${item.before}\n${item.after}`)
        .join('\n\n'),
      'Сначала заменить sin 2x на 2 sin x cos x, затем следующей строкой выполнять группировку или вынесение.'
    );
  }

  const groupHeadMismatches = proto.class === 'тригонометрическое'
    ? findGroupHeadFactorMismatches(steps, groups)
    : [];
  if (groupHeadMismatches.length) {
    addIssue(
      issues,
      checks,
      ruleById,
      proto,
      file,
      'product.group-head.matches-factor',
      'Вариант после произведения начинается не с того множителя, который стоит в произведении.',
      groupHeadMismatches
        .map((item) => `вариант ${item.index + 1}:\nмножитель: ${item.factor}\nhead: ${item.head}`)
        .join('\n\n'),
      'Начать вариант с множителя, приравненного к нулю; упрощение до sin x = a / cos x = a перенести в steps варианта.'
    );
  }

  const hiddenIdentityJumps = [
    ...findSignedPythagoreanJumps(steps),
    ...groups.flatMap((group) => findSignedPythagoreanJumps([
      group.head || '',
      ...(Array.isArray(group.steps) ? mathSteps(group.steps) : []),
    ])),
  ];
  if (hiddenIdentityJumps.length) {
    addIssue(
      issues,
      checks,
      ruleById,
      proto,
      file,
      'identity.hidden.signed.pythagorean',
      'ОТО со знаком применено скрытым скачком между соседними строками.',
      hiddenIdentityJumps
        .map((item) => `строки ${item.index + 1}-${item.index + 2}:\n${item.before}\n${item.after}`)
        .join('\n\n'),
      'Добавить промежуточную строку с явным -(1 - cos^2 x) / -(1 - sin^2 x), затем отдельной строкой заменить скобку по ОТО.'
    );
  }

  if (hasIncompleteSquare(steps) && mentionsSubstitution(steps)) {
    addIssue(
      issues,
      checks,
      ruleById,
      proto,
      file,
      'quadratic.incomplete.substitution',
      'Похоже на неполный квадратный случай, но в steps есть замена.',
      steps.join('\n'),
      'Для sin²x=a или cos²x=a замену не вводим; извлекаем корень.'
    );
  }

  if (hasFactorableNoConstant(steps) && mentionsSubstitution(steps)) {
    addIssue(
      issues,
      checks,
      ruleById,
      proto,
      file,
      'quadratic.no.constant.substitution',
      'Похоже на квадратное без свободного члена, но в steps есть замена.',
      steps.join('\n'),
      'Вынести sin x / cos x как общий множитель.'
    );
  }

  if (hasHalfAngleWithoutSubstitution(proto, steps)) {
    addIssue(
      issues,
      checks,
      ruleById,
      proto,
      file,
      'half.angle.no.substitution',
      'Есть аргумент x/2, но не видно замены alpha = x/2.',
      steps.join('\n'),
      'Ввести замену alpha = x/2, решить относительно alpha и вернуться к x = 2alpha.'
    );
  }

  if (hasCollapsedPerfectSquare(steps)) {
    addIssue(
      issues,
      checks,
      ruleById,
      proto,
      file,
      'quadratic.perfect.square.collapsed',
      'Квадратный множитель свёрнут в полный квадрат без решения через дискриминант.',
      steps.filter((s) => /\\right\)\^2|\)\^2/.test(String(s))).join('\n'),
      'Решить множитель как квадратное уравнение через t и D = 0.'
    );
  }

  if (hasPositiveImplicationShortcut(steps)) {
    addIssue(
      issues,
      checks,
      ruleById,
      proto,
      file,
      'product.positive.factor.shortcut',
      'До вариантов есть сокращающий переход через положительность множителя.',
      steps.filter((s) => />\s*0\s*\\Rightarrow|>\s*0\s*⇒/.test(String(s))).join('\n'),
      'После произведения рассмотреть каждый множитель отдельным вариантом.'
    );
  }

  if (hasAnswerRepeatedIntegerNote(general)) {
    addIssue(
      issues,
      checks,
      ruleById,
      proto,
      file,
      'answer.repeated.integer.note',
      'В данных answer.general n∈Z повторяется в нескольких семействах.',
      general.join(' | '),
      'Рендер показывает n∈Z один раз; можно позже нормализовать сами данные.'
    );
  }

  if (!steps.length && (proto.part === 2 || String(proto.id).startsWith('13.'))) {
    addIssue(
      issues,
      checks,
      ruleById,
      proto,
      file,
      'solution.no.steps',
      'У прототипа нет solution.steps.',
      '',
      'Проверить полноту эталона.'
    );
  }

  return issues;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function readAllProtos(contract) {
  const files = contract.sources?.manifests || [];
  const protos = [];
  for (const file of files) {
    const full = path.join(CONTENT_DIR, file);
    const manifest = await readJson(full);
    for (const type of manifest.types || []) {
      for (const proto of type.prototypes || []) {
        protos.push({ ...proto, __topic: manifest.topic || type.id || '', __file: file });
      }
    }
  }
  return protos;
}

function summarize(issues, protos, contract) {
  const byLevel = {};
  const byRule = {};
  const byFile = {};
  for (const issue of issues) {
    byLevel[issue.level] = (byLevel[issue.level] || 0) + 1;
    byRule[issue.rule] = (byRule[issue.rule] || 0) + 1;
    byFile[issue.file] = (byFile[issue.file] || 0) + 1;
  }
  const failLevels = new Set(contract.audit?.fail_levels || ['error']);
  const blocking_count = issues.filter((issue) => failLevels.has(issue.level)).length;
  return {
    generated_at: new Date().toISOString(),
    contract: {
      id: contract.id,
      version: contract.version,
      path: path.relative(ROOT, CONTRACT_PATH),
    },
    proto_count: protos.length,
    issue_count: issues.length,
    blocking_count,
    by_level: byLevel,
    by_rule: Object.fromEntries(Object.entries(byRule).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
    by_file: Object.fromEntries(Object.entries(byFile).sort((a, b) => a[0].localeCompare(b[0]))),
  };
}

function levelRank(level) {
  return { error: 0, warning: 1, note: 2 }[level] ?? 3;
}

function renderHtml(report, contract) {
  const issueRows = report.issues.map((issue) => `
    <tr class="level-${esc(issue.level)}">
      <td><code>${esc(issue.id)}</code><div class="muted">${esc(issue.cid)}</div></td>
      <td>${esc(issue.method || issue.topic)}<div class="muted">${esc(issue.file)}</div></td>
      <td><span class="badge">${esc(issue.level)}</span><br><code>${esc(issue.check)}</code></td>
      <td>${esc(issue.section)}<br><code>${esc(issue.rule)}</code><div class="muted">${esc(issue.rule_title)}</div></td>
      <td>${esc(issue.message)}</td>
      <td><pre>${esc(issue.fragment)}</pre></td>
      <td>${esc(issue.suggestion)}</td>
    </tr>`).join('');

  const byRuleRows = Object.entries(report.summary.by_rule).map(([rule, count]) => `
    <tr><td><code>${esc(rule)}</code></td><td>${count}</td></tr>`).join('');

  const byFileRows = Object.entries(report.summary.by_file).map(([file, count]) => `
    <tr><td><code>${esc(file)}</code></td><td>${count}</td></tr>`).join('');

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Аудит контракта решений №13</title>
<style>
  body{margin:0;background:#f8fafc;color:#111827;font:15px/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  main{max-width:1500px;margin:0 auto;padding:28px 24px 48px}
  h1{margin:0 0 8px;font-size:28px;line-height:1.2}
  h2{margin:28px 0 10px;font-size:20px}
  .note{padding:12px 14px;border:1px solid #d8dee8;border-radius:8px;background:#fff;color:#475569}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin:18px 0}
  .card{padding:14px;border:1px solid #d8dee8;border-radius:8px;background:#fff}
  .num{font-size:28px;font-weight:700}
  table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #d8dee8}
  th,td{vertical-align:top;padding:9px 10px;border:1px solid #d8dee8}
  th{position:sticky;top:0;background:#eef2f7;text-align:left;z-index:1}
  code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.92em}
  pre{max-width:430px;max-height:150px;margin:0;overflow:auto;white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}
  .muted{color:#64748b;font-size:12px;margin-top:3px}
  .badge{display:inline-block;padding:2px 7px;border-radius:999px;background:#e2e8f0;font-size:12px;font-weight:650}
  .level-error .badge{background:#fee2e2;color:#991b1b}
  .level-warning .badge{background:#fef3c7;color:#92400e}
  .level-note .badge{background:#dbeafe;color:#1e40af}
</style>
</head>
<body>
<main>
  <h1>Аудит контракта решений №13</h1>
  <p class="note">
    Источник правил: <code>${esc(path.relative(ROOT, CONTRACT_PATH))}</code>,
    версия <code>${esc(contract.version)}</code>.
    Блокирующих нарушений: <b>${report.summary.blocking_count}</b>.
  </p>
  <div class="grid">
    <div class="card"><div class="muted">Прототипов</div><div class="num">${report.summary.proto_count}</div></div>
    <div class="card"><div class="muted">Срабатываний</div><div class="num">${report.summary.issue_count}</div></div>
    <div class="card"><div class="muted">Blocking</div><div class="num">${report.summary.blocking_count}</div></div>
    <div class="card"><div class="muted">Errors</div><div class="num">${report.summary.by_level.error || 0}</div></div>
    <div class="card"><div class="muted">Warnings</div><div class="num">${report.summary.by_level.warning || 0}</div></div>
    <div class="card"><div class="muted">Notes</div><div class="num">${report.summary.by_level.note || 0}</div></div>
  </div>

  <h2>Сводка по правилам</h2>
  <table><thead><tr><th>Правило контракта</th><th>Кол-во</th></tr></thead><tbody>${byRuleRows}</tbody></table>

  <h2>Сводка по файлам</h2>
  <table><thead><tr><th>Файл</th><th>Кол-во</th></tr></thead><tbody>${byFileRows}</tbody></table>

  <h2>Все срабатывания</h2>
  <table>
    <thead><tr><th>Задача</th><th>Метод</th><th>Проверка</th><th>Правило</th><th>Проблема</th><th>Фрагмент</th><th>Что проверить</th></tr></thead>
    <tbody>${issueRows || '<tr><td colspan="7">Срабатываний нет.</td></tr>'}</tbody>
  </table>
</main>
</body>
</html>`;
}

async function main() {
  const contract = await readJson(CONTRACT_PATH);
  const ruleById = flattenRules(contract);
  const { byCheck, integrityIssues } = checkIndex(contract, ruleById);
  const protos = await readAllProtos(contract);
  const issues = [...integrityIssues];

  for (const proto of protos) {
    issues.push(...auditProto(proto, proto.__file, byCheck, ruleById));
  }

  issues.sort((a, b) => (
    levelRank(a.level) - levelRank(b.level)
    || a.file.localeCompare(b.file)
    || a.id.localeCompare(b.id)
    || a.rule.localeCompare(b.rule)
  ));

  const report = {
    summary: summarize(issues, protos, contract),
    issues,
  };

  const outJson = path.join(ROOT, contract.audit?.report_json || 'reports/w13_1_fix/solution_contract_audit.json');
  const outHtml = path.join(ROOT, contract.audit?.report_html || 'reports/w13_1_fix/solution_contract_audit.html');
  await fs.mkdir(path.dirname(outJson), { recursive: true });
  await fs.mkdir(path.dirname(outHtml), { recursive: true });
  await fs.writeFile(outJson, JSON.stringify(report, null, 2) + '\n', 'utf8');
  await fs.writeFile(outHtml, renderHtml(report, contract), 'utf8');

  console.log(`[contract-check] contract=${path.relative(ROOT, CONTRACT_PATH)} version=${contract.version}`);
  console.log(`[contract-check] protos=${report.summary.proto_count} issues=${report.summary.issue_count} blocking=${report.summary.blocking_count}`);
  for (const [level, count] of Object.entries(report.summary.by_level)) {
    console.log(`  ${level}: ${count}`);
  }
  console.log(`[contract-check] wrote ${path.relative(ROOT, outJson)}`);
  console.log(`[contract-check] wrote ${path.relative(ROOT, outHtml)}`);

  if (report.summary.blocking_count > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
