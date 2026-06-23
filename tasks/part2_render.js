// tasks/part2_render.js
// W13.1-fix §5.2 — общий рендер части 2 (№13) для ВСЕХ поверхностей
// (тренажёр, список, уникальные прототипы, модалка/предпросмотр, рек-карточки).
//
// Принципы:
// - Часть 2 не автопроверяется; эталон по кнопке-тогглу, экранный (scoring — W13.2).
// - Весь DOM строится через createElement/textContent (БЕЗ innerHTML): LaTeX как текст
//   для MathJax, окружность отбора корней — как <img> (Решение 5 контракта, без safe_dom).
// - subtopic_id (13.trig.factor) — несущий; здесь только ОТОБРАЖЕНИЕ (слаг не показываем).
//
// Канонический renderer эталонных решений №13: контрактное оформление одно для preview,
// тренажёра, списка, уникальных прототипов и домашних работ.

import { toAbsUrl } from '../app/core/url_path.js?v=2026-06-23-9-075249';

// Порядок классов = как в аккордеоне = Тип 1/2/3.
const PART2_CLASS_ORDER = ['trig', 'log', 'exp'];
const PART2_CLASS_TITLE = {
  trig: 'Тригонометрические',
  log: 'Логарифмические',
  exp: 'Показательные',
};

function asset(p) {
  const s = String(p ?? '').trim();
  if (!s) return s;
  if (/^https?:\/\//i.test(s) || s.startsWith('//') || s.startsWith('data:')) return s;
  return toAbsUrl(s);
}

// ───────── определение части 2 ─────────
// id части 2 содержит буквенные сегменты (13.trig.factor / 13.log); часть 1 — чисто числовые.
export function isPart2Id(id) {
  return /[a-z]/i.test(String(id || ''));
}
export function isPart2Question(q) {
  return Number(q && q.part) === 2;
}
export function part2ClassKey(id) {
  return String(id || '').split('.')[1] || '';
}
export function part2ClassOrder() {
  return PART2_CLASS_ORDER.slice();
}
export function part2ClassTitle(key) {
  return PART2_CLASS_TITLE[key] || String(key || '');
}

// ───────── человекочитаемая подпись (без слага) ─────────
// id — несущий (13.trig.factor); opts.title — человеческое название из каталога/манифеста.
// Возвращает компоненты подписи; surface сам решает, что показать (методы + порядковые №).
export function part2Label(id, opts = {}) {
  const classKey = part2ClassKey(id);
  const idx = PART2_CLASS_ORDER.indexOf(classKey);
  const typeNo = idx >= 0 ? idx + 1 : 0;
  const className = PART2_CLASS_TITLE[classKey] || classKey;
  const methodTitle = String(opts.title || '').trim();
  const display = methodTitle || className;
  return { classKey, typeNo, className, methodTitle, display };
}

// ───────── низкоуровневые помощники ─────────
export function mkEl(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export function typesetEl(el) {
  if (!el || !window.MathJax) return Promise.resolve();
  try {
    if (window.MathJax.typesetPromise) return window.MathJax.typesetPromise([el]).catch(err => console.error(err));
    else if (window.MathJax.typeset) window.MathJax.typeset([el]);
  } catch (e) {
    console.error('MathJax error', e);
  }
  return Promise.resolve();
}

function normalizeDisplayTex(tex) {
  return String(tex || '')
    .replace(/\\tfrac\b/g, '\\frac')
    .replace(/\\dfrac\b/g, '\\frac');
}

function normTex(tex) {
  return String(tex || '')
    .replace(/\\tfrac\b/g, '\\frac')
    .replace(/\\dfrac\b/g, '\\frac')
    .replace(/\s+/g, '')
    .replace(/\\,/g, '')
    .replace(/\\quad/g, '')
    .replace(/\\left/g, '')
    .replace(/\\right/g, '');
}

function displayTex(tex) {
  const body = normalizeDisplayTex(tex).trim().replace(/^\\displaystyle\s+/, '');
  return `\\displaystyle ${body}`;
}

function displayInlineMath(html) {
  return String(html || '').replace(/\\\((.*?)\\\)/gs, (_, body) => `\\( ${displayTex(body)} \\)`);
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

function buildFormulaHint(step) {
  const box = mkEl('div', 'solution-formula-hint');
  const list = mkEl('div', 'solution-formula-hint-list');
  for (const item of formulaHintItems(step)) {
    if (!item || !item.tex) continue;
    const row = mkEl('div', 'solution-formula-hint-row');
    row.appendChild(mkEl('div', 'solution-formula-hint-tex', `\\[ ${displayTex(item.tex)} \\]`));
    list.appendChild(row);
  }
  box.appendChild(list);
  return box;
}

function buildFormulaHintGroup(steps) {
  const group = mkEl('div', 'solution-formula-hint-strip');
  for (const step of steps) group.appendChild(buildFormulaHint(step));
  return group;
}

function appendEtalonLine(parent, step, lineCls) {
  if (isFormulaHintStep(step)) parent.appendChild(buildFormulaHint(step));
  else parent.appendChild(mkEl('div', lineCls, `\\[ ${displayTex(step)} \\]`));
}

function appendEtalonLines(parent, steps, lineCls) {
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    if (!isFormulaHintStep(step)) {
      appendEtalonLine(parent, step, lineCls);
      continue;
    }
    const hints = [];
    while (i < steps.length && isFormulaHintStep(steps[i])) {
      hints.push(steps[i]);
      i += 1;
    }
    i -= 1;
    parent.appendChild(buildFormulaHintGroup(hints));
  }
}

// Stem части 2 содержит <br> между пунктами а) и б). textContent не интерпретирует HTML,
// поэтому делим по <br> на отдельные строки (нет литерального «<br>»). LaTeX — текстом для MathJax.
export function renderPart2Stem(el, stem) {
  if (!el) return;
  el.textContent = '';
  const lines = displayInlineMath(stem).split(/<br\s*\/?>/i);
  for (const line of lines) {
    el.appendChild(mkEl('div', 'q-line', line));
  }
}

// ───────── эталон ─────────
// solution = { steps[], gen_groups[{head, series[]}], below[], figure }; answer = { general[], roots[] }.
function lastMathStep(steps) {
  return [...(steps || [])].reverse().find(item => typeof item === 'string') || '';
}

function inlineMathList(items) {
  return (items || []).map(item => `\\( ${displayTex(item)} \\)`).join('; ');
}

function stripIntegerNote(tex) {
  return String(tex || '')
    .replace(/\\\s+/g, ' ')
    .replace(/(?:,|\s|\\quad|\\,|\\;|\\:)*\\?n\s*\\in\s*\\mathbb\{Z\}\s*$/g, '')
    .replace(/(?:,|\s|\\quad|\\,|\\;|\\:)+$/g, '')
    .trim();
}

function buildFamilyList(items) {
  const clean = (items || []).map(stripIntegerNote).filter(Boolean);
  if (!clean.length) return null;
  const wrap = mkEl('div', 'solution-family-list');
  clean.forEach((item) => {
    const unit = mkEl('span', 'solution-family-unit');
    unit.appendChild(document.createTextNode(`\\( ${displayTex(item)} \\),\u00a0\u00a0`));
    wrap.appendChild(unit);
  });
  wrap.appendChild(mkEl('span', 'solution-family-note', '\\( n \\in \\mathbb{Z} \\)'));
  return wrap;
}

function buildFamilyLines(items) {
  const clean = (items || []).map(stripIntegerNote).filter(Boolean);
  if (!clean.length) return null;
  const wrap = mkEl('div', 'solution-family-lines');
  clean.forEach((item, idx) => {
    const tail = idx === clean.length - 1 ? ',\u00a0\u00a0\\( n \\in \\mathbb{Z} \\)' : ',';
    wrap.appendChild(mkEl('div', 'solution-family-line', `\\( ${displayTex(item)} \\)${tail}`));
  });
  return wrap;
}

function buildVariantLines(items) {
  const clean = (items || []).filter(Boolean);
  if (!clean.length) return null;
  const wrap = mkEl('div', 'solution-variant-lines');
  for (let i = 0; i < clean.length; i += 1) {
    const item = clean[i];
    if (!isFormulaHintStep(item)) {
      wrap.appendChild(mkEl('div', 'solution-variant-line', `\\( ${displayTex(item)} \\)`));
      continue;
    }
    const hints = [];
    while (i < clean.length && isFormulaHintStep(clean[i])) {
      hints.push(clean[i]);
      i += 1;
    }
    i -= 1;
    wrap.appendChild(buildFormulaHintGroup(hints));
  }
  return wrap;
}

function extractInterval(stem) {
  const text = String(stem || '');
  const m = text.match(/отрезку\s+\\\((.*?)\\\)/i);
  return m ? m[1] : '';
}

function sectionHead(mark, title) {
  const head = mkEl('h4', 'part2-section-head');
  head.appendChild(mkEl('span', 'part2-section-mark', mark));
  head.appendChild(document.createTextNode(' '));
  head.appendChild(mkEl('span', 'part2-section-title', title));
  return head;
}

export function normalizePart2SolutionLayout(root = document) {
  const scope = root || document;
  scope.querySelectorAll?.('.solution-simple-item').forEach(item => {
    item.style.paddingTop = '';
  });

  scope.querySelectorAll?.('.solution-simple-list').forEach(list => {
    const rows = [];
    for (const item of list.querySelectorAll('.solution-simple-item')) {
      const top = Math.round(item.getBoundingClientRect().top);
      let row = rows.find(candidate => Math.abs(candidate.top - top) <= 4);
      if (!row) {
        row = { top, items: [] };
        rows.push(row);
      }
      row.items.push(item);
    }

    for (const row of rows) {
      if (row.items.length < 2) continue;
      const metrics = row.items.map(item => {
        const math = item.querySelector('.solution-simple-equation mjx-container');
        if (!math) return null;
        const itemTop = item.getBoundingClientRect().top;
        const mathTop = math.getBoundingClientRect().top;
        return { item, offset: mathTop - itemTop };
      }).filter(Boolean);
      const maxOffset = Math.max(0, ...metrics.map(entry => entry.offset));
      metrics.forEach(({ item, offset }) => {
        const shift = Math.max(0, maxOffset - offset);
        item.style.paddingTop = shift > 0.5 ? `${shift.toFixed(1)}px` : '';
      });
    }
  });
}

let normalizeTimer = null;
if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => {
    clearTimeout(normalizeTimer);
    normalizeTimer = setTimeout(() => normalizePart2SolutionLayout(document), 120);
  });
}

export function buildPart2EtalonContent(solution, answer, opts = {}) {
  const sol = solution || {};
  const ans = answer || {};
  const outer = mkEl('div', 'part2-etalon-inner');
  const wrap = mkEl('div', 'part2-solution-card');

  const partA = mkEl('section', 'part2-solution-section');
  partA.appendChild(sectionHead('а)', 'Преобразуем исходное уравнение:'));
  if (Array.isArray(sol.steps) && sol.steps.length) {
    const steps = mkEl('div', 'solution-steps');
    appendEtalonLines(steps, sol.steps, 'solution-line');
    partA.appendChild(steps);
  }
  if (Array.isArray(sol.gen_groups) && sol.gen_groups.length) {
    if (sol.gen_groups.length === 1) {
      const group = sol.gen_groups[0];
      const lastStep = Array.isArray(sol.steps) ? lastMathStep(sol.steps) : '';
      const duplicateHead = group.head && normTex(group.head) === normTex(lastStep);
      const single = mkEl('div', 'solution-single-simple');
      if (group.head && !duplicateHead) single.appendChild(mkEl('div', 'solution-simple-equation', `\\( ${displayTex(group.head)} \\)`));
      const variantLines = buildVariantLines(group.steps || []);
      if (variantLines) single.appendChild(variantLines);
      const series = buildFamilyLines(group.series || []);
      if (series) single.appendChild(series);
      partA.appendChild(single);
    } else {
      const list = mkEl('div', 'solution-simple-list');
      sol.gen_groups.forEach((group, idx) => {
        const item = mkEl('div', 'solution-simple-item');
        item.appendChild(mkEl('span', 'solution-simple-number', `${idx + 1})`));
        const body = mkEl('div', 'solution-simple-body');
        if (group.head) body.appendChild(mkEl('div', 'solution-simple-equation', `\\( ${displayTex(group.head)} \\)`));
        const variantLines = buildVariantLines(group.steps || []);
        if (variantLines) body.appendChild(variantLines);
        const series = buildFamilyLines(group.series || []);
        if (series) body.appendChild(series);
        item.appendChild(body);
        list.appendChild(item);
      });
      partA.appendChild(list);
    }
  }
  wrap.appendChild(partA);

  const partB = mkEl('section', 'part2-solution-section');
  const interval = extractInterval(opts.stem || '');
  partB.appendChild(sectionHead('б)', interval
    ? `Отберем корни с помощью тригонометрической окружности на отрезке \\( ${displayTex(interval)} \\):`
    : 'Отберем корни с помощью тригонометрической окружности:'));

  if (sol.figure) {
    const sec = mkEl('div', 'solution-figure');
    const img = mkEl('img');
    img.alt = 'Окружность отбора корней';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.src = asset(sol.figure);
    sec.appendChild(img);
    sec.appendChild(mkEl('div', 'solution-figure-caption', 'Отмечаем подходящие корни на окружности'));
    partB.appendChild(sec);
  }

  if (Array.isArray(sol.below) && sol.below.length) {
    const roots = mkEl('div', 'solution-roots');
    sol.below.forEach(line => roots.appendChild(mkEl('div', 'solution-line', `\\[ ${displayTex(line)} \\]`)));
    partB.appendChild(roots);
  }

  const hasGeneral = Array.isArray(ans.general) && ans.general.length;
  const hasRoots = Array.isArray(ans.roots) && ans.roots.length;
  if (hasGeneral || hasRoots) {
    const sec = mkEl('div', 'solution-answer');
    sec.appendChild(mkEl('div', 'solution-answer-title', 'Ответ:'));
    if (hasGeneral) {
      const row = mkEl('div', 'solution-answer-row');
      row.appendChild(document.createTextNode('а) '));
      const families = buildFamilyList(ans.general);
      if (families) row.appendChild(families);
      sec.appendChild(row);
    }
    if (hasRoots) sec.appendChild(mkEl('div', 'solution-answer-row', `б) ${inlineMathList(ans.roots)}`));
    partB.appendChild(sec);
  }

  wrap.appendChild(partB);
  outer.appendChild(wrap);
  return outer;
}

// Самодостаточный блок: кнопка-тоггл + панель эталона (лениво наполняется и типсетится).
// По умолчанию свёрнут. Используется в тренажёре, списке и уникальных прототипах.
export function buildPart2EtalonBlock(solution, answer, opts = {}) {
  const box = mkEl('div', 'part2-box');
  const btn = mkEl('button', 'btn part2-etalon-btn', 'Показать решение');
  btn.type = 'button';
  const panel = mkEl('div', 'part2-etalon');
  panel.hidden = true;
  let rendered = false;
  btn.addEventListener('click', async () => {
    if (!rendered) {
      panel.appendChild(buildPart2EtalonContent(solution, answer, opts));
      rendered = true;
      await typesetEl(panel);
      normalizePart2SolutionLayout(panel);
    }
    panel.hidden = !panel.hidden;
    if (!panel.hidden) normalizePart2SolutionLayout(panel);
    btn.textContent = panel.hidden ? 'Показать решение' : 'Скрыть решение';
  });
  box.appendChild(btn);
  box.appendChild(panel);
  return box;
}

// ───────── самооценка ученика 0/1/2 (W13.2b) ─────────
// Контрол после эталона: ученик сравнивает своё решение с эталоном и ставит предварительный балл.
// Запись делает onSave(score) (его проводит вызывающий экран — провайдер RPC). part2_render остаётся
// провайдер-независимым. savedScore — уже сохранённая самооценка (подсветить), если известна.
export function buildPart2SelfScore({ savedScore = null, onSave } = {}) {
  const box = mkEl('div', 'part2-selfscore');
  box.appendChild(mkEl('span', 'part2-selfscore-label', 'Ваша самооценка:'));
  const status = mkEl('span', 'part2-selfscore-status');
  const btns = [0, 1, 2].map((n) => {
    const b = mkEl('button', 'part2-selfscore-btn', String(n));
    b.type = 'button';
    if (Number(savedScore) === n) b.classList.add('is-selected');
    b.addEventListener('click', async () => {
      box.querySelectorAll('.part2-selfscore-btn').forEach((x) => x.classList.remove('is-selected'));
      b.classList.add('is-selected');
      status.textContent = 'Сохранение…';
      try {
        if (onSave) await onSave(n);
        status.textContent = 'Сохранено';
      } catch (e) {
        status.textContent = 'Не сохранилось';
        console.error('part2 self-score save failed', e);
      }
    });
    return b;
  });
  btns.forEach((b) => box.appendChild(b));
  box.appendChild(status);
  return box;
}
