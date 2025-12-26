// tasks/hw_create.js
// Создание ДЗ (MVP): задачи берутся из выбора на главном аккордеоне и попадают в "ручной список" (fixed).
// После создания выдаёт ссылку /tasks/hw.html?token=...

import { CONFIG } from '../app/config.js';
import { supabase, getSession, signInWithGoogle, signOut } from '../app/providers/supabase.js';
import { createHomework, createHomeworkLink } from '../app/providers/homework.js';
import {
  uniqueBaseCount,
  sampleKByBase,
  interleaveBatches,
} from '../app/core/pick.js';

const $ = (sel, root = document) => root.querySelector(sel);

const INDEX_URL = '../content/tasks/index.json';

// Выбор с главного аккордеона → автозаполнение "ручного списка" (fixed) на этой странице.
const HW_PREFILL_KEY = 'hw_create_prefill_v1';

function safeJsonParse(raw) {
  try { return JSON.parse(raw); } catch { return null; }
}
function normalizeCount(x) {
  const n = Math.floor(Number(x) || 0);
  return n > 0 ? n : 0;
}
function refKey(r) {
  const topic_id = r.topic_id || inferTopicIdFromQuestionId(r.question_id);
  return `${topic_id}::${r.question_id}`;
}


// Кэш каталога и манифестов (нужно, чтобы при создании ДЗ "заморозить" набор задач)
let CATALOG = null;
let SECTIONS = [];
let TOPIC_BY_ID = new Map();

async function loadCatalog() {
  if (CATALOG && SECTIONS.length) return;
  const res = await fetch(withV(INDEX_URL), { cache: 'force-cache' });
  if (!res.ok) throw new Error(`index.json not found: ${res.status}`);
  CATALOG = await res.json();

  const sections = (CATALOG || []).filter(x => x.type === 'group');
  const topics = (CATALOG || []).filter(x => !!x.parent && x.enabled !== false);

  const byId = (a, b) => compareId(a.id, b.id);

  TOPIC_BY_ID = new Map();
  for (const t of topics) TOPIC_BY_ID.set(t.id, t);

  for (const sec of sections) {
    sec.topics = topics.filter(t => t.parent === sec.id).sort(byId);
  }
  sections.sort(byId);
  SECTIONS = sections;
}

async function ensureManifest(topic) {
  if (!topic || !topic.path) return null;
  if (topic._manifest) return topic._manifest;
  if (topic._manifestPromise) return topic._manifestPromise;

  const url = new URL('../' + topic.path, location.href);
  const href = withV(url.href);

  topic._manifestPromise = (async () => {
    const resp = await fetch(href, { cache: 'force-cache' });
    if (!resp.ok) return null;
    const j = await resp.json();
    topic._manifest = j;
    return j;
  })();

  return topic._manifestPromise;
}

function withV(url) {
  const v = CONFIG?.content?.version;
  if (!v) return url;
  const u = new URL(url, location.href);
  if (!u.searchParams.has('v')) u.searchParams.set('v', v);
  return u.href;
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

// ---------- UI helpers ----------
function setStatus(msg) {
  const el = $('#status');
  if (el) el.textContent = msg || '';
}

function ensureAuthBar() {
  const controls = document.querySelector('.controls');
  if (!controls) return;

  if ($('#authBar')) return;

  const wrap = document.createElement('span');
  wrap.id = 'authBar';
  wrap.style.display = 'inline-flex';
  wrap.style.gap = '8px';
  wrap.style.alignItems = 'center';
  wrap.style.flexWrap = 'wrap';

  const label = document.createElement('span');
  label.id = 'authLabel';
  label.style.opacity = '.85';
  label.textContent = 'Проверяем вход...';

  const loginBtn = document.createElement('button');
  loginBtn.id = 'loginGoogleBtn';
  loginBtn.className = 'btn';
  loginBtn.type = 'button';
  loginBtn.textContent = 'Войти через Google';
  loginBtn.addEventListener('click', async () => {
    try {
      setStatus('Открываем вход через Google...');
      await signInWithGoogle(location.href);
    } catch (e) {
      console.error(e);
      setStatus('Не удалось начать вход через Google.');
    }
  });

  const logoutBtn = document.createElement('button');
  logoutBtn.id = 'logoutBtn';
  logoutBtn.className = 'btn';
  logoutBtn.type = 'button';
  logoutBtn.textContent = 'Выйти';
  logoutBtn.addEventListener('click', async () => {
    try {
      await signOut();
      location.reload();
    } catch (e) {
      console.error(e);
      setStatus('Не удалось выйти.');
    }
  });

  wrap.appendChild(label);
  wrap.appendChild(loginBtn);
  wrap.appendChild(logoutBtn);
  controls.appendChild(wrap);
}

async function refreshAuthUI() {
  ensureAuthBar();

  const session = await getSession().catch(() => null);
  const label = $('#authLabel');
  const loginBtn = $('#loginGoogleBtn');
  const logoutBtn = $('#logoutBtn');
  const createBtn = $('#createBtn');

  if (!session) {
    if (label) label.textContent = 'Вы не вошли. Нужен вход через Google (учитель).';
    if (loginBtn) loginBtn.style.display = '';
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (createBtn) createBtn.disabled = true;
    return null;
  }

  const email = session.user?.email || '';
  if (label) label.textContent = email ? `Вы вошли: ${email}` : 'Вы вошли';
  if (loginBtn) loginBtn.style.display = 'none';
  if (logoutBtn) logoutBtn.style.display = '';
  if (createBtn) createBtn.disabled = false;
  return session;
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

  q.addEventListener('input', () => {
    const inferred = inferTopicIdFromQuestionId(q.value);
    if (inferred && (!t.value || t.value === inferTopicIdFromQuestionId(t.value))) {
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
  return rows.filter(x => x.topic_id && x.question_id);
}


async function importSelectionIntoFixedTable() {
  const raw = sessionStorage.getItem(HW_PREFILL_KEY);
  if (!raw) return;

  // убираем сразу, чтобы при reload не применялось повторно
  sessionStorage.removeItem(HW_PREFILL_KEY);

  const prefill = safeJsonParse(raw);
  if (!prefill || prefill.v !== 1) return;

  // переносим флаг перемешивания
  const sh = $('#shuffle');
  if (sh && typeof prefill.shuffle === 'boolean') sh.checked = prefill.shuffle;

  await loadCatalog();

  const wanted = [];
  if (prefill.by === 'topics') {
    for (const [topicId, cntRaw] of Object.entries(prefill.topics || {})) {
      const n = normalizeCount(cntRaw);
      if (!n) continue;

      const topic = TOPIC_BY_ID.get(String(topicId));
      if (!topic) continue;

      const man = await ensureManifest(topic);
      if (!man) continue;

      wanted.push(...pickRefsFromManifest(man, n));
    }
  } else {
    for (const [secId, cntRaw] of Object.entries(prefill.sections || {})) {
      const n = normalizeCount(cntRaw);
      if (!n) continue;

      const sec = SECTIONS.find(s => String(s.id) === String(secId));
      if (!sec) continue;

      wanted.push(...(await pickRefsFromSection(sec, n)));
    }
  }

  // дедуп
  const uniq = [];
  const seen = new Set();
  for (const r of wanted) {
    const key = refKey(r);
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push({
      topic_id: r.topic_id || inferTopicIdFromQuestionId(r.question_id),
      question_id: r.question_id,
    });
  }

  if (!uniq.length) {
    setStatus('Не удалось импортировать задачи из выбора на главной странице.');
    return;
  }

  // заполняем таблицу: список задач + 1 пустая строка в конце
  const tbody = $('#fixedTbody');
  if (!tbody) return;

  tbody.innerHTML = '';
  for (const r of uniq) tbody.appendChild(makeRow(r));
  tbody.appendChild(makeRow());

  setStatus(`Добавлено из аккордеона: ${uniq.length} задач(и). Можно добавить ещё вручную.`);
}



// ---------- генерация и заморозка задач (чтобы ДЗ было одинаковым для всех учеников) ----------
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function sumMapValues(m) {
  let s = 0;
  for (const v of m.values()) s += v;
  return s;
}

function distributeNonNegative(buckets, total) {
  // buckets: [{id,cap}]
  const out = new Map(buckets.map(b => [b.id, 0]));
  let left = total;
  let i = 0;
  while (left > 0 && buckets.some(b => out.get(b.id) < b.cap)) {
    const b = buckets[i % buckets.length];
    if (out.get(b.id) < b.cap) {
      out.set(b.id, out.get(b.id) + 1);
      left--;
    }
    i++;
  }
  return out;
}

function totalUniqueCap(man) {
  return (man.types || []).reduce(
    (s, t) => s + uniqueBaseCount(t.prototypes || []),
    0,
  );
}

function totalRawCap(man) {
  return (man.types || []).reduce(
    (s, t) => s + ((t.prototypes || []).length),
    0,
  );
}

function buildRef(manifest, proto) {
  return {
    topic_id: manifest.topic || inferTopicIdFromQuestionId(proto.id),
    question_id: proto.id,
  };
}

function pickRefsFromManifest(man, want) {
  const out = [];
  const types = (man.types || []).filter(t => (t.prototypes || []).length > 0);
  if (!types.length) return out;

  const max = totalRawCap(man);
  const need = Math.min(Math.max(0, want || 0), max);
  if (!need) return out;

  const capsU = types.map(t => ({ id: t.id, cap: uniqueBaseCount(t.prototypes || []) }));
  const capsR = types.map(t => ({ id: t.id, cap: (t.prototypes || []).length }));

  shuffle(capsU);
  shuffle(capsR);

  const uniqueBudget = Math.min(need, totalUniqueCap(man));
  const planU = distributeNonNegative(capsU, uniqueBudget);
  const left = need - sumMapValues(planU);
  const planR = left > 0 ? distributeNonNegative(capsR, left) : new Map();

  for (const typ of types) {
    const k = (planU.get(typ.id) || 0) + (planR.get(typ.id) || 0);
    if (!k) continue;
    for (const p of sampleKByBase(typ.prototypes || [], k)) {
      out.push(buildRef(man, p));
    }
  }

  return out;
}

async function pickRefsFromSection(sec, wantSection) {
  const out = [];
  const candidates = (sec.topics || []).filter(t => !!t.path);
  shuffle(candidates);

  // Загружаем не одну тему, а несколько (иначе при огромном cap после размножения
  // всё ДЗ может собраться из 1 подтемы).
  const minTopics =
    wantSection <= 1
      ? 1
      : Math.min(candidates.length, Math.max(2, Math.min(8, Math.ceil(wantSection / 2))));

  const loaded = [];
  let capU = 0;
  let capR = 0;

  for (const topic of candidates) {
    if (loaded.length >= minTopics && capR >= wantSection) break;
    const man = await ensureManifest(topic);
    if (!man) continue;
    const u = totalUniqueCap(man);
    const r = totalRawCap(man);
    if (r <= 0) continue;
    loaded.push({ id: topic.id, man, capU: u, capR: r });
    capU += u;
    capR += r;
  }
  if (!loaded.length) return out;

  const bucketsU = loaded.map(x => ({ id: x.id, cap: x.capU }));
  const bucketsR = loaded.map(x => ({ id: x.id, cap: x.capR }));
  shuffle(bucketsU);
  shuffle(bucketsR);

  const uniqueBudget = Math.min(wantSection, capU);
  const planU = distributeNonNegative(bucketsU, uniqueBudget);
  const left = wantSection - sumMapValues(planU);
  const planR = left > 0 ? distributeNonNegative(bucketsR, left) : new Map();

  const batches = new Map();
  for (const x of loaded) {
    const wantT = (planU.get(x.id) || 0) + (planR.get(x.id) || 0);
    if (!wantT) continue;
    batches.set(x.id, pickRefsFromManifest(x.man, wantT));
  }

  // Перемешиваем порядок, но так, чтобы было 1+1+1+... по подтемам насколько возможно
  // (interleaveBatches делает круговой обход).
  const inter = interleaveBatches(batches, wantSection);
  out.push(...inter);
  return out;
}

async function freezeHomeworkQuestions(spec_json) {
  const frozen = [];
  const used = new Set();

  const pushRef = (r) => {
    if (!r || !r.question_id) return;
    const topic_id = r.topic_id || inferTopicIdFromQuestionId(r.question_id);
    const key = `${topic_id}::${r.question_id}`;
    if (used.has(key)) return;
    used.add(key);
    frozen.push({ topic_id, question_id: r.question_id });
  };

  // 1) фиксированные (ручные)
  for (const r of spec_json?.fixed || []) pushRef(r);
  }

  if (spec_json?.shuffle) shuffle(frozen);
  return frozen;
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
  // auth
  await refreshAuthUI();
  // обновление статуса при входе/выходе в другой вкладке
  supabase.auth.onAuthStateChange(() => { refreshAuthUI(); });

  // стартовые строки
  const tbody = $('#fixedTbody');
  if (tbody) tbody.appendChild(makeRow());

  // если пришли с главной страницы аккордеона (выбраны количества) — импортируем сразу
  await importSelectionIntoFixedTable();

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

  // создание
  $('#createBtn')?.addEventListener('click', async () => {
    setStatus('');

    // защита: без входа не даём создавать
    const session = await refreshAuthUI();
    if (!session) {
      setStatus('Нужно войти через Google (учитель), чтобы создавать ДЗ.');
      return;
    }

    const title = String($('#title')?.value || '').trim();
    const description = String($('#description')?.value || '').trim() || null;
    const shuffle = !!$('#shuffle')?.checked;

    const fixed = readFixedRows();

    if (!title) {
      setStatus('Укажи название ДЗ.');
      return;
    }
    if (!fixed.length) {
      setStatus('Добавь хотя бы одну задачу (или выбери их на главной странице и нажми «Создать ДЗ»).');
      return;
    }

    const spec_json = {
      v: 1,
      content_version: CONFIG?.content?.version || todayISO(),
      fixed,
      generated: null,
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
      // 1) фиксируем список задач (иначе добивка будет меняться при каждом открытии)
      setStatus('Фиксируем список задач...');
      const frozen_questions = await freezeHomeworkQuestions(spec_json);
      if (!Array.isArray(frozen_questions) || frozen_questions.length === 0) {
        setStatus('Не удалось зафиксировать список задач (пустой список). Проверь выбор и манифесты.');
        return;
      }

      // 2) сохраняем ДЗ в Supabase
      setStatus('Создаём ДЗ...');

      const hwRes = await createHomework({
        title,
        description,
        spec_json,
        settings_json,
        frozen_questions,
        // seed можно не использовать в варианте 1
        seed: null,
        attempts_per_student: 1,
        is_active: true,
      });

if (!hwRes.ok) {
  // Показываем реальную ошибку от PostgREST (очень помогает без консоли)
  const err = hwRes.error || {};
  const status = err.status ?? '—';
  const msg =
    err?.data?.message ||
    err?.data?.hint ||
    err?.data?.details ||
    err?.message ||
    JSON.stringify(err);

  setStatus(`Ошибка создания ДЗ в Supabase (HTTP ${status}): ${msg}`);
  return;
}

      const homework_id = hwRes.row?.id;
      if (!homework_id) {
        setStatus('ДЗ создано, но не удалось получить id.');
        return;
      }

      setStatus('Создаём ссылку...');
      const token = makeToken();

      const linkRes = await createHomeworkLink({ homework_id, token, is_active: true });
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

      $('#copyBtn')?.addEventListener(
        'click',
        async () => {
          const ok = await copyToClipboard(link);
          setStatus(ok ? 'Ссылка скопирована.' : 'Не удалось скопировать ссылку. Скопируй вручную.');
        },
        { once: true },
      );

      $('#openBtn')?.addEventListener(
        'click',
        () => {
          window.open(link, '_blank', 'noopener');
        },
        { once: true },
      );

      setStatus('Готово.');
    } finally {
      $('#createBtn').disabled = false;
    }
  });
});
