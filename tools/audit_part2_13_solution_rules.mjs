// Audit №13 solution JSON against the draft solution-style rules.
// Writes machine-readable JSON and a human-readable HTML report.

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  findCosSplitPair,
  groupHasCosEvidence,
  identifyCosPmRuleInItems,
} from './part2_13_trig_solution_contract.mjs';

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'content/tasks/part2/13');
const OUT_DIR = path.join(ROOT, 'reports/w13_1_fix');
const OUT_JSON = path.join(OUT_DIR, 'solution_audit_report.json');
const OUT_HTML = path.join(OUT_DIR, 'solution_audit_report.html');

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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

function human(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

function hasTrigFunction(s) {
  return /\\(?:sin|cos|operatorname\{tg\}|tan)\b/.test(String(s ?? ''));
}

function isFormulaHintStep(step) {
  return !!step && typeof step === 'object' && step.kind === 'formula_hint';
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
  const n = norm(s);
  return /x=\\frac\{\\pi\}\{2\}\+2\\pin/.test(n);
}

function includesThreePiOver2TwoPi(s) {
  const n = norm(s);
  return /x=\\frac\{3\\pi\}\{2\}\+2\\pin/.test(n) || /x=\\frac\{3\*?\\pi\}\{2\}\+2\\pin/.test(n);
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
    return /=0$/.test(t) && (/\)\\left\(/.test(t) || /x\\left\(/.test(t) || /\)\(/.test(t));
  });
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

function addIssue(issues, proto, file, rule, severity, message, fragment, suggestion) {
  issues.push({
    id: proto.id,
    cid: proto.cid || '',
    file,
    topic: proto.__topic || '',
    method: proto.method || '',
    rule,
    severity,
    message,
    fragment: fragment || '',
    suggestion: suggestion || '',
  });
}

function auditProto(proto, file) {
  const issues = [];
  const sol = proto.solution || {};
  const ans = proto.answer || {};
  const steps = Array.isArray(sol.steps) ? mathSteps(sol.steps) : [];
  const groups = Array.isArray(sol.gen_groups) ? sol.gen_groups : [];
  const general = Array.isArray(ans.general) ? ans.general : [];
  const cosPmRuleIdsInGroups = new Set();

  for (const group of groups) {
    const head = group.head || '';
    const series = Array.isArray(group.series) ? group.series : [];
    const groupSteps = Array.isArray(group.steps) ? mathSteps(group.steps) : [];

    if (isCosZeroHead(head)) {
      const hasLongPair = series.some(includesPiOver2TwoPi) && series.some(includesThreePiOver2TwoPi);
      if (hasLongPair) {
        addIssue(
          issues,
          proto,
          file,
          'simple.cos.zero.short',
          'high',
          'cos x = 0 записан двумя семействами через 2πn.',
          `head: ${head}\nseries: ${series.join(' | ')}`,
          'Заменить на x = \\frac{\\pi}{2} + \\pi n.'
        );
      }
      if (!hasSingleCosZeroSeries(series) && !hasLongPair) {
        addIssue(
          issues,
          proto,
          file,
          'simple.cos.zero.review',
          'low',
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
          proto,
          file,
          'simple.sin.zero.review',
          'medium',
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
          proto,
          file,
          'simple.cos.nonzero.pm',
          'high',
          'cos x = a записан двумя симметричными семействами вместо формы через ±.',
          `head: ${head}\nsteps: ${groupSteps.join(' | ')}\nseries: ${series.join(' | ')}`,
          `Заменить пару на ${split.replacement}.`
        );
      }
    }

    if (isUnreducedTrigEquation(head) && groupSteps.length === 0) {
      addIssue(
        issues,
        proto,
        file,
        'simple.unreduced.head',
        'high',
        'В варианте осталось неприведённое простейшее уравнение без промежуточного шага.',
        `head: ${head}`,
        'Добавить group.steps с приведением, например sin x + 1/2 = 0 → sin x = -1/2.'
      );
    }
  }

  if (cosPmRuleIdsInGroups.size) {
    const split = findCosSplitPair(general, cosPmRuleIdsInGroups);
    if (split) {
      addIssue(
        issues,
        proto,
        file,
        'answer.cos.nonzero.split',
        'high',
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
          proto,
          file,
          'answer.cos.zero.long',
          'high',
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
      proto,
      file,
      'product.text.or',
      'medium',
      'В steps есть строка с «или». По новому стилю варианты должны быть в gen_groups.',
      steps.filter((s) => /\\text\{или\}|или/.test(String(s))).join('\n'),
      'Перенести разветвление в gen_groups: 1), 2), ...'
    );
  }

  if (hasProductStep(steps) && groups.length < 2 && proto.class === 'тригонометрическое') {
    addIssue(
      issues,
      proto,
      file,
      'product.no.variants',
      'medium',
      'Есть произведение, но меньше двух вариантов gen_groups.',
      steps.join('\n'),
      'Проверить, нужно ли оформить множители как варианты.'
    );
  }

  if (hasIncompleteSquare(steps) && mentionsSubstitution(steps)) {
    addIssue(
      issues,
      proto,
      file,
      'quadratic.incomplete.substitution',
      'high',
      'Похоже на неполный квадратный случай, но в steps есть замена.',
      steps.join('\n'),
      'Для sin²x=a или cos²x=a замену не вводим; извлекаем корень.'
    );
  }

  if (hasFactorableNoConstant(steps) && mentionsSubstitution(steps)) {
    addIssue(
      issues,
      proto,
      file,
      'quadratic.no.constant.substitution',
      'high',
      'Похоже на квадратное без свободного члена, но в steps есть замена.',
      steps.join('\n'),
      'Вынести sin x / cos x как общий множитель.'
    );
  }

  if (hasHalfAngleWithoutSubstitution(proto, steps)) {
    addIssue(
      issues,
      proto,
      file,
      'half.angle.no.substitution',
      'medium',
      'Есть аргумент x/2, но не видно замены α = x/2.',
      steps.join('\n'),
      'Ввести замену α = x/2, решить относительно α и вернуться к x = 2α.'
    );
  }

  if (hasCollapsedPerfectSquare(steps)) {
    addIssue(
      issues,
      proto,
      file,
      'quadratic.perfect.square.collapsed',
      'medium',
      'Квадратный множитель свёрнут в полный квадрат без решения через дискриминант.',
      steps.filter((s) => /\\right\)\^2|\)\^2/.test(String(s))).join('\n'),
      'Решить множитель как квадратное уравнение через t и D = 0.'
    );
  }

  if (hasPositiveImplicationShortcut(steps)) {
    addIssue(
      issues,
      proto,
      file,
      'product.positive.factor.shortcut',
      'medium',
      'До вариантов есть сокращающий переход через положительность множителя.',
      steps.filter((s) => />\s*0\s*\\Rightarrow|>\s*0\s*⇒/.test(String(s))).join('\n'),
      'После произведения рассмотреть каждый множитель отдельным вариантом.'
    );
  }

  if (hasAnswerRepeatedIntegerNote(general)) {
    addIssue(
      issues,
      proto,
      file,
      'answer.repeated.integer.note',
      'low',
      'В данных answer.general n∈Z повторяется в нескольких семействах.',
      general.join(' | '),
      'Рендер уже умеет показывать n∈Z один раз; решить, нужно ли нормализовать сами данные.'
    );
  }

  if (!steps.length && (proto.part === 2 || String(proto.id).startsWith('13.'))) {
    addIssue(
      issues,
      proto,
      file,
      'solution.no.steps',
      'medium',
      'У прототипа нет solution.steps.',
      '',
      'Проверить полноту эталона.'
    );
  }

  return issues;
}

async function readAllProtos() {
  const files = (await fs.readdir(SRC_DIR)).filter((f) => f.endsWith('.json')).sort();
  const protos = [];
  for (const file of files) {
    const full = path.join(SRC_DIR, file);
    const manifest = JSON.parse(await fs.readFile(full, 'utf8'));
    for (const type of manifest.types || []) {
      for (const proto of type.prototypes || []) {
        protos.push({ ...proto, __topic: manifest.topic || type.id || '', __file: file });
      }
    }
  }
  return protos;
}

function summarize(issues, protos) {
  const bySeverity = {};
  const byRule = {};
  const byFile = {};
  for (const issue of issues) {
    bySeverity[issue.severity] = (bySeverity[issue.severity] || 0) + 1;
    byRule[issue.rule] = (byRule[issue.rule] || 0) + 1;
    byFile[issue.file] = (byFile[issue.file] || 0) + 1;
  }
  return {
    generated_at: new Date().toISOString(),
    proto_count: protos.length,
    issue_count: issues.length,
    by_severity: bySeverity,
    by_rule: Object.fromEntries(Object.entries(byRule).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
    by_file: Object.fromEntries(Object.entries(byFile).sort((a, b) => a[0].localeCompare(b[0]))),
  };
}

function renderHtml(report) {
  const issueRows = report.issues.map((issue) => `
    <tr class="sev-${esc(issue.severity)}">
      <td><code>${esc(issue.id)}</code><div class="muted">${esc(issue.cid)}</div></td>
      <td>${esc(issue.method || issue.topic)}<div class="muted">${esc(issue.file)}</div></td>
      <td><span class="badge">${esc(issue.severity)}</span><br><code>${esc(issue.rule)}</code></td>
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
<title>Аудит решений №13</title>
<style>
  body{margin:0;background:#f8fafc;color:#111827;font:15px/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  main{max-width:1440px;margin:0 auto;padding:28px 24px 48px}
  h1{margin:0 0 8px;font-size:28px;line-height:1.2}
  h2{margin:28px 0 10px;font-size:20px}
  .note{padding:12px 14px;border:1px solid #d8dee8;border-radius:8px;background:#fff;color:#475569}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin:18px 0}
  .card{padding:14px;border:1px solid #d8dee8;border-radius:8px;background:#fff}
  .num{font-size:28px;font-weight:700}
  table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #d8dee8}
  th,td{vertical-align:top;padding:9px 10px;border:1px solid #d8dee8}
  th{position:sticky;top:0;background:#eef2f7;text-align:left;z-index:1}
  code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.92em}
  pre{max-width:420px;max-height:150px;margin:0;overflow:auto;white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}
  .muted{color:#64748b;font-size:12px;margin-top:3px}
  .badge{display:inline-block;padding:2px 7px;border-radius:999px;background:#e2e8f0;font-size:12px;font-weight:650}
  .sev-high .badge{background:#fee2e2;color:#991b1b}
  .sev-medium .badge{background:#fef3c7;color:#92400e}
  .sev-low .badge{background:#dbeafe;color:#1e40af}
</style>
</head>
<body>
<main>
  <h1>Аудит решений №13</h1>
  <p class="note">Первая версия эвристического аудита. Это карта мест для ревью, а не автоматический математический приговор. Источник: <code>content/tasks/part2/13/*.json</code>.</p>
  <div class="grid">
    <div class="card"><div class="muted">Прототипов</div><div class="num">${report.summary.proto_count}</div></div>
    <div class="card"><div class="muted">Срабатываний</div><div class="num">${report.summary.issue_count}</div></div>
    <div class="card"><div class="muted">High</div><div class="num">${report.summary.by_severity.high || 0}</div></div>
    <div class="card"><div class="muted">Medium</div><div class="num">${report.summary.by_severity.medium || 0}</div></div>
    <div class="card"><div class="muted">Low</div><div class="num">${report.summary.by_severity.low || 0}</div></div>
  </div>

  <h2>Сводка по правилам</h2>
  <table><thead><tr><th>Правило</th><th>Кол-во</th></tr></thead><tbody>${byRuleRows}</tbody></table>

  <h2>Сводка по файлам</h2>
  <table><thead><tr><th>Файл</th><th>Кол-во</th></tr></thead><tbody>${byFileRows}</tbody></table>

  <h2>Все срабатывания</h2>
  <table>
    <thead><tr><th>Задача</th><th>Метод</th><th>Правило</th><th>Проблема</th><th>Фрагмент</th><th>Что проверить</th></tr></thead>
    <tbody>${issueRows}</tbody>
  </table>
</main>
</body>
</html>`;
}

async function main() {
  const protos = await readAllProtos();
  const issues = [];
  for (const proto of protos) issues.push(...auditProto(proto, proto.__file));
  issues.sort((a, b) => (
    SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    || a.file.localeCompare(b.file)
    || a.id.localeCompare(b.id)
    || a.rule.localeCompare(b.rule)
  ));

  const report = {
    summary: summarize(issues, protos),
    issues,
  };

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(OUT_JSON, JSON.stringify(report, null, 2) + '\n', 'utf8');
  await fs.writeFile(OUT_HTML, renderHtml(report), 'utf8');

  console.log(`[part2-audit] protos=${report.summary.proto_count} issues=${report.summary.issue_count}`);
  for (const [severity, count] of Object.entries(report.summary.by_severity)) {
    console.log(`  ${severity}: ${count}`);
  }
  console.log(`[part2-audit] wrote ${path.relative(ROOT, OUT_JSON)}`);
  console.log(`[part2-audit] wrote ${path.relative(ROOT, OUT_HTML)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
