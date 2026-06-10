// app/ui/card_focus.js
// «Решать на белом листе» + зум задач во время рисовалки.
//
// 1) Фокус карточки: кнопка ⛶ на каждой .task-card. По клику всё, кроме УСЛОВИЯ задачи,
//    заливается белым (фикс-маска), в маске — КЛОН условия (.task-stem + прямой .task-fig)
//    ПО ЦЕНТРУ, по умолчанию 1.5×. Сверху авто-открывается рисовалка. Выход — красный ✕
//    в тулбаре рисовалки (закрытие рисовалки = выход из фокуса) или Esc.
// 2) Зум — ТОЛЬКО задачи: жесты (Ctrl/Cmd+колесо/пинч, клавиатура Cmd/Ctrl+=/+/−/_/0)
//    в фокусе масштабируют клон (--focus-zoom на маске), в ОБЫЧНОЙ рисовалке (без фокуса) —
//    #taskList (style.zoom). Браузерный зум гасим preventDefault, поэтому тулбар/сайдбар/шапка
//    НЕ масштабируются. Проверено: zoom #taskList увеличивает текст/фигуры/поле без гориз.
//    переполнения, остальное без изменений.
//
// Клон-подход надёжен: клон внутри фикс-маски → не зависит от stacking-context/скролла.

const ICON_FOCUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 1 2 2h3"/></svg>';
const FZMIN = 0.5, FZMAX = 3, TZMIN = 1, TZMAX = 3, FOCUS_START = 1.5;
const clampZ = (v, a, b) => Math.max(a, Math.min(b, Math.round(v * 100) / 100));

export function initCardFocus() {
  if (document.body.dataset.cardFocusWired === '1') return;
  document.body.dataset.cardFocusWired = '1';

  let mask = null, chrome = null, drawObs = null;
  let focusZoom = FOCUS_START, taskZoom = 1;

  // Контейнер задач для зума: #taskList (trainer/hw) | .task-list (list) | .uniq-list (unique) | #runner.
  const taskZoomTarget = () => document.getElementById('taskList') || document.querySelector('.task-list, .uniq-list') || document.getElementById('runner');
  const isFocus = () => document.body.classList.contains('dro-card-focus');
  const drawRoot = () => document.querySelector('.draw-overlay-root');
  const drawActive = () => { const r = drawRoot(); return !!(r && r.classList.contains('active')); };

  function applyFocusZoom() {
    if (mask) mask.style.setProperty('--focus-zoom', String(focusZoom));
    const v = chrome && chrome.querySelector('.dro-focus-zoom-val');
    if (v) v.textContent = Math.round(focusZoom * 100) + '%';
  }
  // Зум контейнера задач: фиксируем исходную ширину в px (иначе карточки width:100% переформатируются
  // на ту же ширину и фигуры НЕ растут), затем zoom масштабирует текст И картинки (с гориз.скроллом).
  function applyTaskZoom() {
    const tl = taskZoomTarget(); if (!tl) return;
    if (taskZoom === 1) { tl.style.zoom = ''; tl.style.width = ''; tl.style.marginLeft = ''; tl.style.marginRight = ''; delete tl.dataset.zw; return; }
    if (!tl.dataset.zw) tl.dataset.zw = String(Math.round(tl.getBoundingClientRect().width));
    const w = Number(tl.dataset.zw);
    tl.style.width = w + 'px';
    // центрируем зум (margin:auto зажимается в 0, когда шире контейнера → расти из ЦЕНТРА явным отступом).
    // рендер-сдвиг влево = w·(1−z)/2; margin в логических px (zoom умножит на z) → w·(1−z)/(2z).
    tl.style.marginLeft = (w * (1 - taskZoom) / (2 * taskZoom)) + 'px';
    tl.style.marginRight = '0';
    tl.style.zoom = String(taskZoom);
  }
  function setFocusZoom(z) { focusZoom = clampZ(z, FZMIN, FZMAX); applyFocusZoom(); }
  function setTaskZoom(z) { taskZoom = clampZ(z, TZMIN, TZMAX); applyTaskZoom(); }

  // жест зума → нужная цель (фокус-клон или #taskList)
  function zoomBy(delta) { if (isFocus()) setFocusZoom(focusZoom + delta); else if (drawActive()) setTaskZoom(taskZoom + delta); }
  function zoomReset() { if (isFocus()) setFocusZoom(FOCUS_START); else if (drawActive()) setTaskZoom(1); }

  // Закрытие рисовалки (✕) = выход из фокуса; и сброс зума задач.
  function ensureDrawObserver() {
    if (drawObs) return;
    const root = drawRoot();
    if (!root) return;
    drawObs = new MutationObserver(() => {
      if (!drawActive()) { setTaskZoom(1); if (isFocus()) exitFocus(); }
    });
    drawObs.observe(root, { attributes: true, attributeFilter: ['class'] });
  }

  function ensureChrome() {
    if (mask) return;
    mask = document.createElement('div');
    mask.className = 'dro-focus-mask';
    document.body.appendChild(mask);
    chrome = document.createElement('div');
    chrome.className = 'dro-focus-bar';
    chrome.innerHTML =
      `<span class="dro-focus-zoom">`
      + `<button type="button" data-zoom="out" aria-label="Уменьшить">−</button>`
      + `<span class="dro-focus-zoom-val">150%</span>`
      + `<button type="button" data-zoom="in" aria-label="Увеличить">+</button>`
      + `</span>`;
    document.body.appendChild(chrome);
    chrome.querySelector('[data-zoom="in"]').addEventListener('click', () => setFocusZoom(focusZoom + 0.25));
    chrome.querySelector('[data-zoom="out"]').addEventListener('click', () => setFocusZoom(focusZoom - 0.25));
  }

  function enterFocus(card) {
    if (!card) return;
    ensureChrome();
    const stem = card.querySelector('.task-stem, .ws-stem');
    const fig = card.querySelector(':scope > .task-fig, :scope > .ws-fig');
    const wrap = document.createElement('div');
    wrap.className = 'dro-focus-content';
    if (stem) wrap.appendChild(stem.cloneNode(true));
    if (fig) {
      const figClone = fig.cloneNode(true);
      // Размер «больших» фигур (vectors/derivatives) задаёт grid-колонка .ws-item/.task-card.
      // Вне этого контекста клон раздувается на всю ширину → фиксируем исходный рендер-размер.
      const fw = Math.round(fig.getBoundingClientRect().width);
      if (fw) figClone.style.width = fw + 'px';
      wrap.appendChild(figClone);
    }
    mask.innerHTML = '';
    mask.appendChild(wrap);
    setFocusZoom(FOCUS_START);                  // старт 1.5×
    document.body.classList.add('dro-card-focus');
    const db = document.getElementById('drawBtn');
    if (db && !drawActive()) db.click();         // авто-открыть рисовалку (если ещё не открыта)
    ensureDrawObserver();                         // ✕ рисовалки → выход из фокуса
  }

  function exitFocus() {
    if (!isFocus()) return;
    document.body.classList.remove('dro-card-focus');
    if (mask) mask.innerHTML = '';
    setTaskZoom(1);
  }

  // Кнопка фокуса на каждую карточку задачи (.task-card в trainer/list/hw, .ws-item в unique).
  function addButtons() {
    document.querySelectorAll('.task-card:not([data-focus-wired]), .ws-item:not([data-focus-wired])').forEach((card) => {
      card.dataset.focusWired = '1';
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'dro-card-focus-btn';
      b.title = 'Решать на белом листе';
      b.setAttribute('aria-label', 'Решать на белом листе');
      b.innerHTML = ICON_FOCUS;
      b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); enterFocus(card); });
      card.appendChild(b);
    });
  }
  const obs = new MutationObserver(() => addButtons());
  obs.observe(document.body, { childList: true, subtree: true });
  addButtons();

  // Перехват зум-жестов: в фокусе ИЛИ при активной рисовалке → зум ТОЛЬКО задач, не страницы.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (isFocus()) { e.stopPropagation(); const db = document.getElementById('drawBtn'); if (drawActive() && db) db.click(); else exitFocus(); }
      return;
    }
    if (!(isFocus() || (drawActive() && taskZoomTarget()))) return;   // без цели зума — не глушим браузерный зум
    if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+' || e.key === '-' || e.key === '_' || e.key === '0')) {
      e.preventDefault();
      ensureDrawObserver();
      if (e.key === '0') zoomReset();
      else if (e.key === '-' || e.key === '_') zoomBy(-0.1);
      else zoomBy(0.1);
    }
  }, { capture: true });
  window.addEventListener('wheel', (e) => {
    if (!(isFocus() || (drawActive() && taskZoomTarget()))) return;   // без цели зума — не глушим браузерный зум
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); ensureDrawObserver(); zoomBy(e.deltaY < 0 ? 0.1 : -0.1); }
  }, { passive: false, capture: true });
}
