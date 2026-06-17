// tasks/my_homeworks.js
// Страница "Мои ДЗ" (последние 10)

const BUILD = document.querySelector('meta[name="app-build"]')?.content?.trim() || '';
const withV = (p) => BUILD ? `${p}${p.includes('?') ? '&' : '?'}v=${encodeURIComponent(BUILD)}` : p;

const $ = (sel, root = document) => root.querySelector(sel);

import { navigate } from '../app/ui/nav.js?v=2026-06-17-33-225308';

async function api(){
  // ВАЖНО: dynamic import резолвится относительно URL текущего модуля.
  // Поэтому используем абсолютный путь от корня.
  const mod = await import(withV('/app/providers/homework.js'));
  return mod;
}

function fmtDateTimeRU(s){
  s = String(s || '').trim();
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const yy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2,'0');
  const mi = String(d.getMinutes()).padStart(2,'0');
  return `${dd}.${mm}.${yy} ${hh}:${mi}`;
}

function titleOf(it){
  return String(it?.title || it?.homework_title || it?.name || '').trim() || 'ДЗ';
}

function isSubmitted(it){
  if (typeof it?.is_submitted === 'boolean') return it.is_submitted;
  if (it?.submitted_at) return true;
  if (it?.finished_at) return true;
  return false;
}

function scoreTextOf(it){
  const c = it?.correct ?? it?.correct_count ?? it?.c;
  const t = it?.total ?? it?.total_count ?? it?.t;
  if (c === null || c === undefined) return '';
  if (t === null || t === undefined) return '';
  const cc = Number(c);
  const tt = Number(t);
  if (!Number.isFinite(cc) || !Number.isFinite(tt)) return '';
  if (tt <= 0) return '';
  // W-pre-prod: «0/2» → «верно 0 из 2» (понятнее ученику).
  return `верно ${cc} из ${tt}`;
}

function hwUrl(token){
  if (!token) return '';
  const u = new URL('./hw.html', location.href);
  u.searchParams.set('token', String(token));
  if (BUILD) u.searchParams.set('v', BUILD);
  return u.href;
}

function bindCardOpen(el, href){
  if (!el || !href) return;
  el.classList.add('clickable');
  el.setAttribute('role', 'button');
  el.tabIndex = 0;

  // Клик — в текущей вкладке; Ctrl/Cmd или средний клик — в новой (navigate).
  // Клавиатура (Enter/Space) — всегда в текущей вкладке.
  const onPointer = (e) => {
    // не перехватываем клики по интерактивным элементам внутри карточки
    const a = e.target?.closest?.('a,button,input,textarea,select,label');
    if (a) return;
    if (e.type === 'auxclick' && e.button !== 1) return;
    if (e.type === 'auxclick') e.preventDefault();
    navigate(href, e);
  };

  el.addEventListener('click', onPointer);
  el.addEventListener('auxclick', onPointer);

  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      navigate(href);
    }
  });
}

function renderList(items){
  const listEl = $('#myHwList');
  const emptyEl = $('#myHwEmpty');
  if (!listEl || !emptyEl) return;

  listEl.innerHTML = '';
  emptyEl.textContent = '';

  if (!items || !items.length){
    emptyEl.textContent = 'Пока нет назначенных ДЗ.';
    return;
  }

  for (const it of items){
    const token = it?.token || it?.hw_token || it?.homework_token || '';
    const href = hwUrl(token);
    const submitted = isSubmitted(it);

    const card = document.createElement('div');
    card.className = 'myhw-card';

    const top = document.createElement('div');
    top.className = 'myhw-row';

    const left = document.createElement('div');
    left.className = 'myhw-left';

    const ttl = document.createElement('div');
    ttl.className = 'myhw-title';
    const score = submitted ? scoreTextOf(it) : '';
    ttl.textContent = score ? `${titleOf(it)} — ${score}` : titleOf(it);

    const meta = document.createElement('div');
    meta.className = 'myhw-meta';
    const assigned = fmtDateTimeRU(it?.assigned_at || it?.created_at || '');
    const submittedAt = fmtDateTimeRU(it?.submitted_at || it?.finished_at || '');
    // Для выполненных показываем время сдачи (без лишних подписей, как в "Выполненных работах").
    // Для невыполненных — дату назначения.
    meta.textContent = submittedAt ? submittedAt : (assigned ? `Назначено: ${assigned}` : '');

    left.appendChild(ttl);
    left.appendChild(meta);

    const right = document.createElement('div');
    right.className = 'myhw-right';

    const badge = document.createElement('span');
    badge.className = 'myhw-badge ' + (submitted ? 'ok' : 'warn');
    badge.textContent = submitted ? 'Сдано' : 'Не сдано';

    right.appendChild(badge);

    top.appendChild(left);
    top.appendChild(right);

    card.appendChild(top);

    if (href) bindCardOpen(card, href);

    listEl.appendChild(card);
  }
}

function setStatus(text){
  const el = $('#myHwStatus');
  if (!el) return;
  const t = String(text || '');
  el.textContent = t;
  el.style.display = t ? '' : 'none';
}

function setCounters(pending, total){
  const p = $('#myHwPending');
  const t = $('#myHwTotal');
  if (p) p.textContent = (pending === null || pending === undefined || pending === '') ? '' : `Несданные: ${pending}`;
  if (t) t.textContent = (total === null || total === undefined || total === '') ? '' : `Всего: ${total}`;
}

function setArchiveLabel(arch){
  const el = $('#myHwMenuArchive');
  if (!el) return;
  const n = Number(arch);
  el.textContent = Number.isFinite(n) && n > 0 ? `Архив работ (${n})` : 'Архив работ';
}

async function mapLimit(arr, limit, fn){
  const out = new Array(arr.length);
  let i = 0;

  async function worker(){
    while (true){
      const idx = i++;
      if (idx >= arr.length) return;
      try{ out[idx] = await fn(arr[idx], idx); }
      catch(e){ out[idx] = null; }
    }
  }

  const n = Math.max(1, Math.min(limit || 4, arr.length || 1));
  await Promise.all(Array.from({ length: n }, worker));
  return out;
}

// F2: единый error-state для «Мои ДЗ». Хост — список; Повторить перезапускает load().
async function showHwError(err, kind){
  setStatus('');
  setCounters('', '');
  const host = $('#myHwList');
  const empty = $('#myHwEmpty');
  if (empty) empty.textContent = '';
  if (!host) return;
  try {
    const { renderErrorState } = await import(withV('/app/ui/error_state.js'));
    renderErrorState(host, { kind: kind || 'homework', err, onRetry: () => load() });
  } catch (_) {
    setStatus('Не удалось загрузить домашние задания. Попробуйте обновить страницу.');
  }
}

async function load(){
  setStatus('Загрузка…');
  setCounters('', '');

  let mod;
  try{
    mod = await api();
  } catch(e){
    console.warn('MyHW: cannot import provider', e);
    await showHwError(e, 'module');
    return;
  }

  const { getStudentMyHomeworksSummary, getHomeworkAttempt } = mod;
  if (typeof getStudentMyHomeworksSummary !== 'function'){
    await showHwError(new Error('provider not ready'), 'homework');
    return;
  }

  const res = await getStudentMyHomeworksSummary({ limit: 10 });
  if (!res?.ok){
    await showHwError(res?.error || new Error('load failed'), 'homework');
    return;
  }

  const data = res.data || {};
  const items = Array.isArray(data?.items) ? data.items : (Array.isArray(data?.latest) ? data.latest : (Array.isArray(data) ? data : []));

  renderList(items);

  const pending = Number(data?.pending_count ?? 0);
  const total = Number(data?.total_count ?? items.length);
  const arch = Number(data?.archive_count ?? Math.max(0, total - items.length));

  setCounters(pending, total);
  setArchiveLabel(arch);
  setStatus('');

  // Недостающие оценки не входят в критический путь: summary и карточки уже на
  // экране, а correct/total мягко дорисуются после фоновых attempt-RPC.
  if (typeof getHomeworkAttempt === 'function'){
    const need = items
      .filter((it) => isSubmitted(it))
      .filter((it) => !scoreTextOf(it))
      .filter((it) => (it?.token || it?.hw_token || it?.homework_token));

    if (need.length){
      mapLimit(need, 4, async (it) => {
        const token = it?.token || it?.hw_token || it?.homework_token;
        const r = await getHomeworkAttempt({ token });
        if (r?.ok && r.row){
          if (it.correct === undefined) it.correct = r.row.correct;
          if (it.total === undefined) it.total = r.row.total;
          if (!it.submitted_at && r.row.finished_at) it.submitted_at = r.row.finished_at;
        }
        return null;
      }).then(() => renderList(items)).catch(() => {});
    }
  }
}

function initMenu(){
  const wrap = $('#myHwMenuWrap');
  const btn = $('#myHwMenuBtn');
  const menu = $('#myHwMenu');
  const archive = $('#myHwMenuArchive');

  if (!wrap || !btn || !menu) return;

  const close = () => {
    menu.classList.add('hidden');
    btn.setAttribute('aria-expanded', 'false');
  };
  const open = () => {
    menu.classList.remove('hidden');
    btn.setAttribute('aria-expanded', 'true');
  };

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const isOpen = !menu.classList.contains('hidden');
    if (isOpen) close();
    else open();
  });

  wrap.addEventListener('click', (e) => e.stopPropagation());

  document.addEventListener('pointerdown', (e) => {
    if (menu.classList.contains('hidden')) return;
    if (wrap.contains(e.target)) return;
    close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  if (archive){
    archive.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      close();
      location.href = withV('./my_homeworks_archive.html');
    });
  }
}

function init(){
  initMenu();
  load();


  try { window.__EGE_DIAG__?.markReady?.(); } catch (_) {}
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
