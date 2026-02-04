// tasks/my_homeworks_archive.js
// MVP: страница архива ДЗ для ученика

const BUILD = document.querySelector('meta[name="app-build"]')?.content?.trim() || '';
const withV = (p) => BUILD ? `${p}${p.includes('?') ? '&' : '?'}v=${encodeURIComponent(BUILD)}` : p;

const inTasks = /\/tasks(\/|$)/.test(location.pathname);
const rel = inTasks ? '../' : './';

const $ = (sel, root = document) => root.querySelector(sel);

async function api(){
  return import(withV(rel + 'app/providers/homework.js'));
}

function isMissingRpc(err){
  try{
    const m = String(err?.data?.message || err?.message || '');
    return m.includes('PGRST202') || m.toLowerCase().includes('could not find the function');
  }catch(_){ return false; }
}

function fmtErr(err){
  const status = err?.status ?? '—';
  const msg = err?.data?.message || err?.data?.hint || err?.data?.details || err?.message || JSON.stringify(err);
  return `HTTP ${status}: ${msg}`;
}

function fmtDate(iso){
  const s = String(iso || '').trim();
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

function hwUrl(token){
  if (!token) return '';
  const u = new URL(rel + 'tasks/hw.html', location.href);
  u.searchParams.set('token', String(token));
  if (BUILD) u.searchParams.set('v', BUILD);
  return u.href;
}

function titleOf(it){
  return String(it?.title || it?.homework_title || it?.name || '').trim() || 'ДЗ';
}

function isSubmitted(it){
  if (typeof it?.is_submitted === 'boolean') return it.is_submitted;
  if (typeof it?.submitted === 'boolean') return it.submitted;
  if (typeof it?.done === 'boolean') return it.done;
  return !!(it?.submitted_at || it?.finished_at);
}

function renderItems(listEl, items){
  listEl.innerHTML = '';
  for (const it of (items || [])){
    const token = String(it?.token || it?.hw_token || it?.link_token || '').trim();
    const ok = isSubmitted(it);

    const card = document.createElement('div');
    card.className = 'myhw-card';

    const top = document.createElement('div');
    top.className = 'myhw-card-top';

    const left = document.createElement('div');
    const h = document.createElement('h3');
    h.className = 'myhw-title';
    h.textContent = titleOf(it);

    const meta = document.createElement('div');
    meta.className = 'myhw-meta';
    const assigned = fmtDate(it?.assigned_at || it?.created_at || it?.issued_at);
    const submitted = fmtDate(it?.submitted_at || it?.finished_at);
    const parts = [];
    if (assigned) parts.push(`Назначено: ${assigned}`);
    if (submitted) parts.push(`Сдано: ${submitted}`);
    meta.textContent = parts.join(' • ');

    left.appendChild(h);
    if (meta.textContent) left.appendChild(meta);

    const right = document.createElement('div');
    right.className = 'myhw-actions';

    const badge = document.createElement('span');
    badge.className = 'myhw-badge ' + (ok ? 'ok' : 'bad');
    badge.textContent = ok ? 'Сдано' : 'Не сдано';

    right.appendChild(badge);

    if (token){
      const a = document.createElement('a');
      a.className = 'btn small';
      a.href = hwUrl(token);
      a.textContent = 'Открыть';
      a.target = '_blank';
      a.rel = 'noopener';
      right.appendChild(a);
    }

    top.appendChild(left);
    top.appendChild(right);

    card.appendChild(top);
    listEl.appendChild(card);
  }
}

let OFFSET = 10;
let LIMIT = 50;
let LOADING = false;

async function loadMore(){
  if (LOADING) return;
  LOADING = true;

  const status = $('#archStatus');
  const listEl = $('#archList');
  const btn = $('#loadMore');

  try{
    status.textContent = 'Загружаем...';
    btn.disabled = true;

    const { getStudentMyHomeworksArchive } = await api();
    const res = await getStudentMyHomeworksArchive({ offset: OFFSET, limit: LIMIT });

    if (!res?.ok){
      const e = res?.error || {};
      if (isMissingRpc(e)) {
        status.textContent = 'Архив появится после обновления сервера (Supabase).';
      } else if (String(e?.message || '').includes('NOT_AUTHORIZED')) {
        status.textContent = 'Войдите, чтобы открыть архив.';
      } else {
        status.textContent = 'Не удалось загрузить архив: ' + fmtErr(e);
      }
      return;
    }

    const data = res.data;
    const items = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);

    // append
    const prev = listEl.querySelectorAll('.myhw-card').length;
    renderItemsAppend(listEl, items);

    if (prev + items.length === 0) {
      status.textContent = 'Архив пока пуст.';
    } else {
      status.textContent = '';
    }

    OFFSET += items.length;

    // если пришло меньше лимита — прячем кнопку
    if (items.length < LIMIT) {
      btn.hidden = true;
    } else {
      btn.hidden = false;
      btn.disabled = false;
    }

  } finally {
    LOADING = false;
    btn.disabled = false;
  }
}

function renderItemsAppend(listEl, items){
  for (const it of (items || [])){
    const token = String(it?.token || it?.hw_token || it?.link_token || '').trim();
    const ok = isSubmitted(it);

    const card = document.createElement('div');
    card.className = 'myhw-card';

    const top = document.createElement('div');
    top.className = 'myhw-card-top';

    const left = document.createElement('div');
    const h = document.createElement('h3');
    h.className = 'myhw-title';
    h.textContent = titleOf(it);

    const meta = document.createElement('div');
    meta.className = 'myhw-meta';
    const assigned = fmtDate(it?.assigned_at || it?.created_at || it?.issued_at);
    const submitted = fmtDate(it?.submitted_at || it?.finished_at);
    const parts = [];
    if (assigned) parts.push(`Назначено: ${assigned}`);
    if (submitted) parts.push(`Сдано: ${submitted}`);
    meta.textContent = parts.join(' • ');

    left.appendChild(h);
    if (meta.textContent) left.appendChild(meta);

    const right = document.createElement('div');
    right.className = 'myhw-actions';

    const badge = document.createElement('span');
    badge.className = 'myhw-badge ' + (ok ? 'ok' : 'bad');
    badge.textContent = ok ? 'Сдано' : 'Не сдано';

    right.appendChild(badge);

    if (token){
      const a = document.createElement('a');
      a.className = 'btn small';
      a.href = hwUrl(token);
      a.textContent = 'Открыть';
      a.target = '_blank';
      a.rel = 'noopener';
      right.appendChild(a);
    }

    top.appendChild(left);
    top.appendChild(right);

    card.appendChild(top);
    listEl.appendChild(card);
  }
}

async function init(){
  $('#backBtn')?.addEventListener('click', () => history.back());

  const homeBtn = $('#homeBtn');
  if (homeBtn) homeBtn.href = withV(rel + 'home_student.html');

  $('#loadMore')?.addEventListener('click', () => loadMore());

  // первая загрузка
  await loadMore();
}

document.addEventListener('DOMContentLoaded', init);
