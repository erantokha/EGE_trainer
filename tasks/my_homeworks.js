// tasks/my_homeworks.js
// MVP: отдельная страница "Мои ДЗ" (последние 10)

const BUILD = document.querySelector('meta[name="app-build"]')?.content?.trim() || '';
const withV = (p) => BUILD ? `${p}${p.includes('?') ? '&' : '?'}v=${encodeURIComponent(BUILD)}` : p;

const $ = (sel, root = document) => root.querySelector(sel);

async function api(){
  // ВАЖНО: dynamic import резолвится относительно URL текущего модуля.
  // Поэтому используем абсолютный путь от корня.
  const mod = await import(withV('/app/providers/homework.js'));
  return mod;
}

function fmtDate(s){
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

function hwUrl(token){
  if (!token) return '';
  const u = new URL('./hw.html', location.href);
  u.searchParams.set('token', String(token));
  if (BUILD) u.searchParams.set('v', BUILD);
  return u.href;
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
    ttl.textContent = titleOf(it);

    const meta = document.createElement('div');
    meta.className = 'myhw-meta';
    const assigned = fmtDate(it?.assigned_at || it?.created_at || '');
    const submittedAt = fmtDate(it?.submitted_at || it?.finished_at || '');
    meta.textContent = assigned ? `Назначено: ${assigned}` : '';

    left.appendChild(ttl);
    left.appendChild(meta);

    const right = document.createElement('div');
    right.className = 'myhw-right';

    const badge = document.createElement('span');
    badge.className = 'myhw-badge ' + (submitted ? 'ok' : 'warn');
    badge.textContent = submitted ? 'Сдано' : 'Не сдано';

    right.appendChild(badge);

    if (submittedAt){
      const sub = document.createElement('div');
      sub.className = 'myhw-submitted';
      sub.textContent = `Сдано: ${submittedAt}`;
      right.appendChild(sub);
    }

    const actions = document.createElement('div');
    actions.className = 'myhw-actions-row';

    const a = document.createElement('a');
    a.className = 'btn small';
    a.href = href || '#';
    a.textContent = submitted ? 'Открыть отчёт' : 'Открыть';
    if (!href) a.classList.add('disabled');

    actions.appendChild(a);

    top.appendChild(left);
    top.appendChild(right);

    card.appendChild(top);
    card.appendChild(actions);

    listEl.appendChild(card);
  }
}

function setStatus(text){
  const el = $('#myHwStatus');
  if (el) el.textContent = String(text || '');
}

async function load(){
  setStatus('Загрузка…');

  let mod;
  try{
    mod = await api();
  } catch(e){
    console.warn('MyHW: cannot import provider', e);
    setStatus('Не удалось загрузить модуль ДЗ (обнови страницу).');
    return;
  }

  const { getStudentMyHomeworksSummary } = mod;
  if (typeof getStudentMyHomeworksSummary !== 'function'){
    setStatus('Сервер ещё не обновлён под "Мои ДЗ".');
    return;
  }

  const res = await getStudentMyHomeworksSummary({ limit: 10 });
  if (!res?.ok){
    const msg = (res?.error && (res.error.message || String(res.error))) || 'Ошибка загрузки ДЗ';
    setStatus('Не удалось загрузить ДЗ: ' + msg);
    return;
  }

  const data = res.data || {};
  const items = Array.isArray(data?.latest) ? data.latest : (Array.isArray(data) ? data : []);
  renderList(items);

  const pending = Number(data?.pending_count ?? 0);
  const total = Number(data?.total_count ?? items.length);
  const arch = Number(data?.archive_count ?? Math.max(0, total - items.length));

  const parts = [];
  if (pending > 0) parts.push(`Несданные: ${pending}`);
  parts.push(`Всего: ${total}`);
  setStatus(parts.join(' • '));

  const archLink = $('#archiveLink');
  if (archLink){
    archLink.textContent = arch > 0 ? `Архив (${arch})` : 'Архив';
  }
}

function init(){
  $('#refreshBtn')?.addEventListener('click', () => load());
  load();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
