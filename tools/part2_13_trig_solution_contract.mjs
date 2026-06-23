// Shared №13 trigonometric solution contract.
// Keep human-facing rules, batch scripts, and audit checks aligned.

export const COS_PM_RULES = [
  {
    id: 'cos.pm.pi_over_6',
    pair: [
      'x = \\frac{\\pi}{6} + 2\\pi n',
      'x = \\frac{11\\pi}{6} + 2\\pi n',
    ],
    aliases: [[
      'x = - \\frac{\\pi}{6} + 2\\pi n',
      'x = \\frac{\\pi}{6} + 2\\pi n',
    ]],
    replacement: 'x = \\pm \\frac{\\pi}{6} + 2\\pi n',
    replacementAnswer: 'x = \\pm \\frac{\\pi}{6} + 2\\pi n,\\ n \\in \\mathbb{Z}',
  },
  {
    id: 'cos.pm.pi_over_4',
    pair: [
      'x = \\frac{\\pi}{4} + 2\\pi n',
      'x = \\frac{7\\pi}{4} + 2\\pi n',
    ],
    aliases: [[
      'x = - \\frac{\\pi}{4} + 2\\pi n',
      'x = \\frac{\\pi}{4} + 2\\pi n',
    ]],
    replacement: 'x = \\pm \\frac{\\pi}{4} + 2\\pi n',
    replacementAnswer: 'x = \\pm \\frac{\\pi}{4} + 2\\pi n,\\ n \\in \\mathbb{Z}',
  },
  {
    id: 'cos.pm.pi_over_3',
    pair: [
      'x = \\frac{\\pi}{3} + 2\\pi n',
      'x = \\frac{5\\pi}{3} + 2\\pi n',
    ],
    aliases: [[
      'x = - \\frac{\\pi}{3} + 2\\pi n',
      'x = \\frac{\\pi}{3} + 2\\pi n',
    ]],
    replacement: 'x = \\pm \\frac{\\pi}{3} + 2\\pi n',
    replacementAnswer: 'x = \\pm \\frac{\\pi}{3} + 2\\pi n,\\ n \\in \\mathbb{Z}',
  },
  {
    id: 'cos.pm.two_pi_over_3',
    pair: [
      'x = \\frac{2\\pi}{3} + 2\\pi n',
      'x = \\frac{4\\pi}{3} + 2\\pi n',
    ],
    aliases: [[
      'x = - \\frac{2\\pi}{3} + 2\\pi n',
      'x = \\frac{2\\pi}{3} + 2\\pi n',
    ]],
    replacement: 'x = \\pm \\frac{2\\pi}{3} + 2\\pi n',
    replacementAnswer: 'x = \\pm \\frac{2\\pi}{3} + 2\\pi n,\\ n \\in \\mathbb{Z}',
  },
  {
    id: 'cos.pm.three_pi_over_4',
    pair: [
      'x = \\frac{3\\pi}{4} + 2\\pi n',
      'x = \\frac{5\\pi}{4} + 2\\pi n',
    ],
    aliases: [[
      'x = - \\frac{3\\pi}{4} + 2\\pi n',
      'x = \\frac{3\\pi}{4} + 2\\pi n',
    ]],
    replacement: 'x = \\pm \\frac{3\\pi}{4} + 2\\pi n',
    replacementAnswer: 'x = \\pm \\frac{3\\pi}{4} + 2\\pi n,\\ n \\in \\mathbb{Z}',
  },
  {
    id: 'cos.pm.five_pi_over_6',
    pair: [
      'x = \\frac{5\\pi}{6} + 2\\pi n',
      'x = \\frac{7\\pi}{6} + 2\\pi n',
    ],
    aliases: [[
      'x = - \\frac{5\\pi}{6} + 2\\pi n',
      'x = \\frac{5\\pi}{6} + 2\\pi n',
    ]],
    replacement: 'x = \\pm \\frac{5\\pi}{6} + 2\\pi n',
    replacementAnswer: 'x = \\pm \\frac{5\\pi}{6} + 2\\pi n,\\ n \\in \\mathbb{Z}',
  },
];

export function normTex(s) {
  return String(s ?? '')
    .replace(/\\tfrac\b/g, '\\frac')
    .replace(/\\dfrac\b/g, '\\frac')
    .replace(/\s+/g, '')
    .replace(/\\,/g, '')
    .replace(/\\quad/g, '')
    .replace(/\\left/g, '')
    .replace(/\\right/g, '');
}

function comparableTex(s) {
  return normTex(s)
    .replace(/,?\\?n\\in\\mathbb\{Z\}$/, '')
    .replace(/,+$/, '');
}

function indexOfTex(arr, tex) {
  const target = comparableTex(tex);
  return arr.findIndex((item) => comparableTex(item) === target);
}

function hasTex(arr, tex) {
  return indexOfTex(arr, tex) >= 0;
}

function replacementForItems(rule, items) {
  return items.some((item) => /\\in\s*\\mathbb\{Z\}/.test(String(item)))
    ? rule.replacementAnswer
    : rule.replacement;
}

export function groupHasCosEvidence(group) {
  const source = [
    group?.head || '',
    ...(Array.isArray(group?.steps) ? group.steps : []),
  ].join(' ');
  return /\\cos\s*x\s*=|\\cos\s*x\s*[+-]|\\cos\s*x\\left|\\left.*\\cos\s*x/.test(source);
}

export function identifyCosPmRuleInItems(items, ruleIds = null) {
  if (!Array.isArray(items)) return null;
  const allowed = ruleIds ? new Set(ruleIds) : null;
  for (const rule of COS_PM_RULES) {
    if (allowed && !allowed.has(rule.id)) continue;
    if (hasTex(items, rule.replacement) || hasTex(items, rule.replacementAnswer)) return rule;
    if (hasTex(items, rule.pair[0]) && hasTex(items, rule.pair[1])) return rule;
  }
  return null;
}

export function findCosSplitPair(items, ruleIds = null) {
  if (!Array.isArray(items)) return null;
  const allowed = ruleIds ? new Set(ruleIds) : null;
  for (const rule of COS_PM_RULES) {
    if (allowed && !allowed.has(rule.id)) continue;
    for (const pair of [rule.pair, ...(rule.aliases || [])]) {
      const first = indexOfTex(items, pair[0]);
      const second = indexOfTex(items, pair[1]);
      if (first >= 0 && second >= 0) {
        return {
          rule,
          indices: [first, second],
          replacement: replacementForItems(rule, items),
        };
      }
    }
  }
  return null;
}

export function normalizeCosPmItems(items, ruleIds = null) {
  if (!Array.isArray(items)) return false;
  let changed = false;
  let split;
  while ((split = findCosSplitPair(items, ruleIds))) {
    const [first, second] = split.indices;
    for (const idx of [...split.indices].sort((a, b) => b - a)) items.splice(idx, 1);
    items.splice(Math.min(first, second), 0, split.replacement);
    changed = true;
  }
  return changed;
}

export function normalizeCosPmInProto(proto) {
  if (!proto?.solution || !proto?.answer) return false;
  const applicableRuleIds = new Set();
  let changed = false;

  for (const group of proto.solution.gen_groups || []) {
    if (!groupHasCosEvidence(group)) continue;
    const rule = identifyCosPmRuleInItems(group.series || []);
    if (rule) applicableRuleIds.add(rule.id);
    changed = normalizeCosPmItems(group.series || []) || changed;
    const afterRule = identifyCosPmRuleInItems(group.series || []);
    if (afterRule) applicableRuleIds.add(afterRule.id);
  }

  if (applicableRuleIds.size) {
    changed = normalizeCosPmItems(proto.answer.general || [], applicableRuleIds) || changed;
  }

  return changed;
}
