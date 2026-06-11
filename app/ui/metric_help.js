// app/ui/metric_help.js
// Подсказки к ключевым метрикам: единый словарь + tap/hover-tooltip (мобайл и десктоп)
// + раскрывающийся блок-легенда «Что означают показатели?».
// Тексты одинаковы по смыслу на ученических и учительских экранах.

export const METRIC_HELP = {
  coverage:   { label: 'Покрытие',          text: 'Сколько типов заданий по теме ученик уже решал хотя бы один раз.' },
  form:       { label: 'Форма',             text: 'Результаты по последним попыткам. Помогает понять, как ученик решает тему сейчас, а не за всё время.' },
  prototype:  { label: 'Прототип',          text: 'Типовая модель задания ЕГЭ. Внутри одной темы может быть несколько прототипов с разными способами решения.' },
  weak:       { label: 'Слабая тема',       text: 'Тема или прототип, где низкая точность или мало успешных попыток.' },
  stale:      { label: 'Давно не решал',    text: 'Ученик давно не возвращался к этой теме или прототипу — стоит повторить.' },
  unstable:   { label: 'Нестабильно',       text: 'Есть и верные, и неверные решения: результат пока не закрепился.' },
  accuracy:   { label: 'Точность',          text: 'Доля верных решений среди попыток по этой теме, подтеме или прототипу.' },
  forecast:   { label: 'Прогноз ЕГЭ',       text: 'Оценка ожидаемого результата на основе текущей статистики в тренажёре. Это не официальный результат, а ориентир для подготовки.' },
  primary:    { label: 'Первичный балл',    text: 'Балл за задания до перевода в тестовую шкалу ЕГЭ.' },
  secondary:  { label: 'Вторичный балл',    text: 'Итоговый балл по 100-балльной шкале после перевода первичных баллов.' },
};

let STYLES_DONE = false;
function injectStyles() {
  if (STYLES_DONE) return;
  STYLES_DONE = true;
  const css = `
.mh-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 15px; height: 15px; margin-left: 4px; border-radius: 50%;
  border: 1px solid var(--border, #cbd5e1); color: var(--text-dim, #64748b);
  font-size: 10px; font-weight: 700; line-height: 1; cursor: help; user-select: none;
  vertical-align: middle; background: transparent; flex: none;
}
.mh-icon:hover { color: var(--text, #0f172a); border-color: var(--text-dim, #94a3b8); }
.mh-pop {
  position: fixed; z-index: 100060; max-width: 260px;
  background: var(--panel, #fff); color: var(--text, #0f172a);
  border: 1px solid var(--border, #e2e8f0); border-radius: 10px;
  box-shadow: 0 10px 30px rgba(15,23,42,.18); padding: 10px 12px;
  font-size: 12.5px; line-height: 1.45; font-weight: 400;
}
.mh-pop-title { font-weight: 700; margin-bottom: 3px; }
.mh-legend { margin-top: 10px; }
.mh-legend summary {
  cursor: pointer; font-size: 13px; color: #2563eb; list-style: none;
  display: inline-flex; align-items: center; gap: 4px;
}
.mh-legend summary::-webkit-details-marker { display: none; }
.mh-legend[open] summary { margin-bottom: 8px; }
.mh-legend-body {
  border: 1px solid var(--border, #e2e8f0); border-radius: 10px;
  padding: 10px 12px; background: var(--panel-2, #f8fafc); font-size: 12.5px; line-height: 1.5;
}
.mh-legend-body .mh-row { margin: 4px 0; }
.mh-legend-body b { font-weight: 600; }
`;
  const el = document.createElement('style');
  el.id = 'mh-styles';
  el.textContent = css;
  document.head.appendChild(el);
}

let activePop = null;
function closePop() {
  if (activePop) { activePop.remove(); activePop = null; }
}
function openPop(anchor, key) {
  closePop();
  const info = METRIC_HELP[key];
  if (!info) return;
  const pop = document.createElement('div');
  pop.className = 'mh-pop';
  pop.setAttribute('role', 'tooltip');
  const t = document.createElement('div');
  t.className = 'mh-pop-title';
  t.textContent = info.label;
  const b = document.createElement('div');
  b.textContent = info.text;
  pop.appendChild(t);
  pop.appendChild(b);
  document.body.appendChild(pop);

  // позиционирование: под иконкой, с корректировкой, чтобы не выходить за экран
  const r = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  let left = r.left;
  let top = r.bottom + 6;
  if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
  if (left < 8) left = 8;
  if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
  pop.style.left = left + 'px';
  pop.style.top = top + 'px';
  activePop = pop;
}

// Закрытие по клику вне/скроллу/Esc
function wireGlobalClose() {
  if (wireGlobalClose._done) return;
  wireGlobalClose._done = true;
  document.addEventListener('click', (e) => {
    if (activePop && !e.target.closest('.mh-icon') && !e.target.closest('.mh-pop')) closePop();
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePop(); });
  window.addEventListener('scroll', () => closePop(), true);
  window.addEventListener('resize', () => closePop());
}

/** Создаёт «?»-иконку подсказки для метрики. */
export function helpIcon(key) {
  injectStyles();
  wireGlobalClose();
  const info = METRIC_HELP[key];
  const b = document.createElement('span');
  b.className = 'mh-icon';
  b.textContent = '?';
  b.setAttribute('role', 'button');
  b.setAttribute('tabindex', '0');
  b.setAttribute('aria-label', `Что такое «${info?.label || key}»`);
  if (info?.text) b.title = info.text; // десктоп-фолбэк (нативный hover)
  const toggle = (e) => {
    e.preventDefault(); e.stopPropagation();
    if (activePop) closePop(); else openPop(b, key);
  };
  b.addEventListener('click', toggle);
  b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') toggle(e); });
  return b;
}

/** Добавляет «?»-иконки ко всем элементам с data-help="key" в пределах root. */
export function applyMetricHelp(root = document) {
  const els = root.querySelectorAll('[data-help]:not([data-help-wired])');
  els.forEach((el) => {
    const key = el.getAttribute('data-help');
    if (!METRIC_HELP[key]) return;
    el.setAttribute('data-help-wired', '1');
    el.appendChild(helpIcon(key));
  });
}

/**
 * Возвращает <details>-легенду «Что означают показатели?» с выбранными метриками.
 * @param {string[]} keys
 */
export function buildLegend(keys) {
  injectStyles();
  const det = document.createElement('details');
  det.className = 'mh-legend';
  const sum = document.createElement('summary');
  sum.textContent = 'Что означают показатели?';
  det.appendChild(sum);
  const body = document.createElement('div');
  body.className = 'mh-legend-body';
  for (const k of keys) {
    const info = METRIC_HELP[k];
    if (!info) continue;
    const row = document.createElement('div');
    row.className = 'mh-row';
    const b = document.createElement('b');
    b.textContent = info.label + ' — ';
    row.appendChild(b);
    row.appendChild(document.createTextNode(info.text));
    body.appendChild(row);
  }
  det.appendChild(body);
  return det;
}
