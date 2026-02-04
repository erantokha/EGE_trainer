// tasks/my_homeworks.js
// MVP: вкладка "Мои ДЗ" на странице ученика (home_student.html)

const BUILD = document.querySelector('meta[name="app-build"]')?.content?.trim() || '';
const withV = (p) => BUILD ? `${p}${p.includes('?') ? '&' : '?'}v=${encodeURIComponent(BUILD)}` : p;

const inTasks = /\/tasks(\/|$)/.test(location.pathname);
const rel = inTasks ? '../' : './';

const $ = (sel, root = document) => root.querySelector(sel);

const STORAGE_KEY = 'ege:home_student:tab';
let MYHW_LOADED = false;

function isHidden(el){
  return !el || el.hidden || el.classList.contains('hidden') || getComputedStyle(el).display === 'none';
}

function isMissingRpc(err){
  try{
    const m = String(err?.data?.message || err?.message || '');
    return m.includes('PGRST202') || m.toLowerCase().includes('could not find the function');
  }catch(_){
    return false;
  }
}

function fmtDateTime(x){
  if (!x) return '';
  const d = (x instanceof Date) ? x : new Date(String(x));
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const yy = String(d.getFullYear());
  const hh = String(d.getHours()).padStart(2,'0');
  const mi = String(d.getMinutes()).padStart(2,'0');
  return `${dd}.${mm}.${yy} ${hh}:${mi}`;
}

function hwUrl(token){
  const t = String(token || '').trim();
  if (!t) return '';
  const u = new URL(rel + 'tasks/hw.html', location.href);
  u.searchParams.set('token', t);
  if (BUILD) u.searchParams.set('v', BUILD);
  return u.toString();
}

function normalizeSummary(raw){
  let items = [];
  let pending = null;
  let total = null;
  let archive = null;

  if (Array.isArray(raw)) {
    items = raw;
  } else if (raw && typeof raw === 'object') {
    if (Array.isArray(raw.items)) items = raw.items;
    else if (Array.isArray(raw.latest)) items = raw.latest;
    else if (Array.isArray(raw.rows)) items = raw.rows;
    else if (Array.isArray(raw.data)) items = raw.data;

    if (raw.pending_count != null) pending = Number(raw.pending_count);
    else if (raw.pending != null) pending = Number(raw.pending);

    if (raw.total_count != null) total = Number(raw.total_count);
    else if (raw.total != null) total = Number(raw.total);

    if (raw.archive_count != null) archive = Number(raw.archive_count);
    else if (raw.archive != null) archive = Number(raw.archive);
  }

  items = (items || []).filter(Boolean);

  let pendingComputed = 0;
  for (const it of items) {
    const isSub = Boolean(it.is_submitted ?? it.submitted ?? it.is_done ?? it.done) || Boolean(it.submitted_at || it.finished_at || it.completed_at);
    it.__is_submitted = isSub;
    if (!isSub) pendingComputed += 1;
  }

  if (!Number.isFinite(pending)) pending = pendingComputed;
  if (!Number.isFinite(total)) total = items.length;
  if (!Number.isFinite(archive)) archive = Math.max(0, total - items.length);

  return { items, pending_count: pending, total_count: total, archive_count: archive };
}

function setBell(visible){
  const bell = $('#myHwBell');
  if (!bell) return;
  bell.classList.toggle('hidden', !visible);
}

function setStatus(text){
  const el = $('#myHwStatus');
  if (el) el.textContent = text || '';
}

function setEmpty(text){
  const el = $('#myHwEmpty');
  if (el) el.textContent = text || '';
}

function setArchiveHref(){
  const a = $('#myHwArchiveLink');
  if (!a) return;
  a.href = withV(rel + 'tasks/my_homeworks_archive.html');
}

function renderItems(items){
  const list = $('#myHwList');
  if (!list) return;
  list.innerHTML = '';

  for (const it of items) {
    const title = String(it.title || it.homework_title || it.name || 'Домашняя работа').trim();
    const assignedAt = fmtDateTime(it.assigned_at || it.created_at || it.link_created_at);
    const submittedAt = fmtDateTime(it.submitted_at || it.finished_at || it.completed_at);
    const isSubmitted = Boolean(it.__is_submitted);

    const token = it.token || it.link_token || it.hw_token || it.student_token;
    const url = hwUrl(token);

    const card = document.createElement('div');
    card.className = 'myhw-card';

    const top = document.createElement('div');
    top.className = 'myhw-card-top';

    const left = document.createElement('div');

    const h = document.createElement('h3');
    h.className = 'myhw-title';
    h.textContent = title;
    left.appendChild(h);

    const meta = document.createElement('div');
    meta.className = 'myhw-meta';
    const parts = [];
    if (assignedAt) parts.push(`Назначено: ${assignedAt}`);
    if (submittedAt) parts.push(`Сдано: ${submittedAt}`);
    meta.textContent = parts.join(' • ');
    left.appendChild(meta);

    const right = document.createElement('div');
    right.className = 'myhw-actions';

    const badge = document.createElement('span');
    badge.className = 'myhw-badge ' + (isSubmitted ? 'ok' : 'bad');
    badge.textContent = isSubmitted ? 'Сдано' : 'Не сдано';
    right.appendChild(badge);

    const open = document.createElement('a');
    open.className = 'btn small';
    open.textContent = 'Открыть';
    if (url) {
      open.href = url;
    } else {
      open.href = '#';
      open.setAttribute('aria-disabled', 'true');
      open.addEventListener('click', (e) => e.preventDefault());
    }
    right.appendChild(open);

    top.appendChild(left);
    top.appendChild(right);
    card.appendChild(top);

    list.appendChild(card);
  }
}

async function getApi(){
  return import(withV(rel + 'app/providers/homework.js'));
}

async function loadSummary(){
  setArchiveHref();

  setStatus('Загружаем...');
  setEmpty('');

  try{
    const api = await getApi();
    const res = await api.getStudentMyHomeworksSummary({ limit: 10 });
    if (!res?.ok) {
      const err = res?.error || {};
      if (String(err?.message || '') === 'NOT_AUTHORIZED') {
        setStatus('Войдите, чтобы увидеть ДЗ.');
        setBell(false);
        renderItems([]);
        setEmpty('');
        return;
      }
      if (isMissingRpc(err)) {
        setStatus('Функция «Мои ДЗ» станет доступна после обновления сервера.');
      } else {
        const msg = String(err?.data?.message || err?.message || '');
        setStatus('Не удалось загрузить ДЗ.' + (msg ? ` ${msg}` : ''));
      }
      setBell(false);
      renderItems([]);
      setEmpty('');
      return;
    }

    const { items, pending_count, archive_count } = normalizeSummary(res.data);
    setBell(pending_count > 0);

    renderItems(items);

    if (!items.length) {
      setStatus('');
      setEmpty('ДЗ пока нет.');
    } else {
      const arch = archive_count > 0 ? ` В архиве: ${archive_count}.` : '';
      setStatus(`Показаны последние ${Math.min(10, items.length)}.${arch}`);
      setEmpty('');
    }

    MYHW_LOADED = true;
  } catch(e){
    console.warn('my_homeworks loadSummary error', e);
    setBell(false);
    setStatus('Не удалось загрузить ДЗ.');
  }
}

function setTab(view){
  const tabA = $('#tabTraining');
  const tabB = $('#tabMyHw');
  const vA = $('#viewTraining');
  const vB = $('#viewMyHw');

  const isMy = view === 'myhw';

  if (tabA) {
    tabA.classList.toggle('active', !isMy);
    tabA.setAttribute('aria-selected', (!isMy).toString());
  }
  if (tabB) {
    tabB.classList.toggle('active', isMy);
    tabB.setAttribute('aria-selected', (isMy).toString());
  }

  if (vA) vA.hidden = isMy;
  if (vB) vB.hidden = !isMy;

  try{ localStorage.setItem(STORAGE_KEY, isMy ? 'myhw' : 'training'); }catch(_){ }

  if (isMy && !MYHW_LOADED) loadSummary();
}

function init(){
  const tabs = $('#homeTabs');
  const tabA = $('#tabTraining');
  const tabB = $('#tabMyHw');

  if (!tabs || !tabA || !tabB) return;

  tabA.addEventListener('click', () => setTab('training'));
  tabB.addEventListener('click', () => setTab('myhw'));

  $('#myHwRefresh')?.addEventListener('click', () => loadSummary());

  // при загрузке — восстанавливаем последнюю вкладку
  let saved = 'training';
  try{ saved = localStorage.getItem(STORAGE_KEY) || 'training'; }catch(_){ }
  setTab(saved === 'myhw' ? 'myhw' : 'training');

  // Пытаемся загрузить счётчик (и колокольчик) в фоне, даже если вкладка не открыта.
  // Если RPC ещё не готов — просто ничего не показываем.
  loadSummary().catch(() => {});
}

document.addEventListener('DOMContentLoaded', init);
