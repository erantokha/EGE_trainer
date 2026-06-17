// app/ui/draw_overlay.js
// Эфемерная «рисовалка»-overlay поверх страницы (Zoom-style тулбар).
// Самодостаточный модуль: строит свой DOM/состояние лениво при первом включении,
// перо рендерит через локально вендоренный perfect-freehand (постоянная толщина).
//
// Интеграция: в разметке должна быть кнопка #drawBtn (в шапке, data-header-extra).
// Вызвать initDrawOverlay() один раз после загрузки страницы.
//
// Слои: штрихи, фигуры И картинки — единый упорядоченный список objects на ОДНОМ канвасе,
// рендер в порядке добавления → вставленная картинка ложится ПОВЕРХ нарисованного раньше,
// а нарисованное после — поверх картинки (истинное послойное наложение). undo/redo —
// снапшоты objects. Картинки грузим как data:-URL (CSP img-src не пускает blob:).
// Печать: корень = body>div + position:fixed → прячется print.css/print_lifecycle (+ @media print).

import { getStroke } from '../vendor/perfect-freehand.mjs?v=2026-06-17-22-183443';

const COLORS = [
  '#ffffff', '#e8453c', '#f5a623', '#2bb24c', '#2d8cf0',
  '#8e5cd9', '#e95ba6', '#f7d046', '#18b5a7', '#4ec3f7',
  '#111111', '#8d2b2b', '#a85b2b', '#1c7a3e', '#1f4fa3',
];
const THICKS = [2, 4, 7, 12, 20];
const THICK_NAMES = ['супертонкий', 'тонкий', 'средний', 'толще', 'супертолстый'];
// Движок пера всегда perfect-freehand (state.engine='pf'); выбор стиля линии убран из UI.
const RECT_ICON = '<svg width="20" height="13" viewBox="0 0 22 14" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><rect x="1.6" y="1.6" width="18.8" height="10.8" rx="2"/></svg>';
const RECTF_ICON = '<svg width="20" height="13" viewBox="0 0 22 14" fill="currentColor" aria-hidden="true"><rect x="1" y="1" width="20" height="12" rx="2"/></svg>';
const TOOLS = [['pen', '✎'], ['line', '／'], ['rect', RECT_ICON], ['rectF', RECTF_ICON], ['ellipse', '◯'], ['ellipseF', '⬤']];

const ICON = {
  drag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9 2 12l3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/></svg>',
  pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  eraser: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3 21 8 10 19H5l-2-2L16 3Z"/><path d="M5 19h14"/></svg>',
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-4"/></svg>',
  redo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h4"/></svg>',
  clear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m6 6 1 15h10l1-15"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6 18 18M18 6 6 18"/></svg>',
  select: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"><path d="M5 3l6.5 16 2.3-6.6 6.6-2.3L5 3Z"/></svg>',
  paste: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.6"/><path d="m21 15-5-5L5 21"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
};

// ----- module-level capture helpers (общие для copyWindow и captureCardBlob) -----
// dom-to-image-more (SVG foreignObject = РОДНАЯ раскладка браузера, верный текст/MathJax).
// Грузим лениво один раз; загрузка модуля не меняет существующее clipboard-поведение.
let __dtiMod = null;
async function loadDTI() {
  if (!__dtiMod) { const m = await import('https://cdn.jsdelivr.net/npm/dom-to-image-more@3.5.0/+esm'); __dtiMod = m.default || m; }
  return __dtiMod;
}
const __loadImg = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });

// Текущий построенный overlay — нужен captureCardBlob, чтобы наложить слой штрихов (cMain)
// поверх снимка карточки. null, пока рисовалку ни разу не открыли на странице.
let __activeOverlay = null;

// Захват ОДНОЙ карточки списка в PNG-blob: DOM карточки через dom-to-image-more, а если
// рисовалка сейчас активна — поверх ложатся штрихи cMain над экранным регионом карточки.
// Узлы с атрибутом data-capture-hide в снимок не попадают (UI-кнопки, пустая print-строка).
// Аддитивно к рисовалке: clipboard-захват окна (copyWindow) не затрагивается.
export async function captureCardBlob(cardEl, opts = {}) {
  if (!cardEl) throw new Error('captureCardBlob: no card element');
  const dti = await loadDTI();
  const s = Number(opts.scale) || Math.min(2, window.devicePixelRatio || 1);
  const rect = cardEl.getBoundingClientRect();
  const filter = (node) => !(node && node.nodeType === 1 && node.hasAttribute && node.hasAttribute('data-capture-hide'));
  const url = await dti.toPng(cardEl, { scale: s, bgcolor: '#ffffff', filter });
  const cardImg = await __loadImg(url);
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(rect.width * s));
  out.height = Math.max(1, Math.round(rect.height * s));
  const octx = out.getContext('2d');
  octx.drawImage(cardImg, 0, 0, out.width, out.height);
  const ov = __activeOverlay;
  if (ov && ov.cMain && ov.root.classList.contains('active') && ov.cMain.width > 0) {
    const kx = ov.cMain.width / window.innerWidth;
    const ky = ov.cMain.height / window.innerHeight;
    octx.drawImage(
      ov.cMain,
      rect.left * kx, rect.top * ky, rect.width * kx, rect.height * ky,
      0, 0, out.width, out.height,
    );
  }
  return await new Promise((res) => out.toBlob(res, 'image/png'));
}

export function initDrawOverlay() {
  const btn = document.getElementById('drawBtn');
  if (!btn || btn.dataset.drawWired === '1') return;
  btn.dataset.drawWired = '1';
  let ui = null;
  btn.addEventListener('click', () => {
    if (!ui) ui = build(btn);
    ui.toggle();
  });
}

function build(btn) {
  const root = document.createElement('div');
  root.className = 'draw-overlay-root';
  root.innerHTML = `
    <div class="dro-stage"><canvas class="dro-main"></canvas><canvas class="dro-prev"></canvas></div>
    <button class="dro-copy" title="Скопировать окно в буфер (вставить картинкой)" aria-label="Скопировать окно">${ICON.copy}</button>
    <div class="dro-bar">
      <button class="dro-btn dro-drag" data-act="drag" title="Переместить панель">${ICON.drag}</button>
      <button class="dro-btn dro-select-btn" data-act="select" title="Выделить / двигать / масштабировать картинку">${ICON.select}</button>
      <button class="dro-btn dro-pen" data-act="pen" title="Перо · толщина · фигуры">${ICON.pen}</button>
      <button class="dro-btn dro-eraser" data-act="eraser" title="Ластик (удаляет элемент целиком)">${ICON.eraser}</button>
      <button class="dro-btn dro-color" data-act="color" title="Цвет"><span class="dro-cdot"></span></button>
      <button class="dro-btn dro-paste" data-act="paste" title="Вставить картинку из буфера (Ctrl/Cmd+V)">${ICON.paste}</button>
      <span class="dro-sep"></span>
      <button class="dro-btn dro-undo" data-act="undo" title="Назад">${ICON.undo}</button>
      <button class="dro-btn dro-redo" data-act="redo" title="Вперёд">${ICON.redo}</button>
      <button class="dro-btn dro-clear" data-act="clear" title="Очистить (отменяется через ↶)">${ICON.clear}</button>
      <button class="dro-btn dro-more" data-act="more" title="Ещё">${ICON.more}</button>
      <button class="dro-btn dro-close" data-act="close" title="Закрыть">${ICON.close}</button>
    </div>
    <div class="dro-pop dro-pop-pen" hidden>
      <div class="dro-row"><span class="dro-lbl">инстр.:</span><span class="dro-tools"></span></div>
      <div class="dro-row"><span class="dro-lbl">толщина:</span><span class="dro-thick"></span></div>
    </div>
    <div class="dro-pop dro-pop-color" hidden><div class="dro-grid"></div></div>
    <div class="dro-pop dro-pop-more" hidden><div class="dro-row dro-more-row"></div></div>
  `;
  document.body.appendChild(root);

  const $ = (s) => root.querySelector(s);
  const cMain = $('.dro-main'), cPrev = $('.dro-prev');
  const mctx = cMain.getContext('2d'), pctx = cPrev.getContext('2d');
  const bar = $('.dro-bar'), cdot = $('.dro-cdot');
  __activeOverlay = { root, cMain };   // captureCardBlob накладывает слой штрихов через эту ссылку

  const state = { engine: 'pf', tool: 'pen', color: '#111111', size: THICKS[1], pressure: false, bg: 'transparent', drawing: false };

  // ----- retained-mode: единый список объектов (слои) + история -----
  // objects = [{kind:'stroke'|'rect'|'ellipse'|'line'|'image', ...}] в порядке наложения.
  let objects = [], current = null, hi = 0, erasedThisDrag = false, activePointerType = null;
  let selected = null, imgDrag = null, lastPointer = { x: innerWidth / 2, y: innerHeight / 2 };
  let history = [[]];
  let dpr = Math.max(1, window.devicePixelRatio || 1);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const imgCache = new Map();   // src(data:URL) -> HTMLImageElement (грузим один раз)
  function getImg(src) {
    let im = imgCache.get(src);
    if (!im) { im = new Image(); im.onload = () => renderAll(); im.src = src; imgCache.set(src, im); }
    return im;
  }
  function commit() { history = history.slice(0, hi + 1); history.push(clone(objects)); hi = history.length - 1; syncHist(); }
  function undo() { if (hi > 0) { hi--; objects = clone(history[hi]); selected = null; renderAll(); drawSelection(); syncHist(); } }
  function redo() { if (hi < history.length - 1) { hi++; objects = clone(history[hi]); selected = null; renderAll(); drawSelection(); syncHist(); } }
  function syncHist() { $('.dro-undo').disabled = hi <= 0; $('.dro-redo').disabled = hi >= history.length - 1; }

  // ----- размеры / DPR (бэкстор от бокса канваса, не innerWidth — иначе сдвиг при скроллбаре) -----
  function sizeCanvas(c, ctx, w, h) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  function resizeAll() {
    dpr = Math.max(1, devicePixelRatio || 1);
    const r = cMain.getBoundingClientRect();
    const w = r.width || innerWidth, h = r.height || innerHeight;
    sizeCanvas(cMain, mctx, w, h); sizeCanvas(cPrev, pctx, w, h);
    renderAll(); drawSelection();
  }
  window.addEventListener('resize', () => { if (root.classList.contains('active')) resizeAll(); });

  // ----- рендер -----
  function fillOutline(ctx, o, color) { if (!o || o.length < 2) return; ctx.beginPath(); ctx.moveTo(o[0][0], o[0][1]); for (let i = 1; i < o.length; i++) ctx.lineTo(o[i][0], o[i][1]); ctx.closePath(); ctx.fillStyle = color; ctx.fill(); }
  function pfStroke(points, size, pointerType) { const p = state.pressure; return getStroke(points, { size, thinning: p ? 0.6 : 0, smoothing: 0.55, streamline: 0.5, simulatePressure: p && pointerType === 'mouse', last: true }); }
  function renderStroke(ctx, o) {
    const pts = o.points;
    if (o.style === 'pf') { fillOutline(ctx, pfStroke(pts, o.size, o.pointerType), o.color); return; }
    ctx.strokeStyle = o.color; ctx.fillStyle = o.color; ctx.lineWidth = o.size; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (pts.length < 2) { ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1], o.size / 2, 0, 7); ctx.fill(); return; }
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    if (o.style === 'smooth') { for (let i = 1; i < pts.length - 1; i++) { const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my); } ctx.lineTo(pts.at(-1)[0], pts.at(-1)[1]); }
    else { for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); }
    ctx.stroke();
  }
  function drawShape(ctx, o) {
    ctx.lineWidth = o.size; ctx.strokeStyle = o.color; ctx.fillStyle = o.color; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (o.kind === 'line') { ctx.beginPath(); ctx.moveTo(o.x0, o.y0); ctx.lineTo(o.x1, o.y1); ctx.stroke(); return; }
    const x = Math.min(o.x0, o.x1), y = Math.min(o.y0, o.y1), w = Math.abs(o.x1 - o.x0), h = Math.abs(o.y1 - o.y0);
    ctx.beginPath();
    if (o.kind === 'rect') ctx.rect(x, y, w, h); else ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, 7);
    o.filled ? ctx.fill() : ctx.stroke();
  }
  function drawObject(ctx, o) {
    if (o.kind === 'stroke') renderStroke(ctx, o);
    else if (o.kind === 'image') { const im = getImg(o.src); if (im.complete && im.naturalWidth) ctx.drawImage(im, o.x, o.y, o.w, o.h); }
    else drawShape(ctx, o);
  }
  function renderAll() { mctx.clearRect(0, 0, cMain.width, cMain.height); for (const o of objects) drawObject(mctx, o); }
  function clearPreview() { pctx.clearRect(0, 0, cPrev.width, cPrev.height); }

  // ----- координаты / hit-test (объектный ластик — картинки им НЕ трогаем) -----
  function pos(e) { const r = cMain.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  function pressureOf(e) { return (e.pressure > 0 && e.pointerType !== 'mouse') ? e.pressure : 0.5; }
  function d2seg(px, py, x0, y0, x1, y1) { const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy; let t = l2 ? ((px - x0) * dx + (py - y0) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy)); }
  function hit(o, x, y, r) {
    if (o.kind === 'image') return false;
    const pad = r + o.size / 2;
    if (o.kind === 'stroke') { for (let i = 0; i < o.points.length; i++) { if (Math.hypot(o.points[i][0] - x, o.points[i][1] - y) <= pad) return true; if (i > 0 && d2seg(x, y, o.points[i - 1][0], o.points[i - 1][1], o.points[i][0], o.points[i][1]) <= pad) return true; } return false; }
    if (o.kind === 'line') return d2seg(x, y, o.x0, o.y0, o.x1, o.y1) <= pad;
    const x0 = Math.min(o.x0, o.x1) - r, x1 = Math.max(o.x0, o.x1) + r, y0 = Math.min(o.y0, o.y1) - r, y1 = Math.max(o.y0, o.y1) + r;
    return x >= x0 && x <= x1 && y >= y0 && y <= y1;
  }
  function eraseAt(x, y) { const r = Math.max(8, state.size / 2 + 6); for (let i = objects.length - 1; i >= 0; i--) if (hit(objects[i], x, y, r)) { objects.splice(i, 1); return true; } return false; }

  // ===== выделение / перемещение / масштаб картинок (инструмент select) =====
  const HZONE = 12;   // радиус хит-зоны угловых ручек (CSS px)
  function imageAt(x, y) { for (let i = objects.length - 1; i >= 0; i--) { const o = objects[i]; if (o.kind === 'image' && x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) return o; } return null; }
  function handleAt(o, x, y) {
    if (!o) return null;
    if (Math.hypot(x - (o.x + o.w), y - o.y) <= HZONE) return 'delete';        // верхний-правый — удалить
    if (Math.hypot(x - (o.x + o.w), y - (o.y + o.h)) <= HZONE) return 'resize'; // нижний-правый — масштаб
    return null;
  }
  function drawDot(cx, cy, color, glyph) {
    pctx.beginPath(); pctx.arc(cx, cy, 8, 0, 7); pctx.fillStyle = color; pctx.fill();
    pctx.lineWidth = 2; pctx.strokeStyle = '#fff'; pctx.stroke();
    if (glyph) { pctx.fillStyle = '#fff'; pctx.font = '13px -apple-system, sans-serif'; pctx.textAlign = 'center'; pctx.textBaseline = 'middle'; pctx.fillText(glyph, cx, cy + 0.5); }
  }
  function drawSelection() {
    clearPreview();
    if (!selected || state.tool !== 'select' || objects.indexOf(selected) < 0) return;
    const o = selected;
    pctx.save();
    pctx.strokeStyle = '#2d7cf6'; pctx.lineWidth = 1.5; pctx.setLineDash([5, 4]);
    pctx.strokeRect(o.x, o.y, o.w, o.h);
    pctx.setLineDash([]);
    drawDot(o.x + o.w, o.y + o.h, '#2d7cf6');      // resize
    drawDot(o.x + o.w, o.y, '#d9362b', '×');       // delete
    pctx.restore();
  }
  function removeImage(o) { const i = objects.indexOf(o); if (i >= 0) objects.splice(i, 1); }

  function selectDown(e) {
    const [x, y] = pos(e);
    cPrev.setPointerCapture?.(e.pointerId);
    const h = handleAt(selected, x, y);
    if (h === 'delete') { removeImage(selected); selected = null; renderAll(); drawSelection(); commit(); return; }
    if (h === 'resize') { imgDrag = { mode: 'resize', sx: x, ow: selected.w, ratio: selected.h / selected.w }; return; }
    const o = imageAt(x, y);
    if (o) { selected = o; imgDrag = { mode: 'move', sx: x, sy: y, ox: o.x, oy: o.y, moved: false }; drawSelection(); return; }
    selected = null; drawSelection();
  }
  function selectMove(e) {
    if (!imgDrag) return;
    const [x, y] = pos(e);
    if (imgDrag.mode === 'move') { imgDrag.moved = true; selected.x = imgDrag.ox + (x - imgDrag.sx); selected.y = imgDrag.oy + (y - imgDrag.sy); }
    else { imgDrag.moved = true; const w = Math.max(24, imgDrag.ow + (x - imgDrag.sx)); selected.w = w; selected.h = w * imgDrag.ratio; }
    renderAll(); drawSelection();
  }
  function selectUp() { if (imgDrag) { const m = imgDrag.moved; imgDrag = null; if (m) commit(); } }

  // ----- pointer (рисование + выделение в одном канвасе) -----
  function drawable() { return root.classList.contains('active') && !root.classList.contains('paused'); }
  function shapeKind(t) { return t === 'line' ? 'line' : t.startsWith('rect') ? 'rect' : 'ellipse'; }
  function onDown(e) {
    if (!drawable()) return;
    if (activePointerType === 'pen' && e.pointerType === 'touch') return;
    activePointerType = e.pointerType;
    if (state.tool === 'select') { selectDown(e); return; }
    state.drawing = true; cPrev.setPointerCapture?.(e.pointerId);
    const [x, y] = pos(e);
    if (state.tool === 'eraser') { erasedThisDrag = false; if (eraseAt(x, y)) { erasedThisDrag = true; renderAll(); } return; }
    if (state.tool === 'pen') current = { kind: 'stroke', style: state.engine, points: [[x, y, pressureOf(e)]], color: state.color, size: state.size, pointerType: e.pointerType };
    else current = { kind: shapeKind(state.tool), x0: x, y0: y, x1: x, y1: y, color: state.color, size: state.size, filled: state.tool.endsWith('F') };
  }
  function onMove(e) {
    if (state.tool === 'select') { selectMove(e); return; }
    if (!state.drawing) return;
    if (activePointerType === 'pen' && e.pointerType === 'touch') return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    if (state.tool === 'eraser') { for (const ev of evs) { const [x, y] = pos(ev); if (eraseAt(x, y)) { erasedThisDrag = true; renderAll(); } } return; }
    if (state.tool === 'pen') { for (const ev of evs) { const [x, y] = pos(ev); current.points.push([x, y, pressureOf(ev)]); } clearPreview(); renderStroke(pctx, current); }
    else { const [x, y] = pos(e); current.x1 = x; current.y1 = y; clearPreview(); drawShape(pctx, current); }
  }
  function onUp(e) {
    if (e.pointerType === activePointerType) activePointerType = null;
    if (state.tool === 'select') { selectUp(); return; }
    if (!state.drawing) return; state.drawing = false;
    if (state.tool === 'eraser') { if (erasedThisDrag) commit(); }
    else if (current) { objects.push(current); current = null; renderAll(); clearPreview(); commit(); }
  }
  for (const [t, f] of [['pointerdown', onDown], ['pointermove', onMove], ['pointerup', onUp], ['pointercancel', onUp]]) cPrev.addEventListener(t, f);
  root.addEventListener('pointermove', (e) => { lastPointer = { x: e.clientX, y: e.clientY }; }, true);

  // ===== вставка картинок из буфера =====
  function addImageFromDataUrl(dataUrl) {
    const probe = new Image();
    probe.onload = () => {
      const ratio = probe.naturalHeight / probe.naturalWidth || 1;
      const w = Math.min(probe.naturalWidth, Math.min(420, innerWidth * 0.8));
      const h = w * ratio;
      const x = Math.max(0, Math.min(innerWidth - w, lastPointer.x - w / 2));
      const y = Math.max(0, Math.min(innerHeight - h, lastPointer.y - h / 2));
      imgCache.set(dataUrl, probe);                 // уже загружено → drawImage сразу
      const o = { kind: 'image', src: dataUrl, x, y, w, h };
      objects.push(o);                              // верхний слой
      setTool('select'); selected = o;
      renderAll(); drawSelection(); commit();
    };
    probe.src = dataUrl;
  }
  function onPaste(e) {
    if (!root.classList.contains('active')) return;
    const items = (e.clipboardData && e.clipboardData.items) || [];
    for (const it of items) {
      if (it.kind === 'file' && it.type.startsWith('image/')) {
        e.preventDefault();
        const blob = it.getAsFile(); if (!blob) return;
        const fr = new FileReader(); fr.onload = () => addImageFromDataUrl(fr.result); fr.readAsDataURL(blob);
        return;
      }
    }
  }
  document.addEventListener('paste', onPaste);
  async function pasteFromButton() {
    try {
      if (!navigator.clipboard || !navigator.clipboard.read) return flashPaste();
      const items = await navigator.clipboard.read();
      for (const it of items) { const t = it.types.find(x => x.startsWith('image/')); if (t) { const blob = await it.getType(t); const fr = new FileReader(); fr.onload = () => addImageFromDataUrl(fr.result); fr.readAsDataURL(blob); return; } }
      flashPaste();
    } catch (_) { flashPaste(); }
  }
  function flashPaste() { const pb = $('.dro-paste'); if (!pb) return; pb.classList.add('dro-hint'); setTimeout(() => pb.classList.remove('dro-hint'), 1100); }
  document.addEventListener('keydown', (e) => {
    if (!root.classList.contains('active') || !selected) return;
    const ae = document.activeElement; if (ae && /^(input|textarea|select)$/i.test(ae.tagName)) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeImage(selected); selected = null; renderAll(); drawSelection(); commit(); }
  });

  // ====================== UI ======================
  const toolsBox = $('.dro-tools'), thickBox = $('.dro-thick'), grid = $('.dro-grid'), moreRow = $('.dro-more-row');
  TOOLS.forEach(([t, g]) => { const b = document.createElement('button'); b.className = 'dro-tbtn'; b.dataset.tool = t; b.innerHTML = g; b.title = t; toolsBox.appendChild(b); });
  THICKS.forEach((t, i) => { const b = document.createElement('button'); b.className = 'dro-tbtn'; b.dataset.thick = String(t); b.title = THICK_NAMES[i]; const d = Math.min(18, Math.max(3, t)); b.innerHTML = `<span class="dro-dot" style="width:${d}px;height:${d}px"></span>`; thickBox.appendChild(b); });
  COLORS.forEach(c => { const b = document.createElement('button'); b.className = 'dro-cell' + (c === '#ffffff' ? ' dro-light' : ''); b.dataset.color = c; b.style.background = c; b.title = c; grid.appendChild(b); });
  moreRow.innerHTML = '<button class="dro-tbtn dro-tbtn-style" data-more="pressure">нажим: выкл</button>'
    + '<button class="dro-tbtn dro-tbtn-style" data-more="pause">пауза (скролл)</button>'
    + '<button class="dro-tbtn dro-tbtn-style" data-more="bg">фон</button>';

  const POPS = { pen: '.dro-pop-pen', color: '.dro-pop-color', more: '.dro-pop-more' };
  function closePops() { for (const s of Object.values(POPS)) $(s).hidden = true; }
  function openPop(name, btnEl) {
    const pop = $(POPS[name]); const wasOpen = !pop.hidden; closePops(); if (wasOpen) return;
    pop.hidden = false;
    const br = btnEl.getBoundingClientRect(), pr = pop.getBoundingClientRect();
    let left = br.left + br.width / 2 - pr.width / 2;
    left = Math.max(6, Math.min(innerWidth - pr.width - 6, left));
    pop.style.left = left + 'px'; pop.style.top = (bar.getBoundingClientRect().bottom + 8) + 'px';
  }
  document.addEventListener('pointerdown', (e) => { if (!root.classList.contains('active')) return; if (e.target.closest('.dro-pop') || e.target.closest('[data-act="pen"],[data-act="color"],[data-act="more"]')) return; closePops(); });

  function updateActive() {
    $('.dro-pen').classList.toggle('active', state.tool !== 'eraser' && state.tool !== 'select');
    $('.dro-eraser').classList.toggle('active', state.tool === 'eraser');
    $('.dro-select-btn').classList.toggle('active', state.tool === 'select');
    cdot.style.background = state.color;
    toolsBox.querySelectorAll('.dro-tbtn').forEach(b => b.classList.toggle('on', b.dataset.tool === state.tool));
    thickBox.querySelectorAll('.dro-tbtn').forEach(b => b.classList.toggle('on', Number(b.dataset.thick) === state.size));
    grid.querySelectorAll('.dro-cell').forEach(b => b.classList.toggle('on', b.dataset.color === state.color));
  }

  function setTool(t) {
    state.tool = t;
    if (t !== 'select') { selected = null; }
    if (t === 'select') closePops();
    updateActive(); drawSelection();
  }

  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'pen') { if (state.tool === 'eraser' || state.tool === 'select') setTool('pen'); else updateActive(); openPop('pen', b); }
    else if (act === 'eraser') { setTool('eraser'); closePops(); }
    else if (act === 'select') setTool('select');
    else if (act === 'paste') pasteFromButton();
    else if (act === 'color') openPop('color', b);
    else if (act === 'more') openPop('more', b);
    else if (act === 'undo') undo();
    else if (act === 'redo') redo();
    else if (act === 'clear') { if (objects.length) { objects = []; selected = null; renderAll(); drawSelection(); commit(); } }
    else if (act === 'close') setActive(false);
  });
  toolsBox.addEventListener('click', (e) => { const b = e.target.closest('[data-tool]'); if (!b) return; setTool(b.dataset.tool); });
  thickBox.addEventListener('click', (e) => { const b = e.target.closest('[data-thick]'); if (!b) return; state.size = Number(b.dataset.thick); updateActive(); });
  grid.addEventListener('click', (e) => { const b = e.target.closest('[data-color]'); if (!b) return; state.color = b.dataset.color; updateActive(); closePops(); });
  moreRow.addEventListener('click', (e) => {
    const b = e.target.closest('[data-more]'); if (!b) return;
    if (b.dataset.more === 'pressure') { state.pressure = !state.pressure; b.textContent = 'нажим: ' + (state.pressure ? 'вкл' : 'выкл'); b.classList.toggle('on', state.pressure); renderAll(); drawSelection(); }
    else if (b.dataset.more === 'pause') { const paused = root.classList.toggle('paused'); b.classList.toggle('on', paused); b.textContent = paused ? '▶ продолжить' : 'пауза (скролл)'; }
    else if (b.dataset.more === 'bg') { state.bg = state.bg === 'transparent' ? 'dark' : state.bg === 'dark' ? 'paper' : 'transparent'; root.classList.toggle('dro-bg-dark', state.bg === 'dark'); root.classList.toggle('dro-bg-paper', state.bg === 'paper'); }
  });

  // ----- перетаскивание панели -----
  const dragBtn = $('.dro-drag');
  let drag = null;
  dragBtn.addEventListener('pointerdown', (e) => {
    closePops();
    const r = bar.getBoundingClientRect(); drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    bar.style.left = r.left + 'px'; bar.style.top = r.top + 'px'; bar.style.right = 'auto'; bar.style.bottom = 'auto'; bar.style.transform = 'none';
    bar.classList.add('dragging'); dragBtn.setPointerCapture(e.pointerId); e.preventDefault();
  });
  dragBtn.addEventListener('pointermove', (e) => { if (!drag) return; const w = bar.offsetWidth, h = bar.offsetHeight; bar.style.left = Math.max(4, Math.min(innerWidth - w - 4, e.clientX - drag.dx)) + 'px'; bar.style.top = Math.max(4, Math.min(innerHeight - h - 4, e.clientY - drag.dy)) + 'px'; });
  const endDrag = () => { drag = null; bar.classList.remove('dragging'); };
  dragBtn.addEventListener('pointerup', endDrag); dragBtn.addEventListener('pointercancel', endDrag);

  // ----- скопировать окно в буфер (dom-to-image-more → ClipboardItem), БЕЗ запроса браузера -----
  // getDisplayMedia всегда спрашивает разрешение (дизайн безопасности — отключить нельзя). Поэтому
  // рендерим DOM в картинку через dom-to-image-more (SVG foreignObject = РОДНАЯ раскладка браузера,
  // текст верный, в отличие от html2canvas). Композитим рисунок (cMain) поверх — он наш canvas.
  // Фокус: снимаем белую маску (она viewport-размера) + рисунок. Обычный: снимаем страницу (без
  // оверлея, filter) + рисунок. Нужен secure context (localhost/HTTPS) для clipboard.write.
  const copyBtn = $('.dro-copy');
  function flashCopy(cls) { copyBtn.classList.add(cls); setTimeout(() => copyBtn.classList.remove(cls), 1300); }
  const loadImg = __loadImg;
  async function copyWindow() {
    if (copyBtn.classList.contains('dro-busy')) return;
    copyBtn.classList.add('dro-busy');
    try {
      const dti = await loadDTI();
      document.body.classList.add('dro-capturing');   // прячем UI-хром (тулбар/кнопки), но НЕ рисунок
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const s = Math.min(2, devicePixelRatio || 1);
      const W = innerWidth, H = innerHeight;
      const out = document.createElement('canvas'); out.width = Math.round(W * s); out.height = Math.round(H * s);
      const octx = out.getContext('2d');
      const focus = document.body.classList.contains('dro-card-focus');
      if (focus) {
        const url = await dti.toPng(document.querySelector('.dro-focus-mask'), { bgcolor: '#ffffff', scale: s });
        octx.drawImage(await loadImg(url), 0, 0, out.width, out.height);
      } else {
        // НЕ снимаем весь body — тяжёлый сайдбар вешает dom-to-image. Берём колонку контента
        // (шапка + карточки, ~1с) и рисуем её по экранной позиции; сайдбар → фон.
        octx.fillStyle = getComputedStyle(document.body).backgroundColor || '#ffffff'; octx.fillRect(0, 0, out.width, out.height);
        const node = document.querySelector('main.container') || document.getElementById('taskList');
        if (node) {
          const r = node.getBoundingClientRect();
          const url = await dti.toPng(node, { scale: s, bgcolor: 'transparent' });
          const im = await loadImg(url);
          octx.drawImage(im, Math.round(r.left * s), Math.round(r.top * s), Math.round(r.width * s), Math.round(r.height * s));
        }
      }
      octx.drawImage(cMain, 0, 0, out.width, out.height);   // рисунок поверх (наш canvas)
      document.body.classList.remove('dro-capturing');
      const blob = await new Promise((res) => out.toBlob(res, 'image/png'));
      if (!blob) throw new Error('empty');
      // WLM.1: отдать снимок подписчикам (Режим занятия добавит его в конспект). Событие летит
      // ДО clipboard и независимо от его поддержки — blob уже валиден для конспекта.
      try { document.dispatchEvent(new CustomEvent('draw-overlay-capture', { detail: { blob, focused: focus } })); } catch (_) {}
      if (!navigator.clipboard || !window.ClipboardItem) throw new Error('clipboard image unsupported');
      await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
      flashCopy('dro-ok');
    } catch (e) {
      document.body.classList.remove('dro-capturing');
      console.warn('copy window failed', e);
      flashCopy('dro-err');
    } finally {
      copyBtn.classList.remove('dro-busy');
    }
  }
  copyBtn.addEventListener('click', copyWindow);

  // ----- вкл/выкл -----
  function setActive(on) {
    root.classList.toggle('active', on);
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on) resizeAll(); else { closePops(); root.classList.remove('paused'); selected = null; clearPreview(); }
  }
  function toggle() { setActive(!root.classList.contains('active')); }

  updateActive(); syncHist();
  return { toggle, setActive };
}
