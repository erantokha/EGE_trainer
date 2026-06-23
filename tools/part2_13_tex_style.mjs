// Shared TeX style helpers for №13 part-2 solutions.
// The contract requires canonical round delimiters: \bigl(...\bigr).

const OPEN_COMMANDS = ['\\bigl', '\\Bigl', '\\biggl', '\\Biggl', '\\left'];
const CLOSE_COMMANDS = ['\\bigr', '\\Bigr', '\\biggr', '\\Biggr', '\\right'];

function hasCommandBefore(tex, pos, commands) {
  return commands.some((command) => tex.slice(Math.max(0, pos - command.length), pos) === command);
}

export function normalizeRoundParensInTex(tex) {
  let source = String(tex ?? '')
    .replace(/\\tfrac\b/g, '\\frac')
    .replace(/\\dfrac\b/g, '\\frac')
    .replace(/(\\(?:sin|cos)(?:\^2)?)\\!\s*/g, '$1')
    .replace(/\\(?:left|bigl|Bigl|biggl|Biggl)\s*\(/g, '\\bigl(')
    .replace(/\\(?:right|bigr|Bigr|biggr|Biggr)\s*\)/g, '\\bigr)');

  let out = '';
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '(' && !hasCommandBefore(source, i, OPEN_COMMANDS)) {
      out += '\\bigl(';
    } else if (ch === ')' && !hasCommandBefore(source, i, CLOSE_COMMANDS)) {
      out += '\\bigr)';
    } else {
      out += ch;
    }
  }
  return out;
}

export function normalizeStemRoundParens(stem) {
  return String(stem ?? '').replace(/\\\((.*?)\\\)/gs, (_, body) => (
    `\\(${normalizeRoundParensInTex(body)}\\)`
  ));
}

function normalizeStringArray(arr) {
  if (!Array.isArray(arr)) return false;
  let changed = false;
  for (let i = 0; i < arr.length; i++) {
    if (typeof arr[i] !== 'string') continue;
    const next = normalizeRoundParensInTex(arr[i]);
    if (next !== arr[i]) {
      arr[i] = next;
      changed = true;
    }
  }
  return changed;
}

function normalizeStepArray(arr) {
  if (!Array.isArray(arr)) return false;
  let changed = normalizeStringArray(arr);
  for (const step of arr) {
    if (!step || typeof step !== 'object') continue;
    if (step.kind !== 'formula_hint') continue;
    const formulas = Array.isArray(step.formulas)
      ? step.formulas
      : (typeof step.tex === 'string' ? [{ tex: step.tex }] : []);
    for (const formula of formulas) {
      if (!formula || typeof formula.tex !== 'string') continue;
      const nextTex = normalizeRoundParensInTex(formula.tex);
      if (nextTex !== formula.tex) {
        formula.tex = nextTex;
        changed = true;
      }
    }
  }
  return changed;
}

export function normalizeProtoTexStyle(proto) {
  if (!proto || typeof proto !== 'object') return false;
  let changed = false;

  if (typeof proto.stem === 'string') {
    const nextStem = normalizeStemRoundParens(proto.stem);
    if (nextStem !== proto.stem) {
      proto.stem = nextStem;
      changed = true;
    }
  }

  const sol = proto.solution || {};
  changed = normalizeStepArray(sol.steps) || changed;
  changed = normalizeStringArray(sol.below) || changed;
  for (const group of sol.gen_groups || []) {
    if (typeof group.head === 'string') {
      const nextHead = normalizeRoundParensInTex(group.head);
      if (nextHead !== group.head) {
        group.head = nextHead;
        changed = true;
      }
    }
    changed = normalizeStepArray(group.steps) || changed;
    changed = normalizeStringArray(group.series) || changed;
  }

  const ans = proto.answer || {};
  changed = normalizeStringArray(ans.general) || changed;
  changed = normalizeStringArray(ans.roots) || changed;

  return changed;
}

export function collectProtoTexEntries(proto) {
  const entries = [];
  if (!proto || typeof proto !== 'object') return entries;

  if (typeof proto.stem === 'string') {
    let idx = 0;
    String(proto.stem).replace(/\\\((.*?)\\\)/gs, (_, body) => {
      entries.push({ path: `stem.math[${idx}]`, tex: body });
      idx += 1;
      return _;
    });
  }

  const addArray = (label, arr) => {
    if (!Array.isArray(arr)) return;
    arr.forEach((tex, idx) => {
      if (typeof tex === 'string') entries.push({ path: `${label}[${idx}]`, tex });
      else if (tex && typeof tex === 'object' && tex.kind === 'formula_hint') {
        const formulas = Array.isArray(tex.formulas)
          ? tex.formulas
          : (typeof tex.tex === 'string' ? [{ tex: tex.tex }] : []);
        formulas.forEach((formula, formulaIdx) => {
          if (typeof formula?.tex === 'string') {
            entries.push({ path: `${label}[${idx}].formulas[${formulaIdx}].tex`, tex: formula.tex });
          }
        });
      }
    });
  };

  const sol = proto.solution || {};
  addArray('solution.steps', sol.steps);
  addArray('solution.below', sol.below);
  (sol.gen_groups || []).forEach((group, groupIdx) => {
    if (typeof group.head === 'string') entries.push({ path: `solution.gen_groups[${groupIdx}].head`, tex: group.head });
    addArray(`solution.gen_groups[${groupIdx}].steps`, group.steps);
    addArray(`solution.gen_groups[${groupIdx}].series`, group.series);
  });

  const ans = proto.answer || {};
  addArray('answer.general', ans.general);
  addArray('answer.roots', ans.roots);

  return entries;
}

function hasPlainRoundParen(tex) {
  const source = String(tex ?? '');
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '(' && !hasCommandBefore(source, i, OPEN_COMMANDS)) return true;
    if (ch === ')' && !hasCommandBefore(source, i, CLOSE_COMMANDS)) return true;
  }
  return false;
}

export function findRoundParenStyleIssues(proto) {
  const issues = [];
  for (const entry of collectProtoTexEntries(proto)) {
    const tex = String(entry.tex ?? '');
    const usesAuto = /\\(?:left|right)\s*[()]/.test(tex);
    const usesNonCanonical = /\\(?:Bigl|Bigr|biggl|biggr|Biggl|Biggr)\s*[()]/.test(tex);
    const usesPlain = hasPlainRoundParen(tex);
    if (usesAuto || usesNonCanonical || usesPlain) {
      issues.push({
        path: entry.path,
        tex,
        reasons: [
          usesAuto ? 'auto-left-right' : '',
          usesNonCanonical ? 'non-canonical-size' : '',
          usesPlain ? 'plain-round-paren' : '',
        ].filter(Boolean),
      });
    }
  }
  return issues;
}
