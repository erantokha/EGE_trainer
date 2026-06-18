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
// Извлечено из tasks/trainer.js (W13.1) без изменения поведения.

import { toAbsUrl } from '../app/core/url_path.js?v=2026-06-18-16-215207';

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
  if (!el || !window.MathJax) return;
  try {
    if (window.MathJax.typesetPromise) window.MathJax.typesetPromise([el]).catch(err => console.error(err));
    else if (window.MathJax.typeset) window.MathJax.typeset([el]);
  } catch (e) {
    console.error('MathJax error', e);
  }
}

// Stem части 2 содержит <br> между пунктами а) и б). textContent не интерпретирует HTML,
// поэтому делим по <br> на отдельные строки (нет литерального «<br>»). LaTeX — текстом для MathJax.
export function renderPart2Stem(el, stem) {
  if (!el) return;
  el.textContent = '';
  const lines = String(stem || '').split(/<br\s*\/?>/i);
  for (const line of lines) {
    el.appendChild(mkEl('div', 'q-line', line));
  }
}

// ───────── эталон ─────────
// solution = { steps[], gen_groups[{head, series[]}], below[], figure }; answer = { general[], roots[] }.
export function buildPart2EtalonContent(solution, answer) {
  const sol = solution || {};
  const wrap = mkEl('div', 'part2-etalon-inner');

  const addSection = (title, lines, lineCls) => {
    if (!Array.isArray(lines) || !lines.length) return;
    const sec = mkEl('div', 'etalon-section');
    sec.appendChild(mkEl('h4', 'etalon-h', title));
    for (const ln of lines) sec.appendChild(mkEl('div', lineCls, `\\[ ${ln} \\]`));
    wrap.appendChild(sec);
  };

  // пошаговая цепочка преобразований
  addSection('Решение', sol.steps, 'etalon-step');

  // общее решение (столбиками)
  if (Array.isArray(sol.gen_groups) && sol.gen_groups.length) {
    const sec = mkEl('div', 'etalon-section');
    sec.appendChild(mkEl('h4', 'etalon-h', 'Общее решение'));
    for (const g of sol.gen_groups) {
      if (g && g.head) sec.appendChild(mkEl('div', 'etalon-genhead', `\\[ ${g.head} \\]`));
      for (const s of ((g && g.series) || [])) sec.appendChild(mkEl('div', 'etalon-series', `\\[ ${s} \\]`));
    }
    wrap.appendChild(sec);
  }

  // окружность отбора корней (SVG как <img>)
  if (sol.figure) {
    const sec = mkEl('div', 'etalon-section etalon-fig');
    const img = mkEl('img');
    img.alt = 'Окружность отбора корней';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.src = asset(sol.figure);
    sec.appendChild(img);
    wrap.appendChild(sec);
  }

  // разложение корней по опорным
  addSection('Отбор корней', sol.below, 'etalon-below');

  // ответ (а — общее решение, б — отобранные корни)
  const ans = answer || {};
  const hasGeneral = Array.isArray(ans.general) && ans.general.length;
  const hasRoots = Array.isArray(ans.roots) && ans.roots.length;
  if (hasGeneral || hasRoots) {
    const sec = mkEl('div', 'etalon-section etalon-answer');
    sec.appendChild(mkEl('h4', 'etalon-h', 'Ответ'));
    if (hasGeneral) sec.appendChild(mkEl('div', 'etalon-ans-line', 'а) ' + ans.general.map(g => `\\( ${g} \\)`).join(';\\quad ')));
    if (hasRoots) sec.appendChild(mkEl('div', 'etalon-ans-line', 'б) ' + ans.roots.map(r => `\\( ${r} \\)`).join(';\\quad ')));
    wrap.appendChild(sec);
  }

  return wrap;
}

// Самодостаточный блок: кнопка-тоггл + панель эталона (лениво наполняется и типсетится).
// По умолчанию свёрнут. Используется в тренажёре, списке и уникальных прототипах.
export function buildPart2EtalonBlock(solution, answer) {
  const box = mkEl('div', 'part2-box');
  const btn = mkEl('button', 'btn part2-etalon-btn', 'Показать эталон');
  btn.type = 'button';
  const panel = mkEl('div', 'part2-etalon');
  panel.hidden = true;
  let rendered = false;
  btn.addEventListener('click', () => {
    if (!rendered) {
      panel.appendChild(buildPart2EtalonContent(solution, answer));
      rendered = true;
      typesetEl(panel);
    }
    panel.hidden = !panel.hidden;
    btn.textContent = panel.hidden ? 'Показать эталон' : 'Скрыть эталон';
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
