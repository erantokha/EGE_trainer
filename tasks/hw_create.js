// tasks/hw_create.js
// Создание ДЗ (MVP): вручную выбранные задачи + опциональная добивка по разделам.
// После создания выдаёт ссылку /tasks/hw.html?token=...

import { CONFIG } from '../app/config.js';

const $ = (sel, root = document) => root.querySelector(sel);

const INDEX_URL = '../content/tasks/index.json';

function sbHeaders(extra = {}) {
  return {
    apikey: CONFIG.supabase.anonKey,
    Authorization: `Bearer ${CONFIG.supabase.anonKey}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

function normNameForKey(s) {
  return String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function compareId(a, b) {
  const as = String(a).split('.').map(Number);
  const bs = String(b).split('.').map(Number);
  const L = Math.max(as.length, bs.length);
  for (let i = 0; i < L; i++) {
    const ai = as[i] ?? 0;
    const bi = bs[i] ?? 0;
    if (ai !== bi) return ai - bi;
  }
  return 0;
}

function inferTopicIdFromQuestionId(qid) {
  const parts = String(qid || '').trim().split('.');
  if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
  return '';
}

function parseImportLines(text) {
  const out = [];
  const lines = String(text ?? '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);

  for (const line of lines) {
    const cols = line.split(/[\s;|,]+/).map(s => s.trim()).filter(Boolean);
    if (!cols.length) continue;

    if (cols.length === 1) {
      const question_id = cols[0];
      const topic_id = inferTopicIdFromQuestionId(question_id);
      out.push({ topic_id, question_id });
    } else {
      // берём первые 2 токена: topic_id question_id
      const topic_id = cols[0];
      const question_id = cols[1];
      out.push({ topic_id, question_id });
    }
  }
  return out;
}

function makeToken() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a).map(x => x.toString(16).padStart(2, '0')).join('');
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// ---------- Supabase REST ----------
async function createHomeworkRow({ title, description, spec_json, settings_json }) {
  const url = `${CONFIG.supabase.url}/rest/v1/homeworks`;
  const res = await fetch(url, {
    method: 'POST',
    headers: sbHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify({ title, description, spec_json, settings_json }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, error: data || (await res.text()) };
  const row = Array.isArray(data) ? data[0] : data;
  return { ok: true, row };
}

async function createHomeworkLinkRow({ homework_id, token }) {
  const url = `${CONFIG.supabase.url}/rest/v1/homework_links`;
  const res = await fetch(url, {
    method: 'POST',
    headers: sbHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify({ homework_id, token, is_active: true }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, error: data || (await res.text()) };
  const row = Array.isArray(data) ? data[0] : data;
  return { ok: true, row };
}

// ---------- UI helpers ----------
function setStatus(msg) {
  const el = $('#status');
  if (el) el.textContent = msg || '';
}

function makeRow({ topic_id = '', question_id = '' } = {}) {
  const tr = document.createElement('tr');

  const tdQ = document.createElement('td');
  tdQ.style.padding = '8px';
  tdQ.style.borderBottom = '1px solid var(--border)';
  const q = document.createElement('input');
  q.className = 'input';
  q.type = 'text';
  q.placeholder = 'например 8.1.1.17';
  q.value = question_id;
  q.style.width = '100%';
  tdQ.appendChild(q);

  const tdT = document.createElement('td');
  tdT.style.padding = '8px';
  tdT.style.borderBottom = '1px solid var(--border)';
  const t = document.createElement('input');
  t.className = 'input';
  t.type = 'text';
  t.placeholder = 'например 8.1';
  t.value = topic_id;
  t.style.width = '100%';
  tdT.appendChild(t);

  const tdDel = document.createElement('td');
  tdDel.style.padding = '8px';
  tdDel.style.borderBottom = '1px solid var(--border)';
  const del = document.createElement('button');
  del.className = 'btn';
  del.type = 'button';
  del.textContent = '×';
  del.addEventListener('click', () => tr.remove());
  tdDel.appendChild(del);

  // автозаполнение topic_id по question_id
  q.addEventListener('input', () => {
    const inferred = inferTopicIdFromQuestionId(q.value);
    if (inferred && (!t.value || t.value === inferTopicIdFromQuestionId(t.value))) {
      // заполняем только если topic_id пустой или похож на автогенерируемый
      t.value = inferred;
    }
  });

  tr.appendChild(tdQ);
  tr.appendChild(tdT);
  tr.appendChild(tdDel);

  tr._get = () => ({
    question_id: String(q.value || '').trim(),
    topic_id: String(t.value || '').trim(),
  });

  return tr;
}

function readFixedRows() {
  const rows = [];
  const trs = Array.from($('#fixedTbody')?.children || []);
  for (const tr of trs) {
    if (!tr._get) continue;
    const { topic_id, question_id } = tr._get();
    if (!question_id) continue;
    rows.push({
      topic_id: topic_id || inferTopicIdFromQuestionId(question_id),
      question_id,
    });
  }
  // фильтр мусора
  return rows.filter(x => x.topic_id && x.question_id);
}

function readSectionsGenerated() {
  const enabled = $('#enableGenerated')?.checked;
  if (!enabled) return null;

  const secInputs = Array.from(document.querySelectorAll('[data-sec-id]'));
  const sections = {};
  for (const inp of secInputs) {
    const id = inp.getAttribute('data-sec-id');
    const v = Number(String(inp.value || '0').replace(',', '.'));
    const n = Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
    if (n > 0) sections[id] = n;
  }
  if (!Object.keys(sections).length) return null;

  return { by: 'sections', sections, topics: null };
}

async function loadSectionsUI() {
  const res = await fetch(INDEX_URL, { cache: 'force-cache' });
  if (!res.ok) throw new Error(`index.json not found: ${res.status}`);
  const catalog = await res.json();

  const sections = (catalog || []).filter(x => x.type === 'group').sort((a, b) => compareId(a.id, b.id));
  const host = $('#sectionsGrid');
  if (!host) return;

  host.innerHTML = '';
  for (const sec of sections) {
    const card = document.createElement('div');
    card.className = 'panel';
    card.style.padding = '10px';
    card.style.background = 'var(--panel-2)';

    const title = document.createElement('div');
    title.textContent = `${sec.id}. ${sec.title}`;
    title.style.marginBottom = '6px';

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '8px';
    row.style.alignItems = 'center';

    const inp = document.createElement('input');
    inp.className = 'input';
    inp.type = 'number';
    inp.min = '0';
    inp.step = '1';
    inp.value = '0';
    inp.setAttribute('data-sec-id', sec.id);
    inp.style.width = '90px';

    const hint = document.createElement('div');
    hint.style.opacity = '.8';
    hint.textContent = 'шт.';

    row.appendChild(inp);
    row.appendChild(hint);

    card.appendChild(title);
    card.appendChild(row);
    host.appendChild(card);
  }
}

function buildStudentLink(token) {
  const u = new URL('./hw.html', location.href);
  u.searchParams.set('token', token);
  return u.href;
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    return false;
  }
}

// ---------- init ----------
document.addEventListener('DOMContentLoaded', async () => {
  // стартовые строки (можно оставить одну пустую)
  const tbody = $('#fixedTbody');
  if (tbody) tbody.appendChild(makeRow());

  $('#addRowBtn')?.addEventListener('click', () => {
    $('#fixedTbody')?.appendChild(makeRow());
  });

  // импорт
  $('#importBtn')?.addEventListener('click', () => {
    const box = $('#importBox');
    if (box) box.style.display = box.style.display === 'none' ? 'block' : 'none';
  });
  $('#cancelImportBtn')?.addEventListener('click', () => {
    const box = $('#importBox');
    if (box) box.style.display = 'none';
  });
  $('#applyImportBtn')?.addEventListener('click', () => {
    const text = $('#importText')?.value || '';
    const parsed = parseImportLines(text);
    for (const row of parsed) $('#fixedTbody')?.appendChild(makeRow(row));
    const box = $('#importBox');
    if (box) box.style.display = 'none';
    if ($('#importText')) $('#importText').value = '';
  });

  // добивка
  $('#enableGenerated')?.addEventListener('change', async (e) => {
    const on = !!e.target.checked;
    const box = $('#generatedBox');
    if (box) box.style.display = on ? 'block' : 'none';
    if (on) {
      try {
        await loadSectionsUI();
      } catch (err) {
        console.error(err);
        setStatus('Не удалось загрузить список разделов (index.json).');
      }
    }
  });

  // создание
  $('#createBtn')?.addEventListener('click', async () => {
    setStatus('');
    const title = String($('#title')?.value || '').trim();
    const description = String($('#description')?.value || '').trim() || null;
    const shuffle = !!$('#shuffle')?.checked;

    const fixed = readFixedRows();
    const generated = readSectionsGenerated();

    if (!title) {
      setStatus('Укажи название ДЗ.');
      return;
    }
    if (!fixed.length && !generated) {
      setStatus('Добавь хотя бы одну задачу или включи добивку генерацией.');
      return;
    }

    const spec_json = {
      v: 1,
      content_version: todayISO(),
      fixed,
      generated: generated || null,
      shuffle,
    };

    const settings_json = {
      v: 1,
      max_attempts: 1,
      shuffle,
      show_answers: true,
      deadline: null,
    };

    $('#createBtn').disabled = true;
    try {
      setStatus('Создаём ДЗ...');
      const hwRes = await createHomeworkRow({ title, description, spec_json, settings_json });
      if (!hwRes.ok) {
        console.error(hwRes.error);
        setStatus('Ошибка создания ДЗ в Supabase. Проверь таблицу homeworks и RLS.');
        return;
      }

      const homework_id = hwRes.row?.id;
      if (!homework_id) {
        setStatus('ДЗ создано, но не удалось получить id.');
        return;
      }

      setStatus('Создаём ссылку...');
      const token = makeToken();
      const linkRes = await createHomeworkLinkRow({ homework_id, token });
      if (!linkRes.ok) {
        console.error(linkRes.error);
        setStatus('ДЗ создано, но не удалось создать ссылку. Проверь таблицу homework_links и RLS.');
        return;
      }

      const link = buildStudentLink(token);

      const resBox = $('#result');
      if (resBox) resBox.style.display = 'block';

      const linkInp = $('#resultLink');
      if (linkInp) linkInp.value = link;

      const meta = $('#resultMeta');
      if (meta) meta.textContent = `homework_id: ${homework_id}, token: ${token}`;

      $('#copyBtn')?.addEventListener('click', async () => {
        const ok = await copyToClipboard(link);
        setStatus(ok ? 'Ссылка скопирована.' : 'Не удалось скопировать ссылку. Скопируй вручную.');
      }, { once: true });

      $('#openBtn')?.addEventListener('click', () => {
        window.open(link, '_blank', 'noopener');
      }, { once: true });

      setStatus('Готово.');
    } finally {
      $('#createBtn').disabled = false;
    }
  });
});
