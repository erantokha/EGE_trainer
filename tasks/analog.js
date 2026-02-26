// tasks/analog.js
// Тест из одного задания: "аналог" к задаче из отчёта ДЗ.
// Источник: sessionStorage['analog_request_v1'] (topic_id + base_question_id)

import { withBuild } from '../app/build.js?v=2026-02-27-8';
import { safeEvalExpr } from '../app/core/safe_expr.mjs?v=2026-02-27-8';
import { setStem } from '../app/ui/safe_dom.js?v=2026-02-27-8';
import { insertAttempt } from '../app/providers/supabase-write.js?v=2026-02-27-8';
import { hydrateVideoLinks, wireVideoSolutionModal } from '../app/video_solutions.js?v=2026-02-27-8';

const $ = (sel, root = document) => root.querySelector(sel);

const INDEX_URL = '../content/tasks/index.json';
const REQ_KEY = 'analog_request_v1';
const SESSION_KEY = 'analog_session_v1';

// Внутрисессионное состояние (живёт на странице; дублируем в sessionStorage для bfcache/refresh)
let REQ = null;
let ASESSION = null;

let SESSION = {
  started_at: null,
  topic_id: '',
  base_question_id: '',
  return_url: '',
  questions: [],
  meta: {},
};

let REVIEW_ONLY_WRONG = false;

function diagReady() {
  try { window.__EGE_DIAG__?.markReady?.(); } catch (_) {}
}

document.addEventListener('DOMContentLoaded', () => {
  // Убираем ложный E_INIT_TIMEOUT, если страница уже интерактивна.
  diagReady();

  main()
    .catch((e) => {
      console.error(e);
      showMsg('Ошибка: ' + (e && e.message ? e.message : String(e)));
    })
    .finally(() => {
      diagReady();
    });
});

function showMsg(text) {
  const el = $('#analogMsg');
  if (el) el.textContent = text || '';
}

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function asset(p) {
  return (typeof p === 'string' && p.startsWith('content/')) ? '../' + p : p;
}

async function fetchJson(urlLike) {
  const resp = await fetch(withBuild(urlLike), { cache: 'force-cache' });
  if (!resp.ok) {
    throw new Error(`Не удалось загрузить ${urlLike} (HTTP ${resp.status})`);
  }
  return await resp.json();
}

function readRequest() {
  let raw = '';
  try { raw = sessionStorage.getItem(REQ_KEY) || ''; } catch (_) {}
  if (!raw) return null;

  let req = null;
  try { req = JSON.parse(raw); } catch (_) { return null; }

  const topic_id = String(req.topic_id || '').trim();
  const base_question_id = String(req.base_question_id || '').trim();
  const ts = Number(req.ts || 0);

  // защищаемся от "зависших" запросов
  if (!topic_id || !base_question_id) return null;
  if (ts && (Date.now() - ts) > 1000 * 60 * 60 * 6) {
    try { sessionStorage.removeItem(REQ_KEY); } catch (_) {}
    return null;
  }

  return {
    v: req.v || 1,
    topic_id,
    base_question_id,
    return_url: String(req.return_url || '').trim(),
    seed: Number(req.seed || 0) | 0,
    ts,
  };
}

function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function readAnalogSession(req) {
  // Храним только для текущего "запуска" (ts из request). Если пришёл новый request — сбрасываем used.
  let raw = '';
  try { raw = sessionStorage.getItem(SESSION_KEY) || ''; } catch (_) {}
  if (!raw) {
    return {
      v: 1,
      req_ts: req.ts || 0,
      topic_id: req.topic_id,
      base_question_id: req.base_question_id,
      type_id: '',
      type_title: '',
      used_proto_ids: [],
    };
  }

  let s = null;
  try { s = JSON.parse(raw); } catch (_) { s = null; }

  if (!s || typeof s !== 'object') {
    return {
      v: 1,
      req_ts: req.ts || 0,
      topic_id: req.topic_id,
      base_question_id: req.base_question_id,
      type_id: '',
      type_title: '',
      used_proto_ids: [],
    };
  }

  const same =
    String(s.topic_id || '') === req.topic_id &&
    String(s.base_question_id || '') === req.base_question_id &&
    Number(s.req_ts || 0) === Number(req.ts || 0);

  if (!same) {
    return {
      v: 1,
      req_ts: req.ts || 0,
      topic_id: req.topic_id,
      base_question_id: req.base_question_id,
      type_id: '',
      type_title: '',
      used_proto_ids: [],
    };
  }

  return {
    v: 1,
    req_ts: Number(s.req_ts || 0),
    topic_id: req.topic_id,
    base_question_id: req.base_question_id,
    type_id: String(s.type_id || ''),
    type_title: String(s.type_title || ''),
    used_proto_ids: Array.isArray(s.used_proto_ids) ? s.used_proto_ids.map(x => String(x || '')).filter(Boolean) : [],
  };
}

function saveAnalogSession(s) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (_) {}
}

// ----- Интерполяция stem_template / stem -----
// В манифестах встречаются как числовые параметры, так и строковые (например LaTeX-выражения).
// Важно: строковые параметры нельзя пытаться "вычислять" через eval — иначе получаем пустые вставки ("вектора .").
//
// Правило:
// - ${a} -> если a есть в vars, подставляем как есть (number|string)
// - ${a+b} -> пробуем посчитать только в контексте ЧИСЛОВЫХ vars (числа + строки, похожие на числа).
function interpolate(template, vars) {
  const V = (vars && typeof vars === 'object') ? vars : {};
  const numericCtx = {};
  for (const [k, v] of Object.entries(V)) {
    if (typeof v === 'number' && Number.isFinite(v)) numericCtx[k] = v;
    else if (typeof v === 'string') {
      const s = v.trim().replace(',', '.');
      const num = Number(s);
      if (Number.isFinite(num) && s !== '') numericCtx[k] = num;
    }
  }

  return String(template ?? '').replace(/\$\{([^}]+)\}/g, (_, expr) => {
    const e = String(expr || '').trim();
    if (!e) return '';

    // простой идентификатор -> прямой доступ (включая LaTeX-строки)
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(e) && Object.prototype.hasOwnProperty.call(V, e)) {
      const v = V[e];
      return (v == null) ? '' : String(v);
    }

    // выражение -> считаем только на numericCtx
    try {
      const v = safeEvalExpr(e, numericCtx);
      return (v == null) ? '' : String(v);
    } catch (_) {
      return '';
    }
  });
}

function buildQuestion(manifest, type, proto) {
  const vars = proto && typeof proto.params === 'object' ? proto.params : {};
  const title = `${manifest.topic}. ${manifest.title || ''}`;
  const typeTitle = type && type.title ? type.title : '';

  const stemT = (proto && proto.stem)
    ? proto.stem
    : (type && type.stem_template)
      ? type.stem_template
      : (type && type.stem)
        ? type.stem
        : '';
  const stem = interpolate(stemT, vars);

  const norm = [
    ...((type && type.defaults && Array.isArray(type.defaults.normalize)) ? type.defaults.normalize : []),
    ...(Array.isArray(proto && proto.normalize) ? proto.normalize : []),
  ];

  const answerSpec = {
    ...((type && type.answer_spec) ? type.answer_spec : (type && type.defaults && type.defaults.answer_spec) ? type.defaults.answer_spec : {}),
    ...((proto && proto.answer_spec) ? proto.answer_spec : {}),
    normalize: norm,
  };

  const valSource = (proto && proto.answer != null) ? proto.answer : (type && type.answer != null) ? type.answer : null;

  if (valSource != null) {
    if (typeof valSource === 'object') Object.assign(answerSpec, valSource);
    else answerSpec.text = String(valSource);
  }

  // Фолбэк для старых манифестов без answer_spec
  if (!answerSpec.type) {
    const rawText =
      (valSource && typeof valSource === 'object' && valSource.text != null) ? String(valSource.text) :
      (typeof valSource === 'string') ? valSource :
      null;

    const rawValue =
      (valSource && typeof valSource === 'object' && typeof valSource.value === 'number') ? valSource.value :
      null;

    if (rawValue != null) {
      answerSpec.type = 'number';
      answerSpec.value = rawValue;
      if (!answerSpec.correct_text) answerSpec.correct_text = String(rawValue);
    } else if (rawText != null) {
      const t = rawText.trim();
      const num = Number(t.replace(',', '.'));
      if (Number.isFinite(num)) {
        answerSpec.type = 'number';
        answerSpec.value = num;
        if (!answerSpec.normalize.includes('comma_to_dot')) answerSpec.normalize = [...answerSpec.normalize, 'comma_to_dot'];
        if (!answerSpec.correct_text) answerSpec.correct_text = t;
      } else {
        answerSpec.type = 'string';
        answerSpec.accept = [{ exact: t }];
        if (!answerSpec.correct_text) answerSpec.correct_text = t;
      }
    } else {
      answerSpec.type = 'string';
      answerSpec.accept = [{ exact: '' }];
    }
  }

  const figure = (proto && proto.figure) || (type && type.figure) || null;

  // Текст правильного ответа для отчёта (в манифестах обычно лежит в proto.answer.text).
  // Ранее correct_text заполнялся только в фолбэке "без answer_spec", из-за чего в отчёте мог быть пустым.
  const correctText =
    (answerSpec && answerSpec.correct_text != null) ? String(answerSpec.correct_text) :
    (valSource && typeof valSource === 'object' && valSource.text != null) ? String(valSource.text) :
    (answerSpec && answerSpec.text != null) ? String(answerSpec.text) :
    (valSource && typeof valSource === 'object' && valSource.value != null) ? String(valSource.value) :
    (answerSpec && answerSpec.value != null) ? String(answerSpec.value) :
    (typeof valSource === 'string') ? valSource :
    '';

  if (correctText && !answerSpec.correct_text) {
    answerSpec.correct_text = correctText;
  }

  return {
    id: proto && proto.id ? proto.id : '',
    question_id: proto && proto.id ? proto.id : '',
    correct_text: correctText,
    topic_id: manifest.topic,
    title,
    type_id: type && type.id ? type.id : '',
    type_title: typeTitle,
    difficulty:
      (proto && proto.difficulty != null) ? proto.difficulty :
      (type && type.defaults && type.defaults.difficulty != null) ? type.defaults.difficulty :
      (type && type.difficulty != null) ? type.difficulty :
      null,
    stem,
    answer: valSource,
    answer_spec: answerSpec,
    figure,
    _manifest: manifest,
    _type: type,
    _proto: proto,
  };
}

// ---- Загрузка и подбор аналога ----
const _MANIFEST_CACHE = new Map(); // url -> manifest json
async function loadManifest(url) {
  if (_MANIFEST_CACHE.has(url)) return _MANIFEST_CACHE.get(url);
  const man = await fetchJson(url);
  _MANIFEST_CACHE.set(url, man);
  return man;
}

async function pickAnalogQuestion(req, sessionState) {
  const catalog = await fetchJson(INDEX_URL);
  const topicNode = Array.isArray(catalog) ? catalog.find((x) => x && x.id === req.topic_id) : null;
  if (!topicNode) {
    throw new Error('Тема не найдена в content/tasks/index.json: ' + req.topic_id);
  }

  const paths = [];
  if (typeof topicNode.path === 'string') paths.push(topicNode.path);
  if (Array.isArray(topicNode.paths)) paths.push(...topicNode.paths);

  if (!paths.length) {
    throw new Error('Для темы нет path/paths в index.json: ' + req.topic_id);
  }

  // Загружаем все манифесты темы (кэшируем)
  const manifests = [];
  for (const p of paths) {
    const u = asset(p);
    const man = await loadManifest(u);
    if (man && Array.isArray(man.types)) manifests.push(man);
  }
  if (!manifests.length) {
    throw new Error('Не удалось загрузить манифесты темы: ' + req.topic_id);
  }

  let baseManifest = null;
  let baseType = null;
  let baseProto = null;

  // Если type_id неизвестен — ищем базовый прототип и фиксируем type_id
  if (!sessionState.type_id) {
    for (const man of manifests) {
      for (const t of (man.types || [])) {
        if (!t || !Array.isArray(t.prototypes)) continue;
        for (const pr of (t.prototypes || [])) {
          if (pr && String(pr.id || '').trim() === req.base_question_id) {
            baseManifest = man;
            baseType = t;
            baseProto = pr;
            break;
          }
        }
        if (baseProto) break;
      }
      if (baseProto) break;
    }

    if (!baseProto || !baseType || !baseManifest) {
      throw new Error('Не удалось найти базовую задачу в манифестах темы. proto=' + req.base_question_id);
    }

    sessionState.type_id = String(baseType.id || '');
    sessionState.type_title = String(baseType.title || '');
    saveAnalogSession(sessionState);
  } else {
    // type_id известен: для "базы" нам ничего не нужно
  }

  const typeId = String(sessionState.type_id || '').trim();
  if (!typeId) {
    throw new Error('Не удалось определить подтему (type_id) для аналога.');
  }

  // Собираем кандидатов из ВСЕХ манифестов по этому type_id (в теме могут быть несколько paths)
  const exclude = new Set([req.base_question_id, ...(sessionState.used_proto_ids || [])]);

  const candidates = [];
  for (const man of manifests) {
    for (const t of (man.types || [])) {
      if (!t || String(t.id || '') !== typeId) continue;
      for (const pr of (t.prototypes || [])) {
        const id = String(pr && pr.id || '').trim();
        if (!id) continue;
        if (exclude.has(id)) continue;
        candidates.push({ man, t, pr });
      }
    }
  }

  if (!candidates.length) {
    return { analog: null, type_id: typeId, type_title: sessionState.type_title || '' };
  }

  // seed меняется при каждом новом аналоге в рамках одного request за счёт used.length
  const baseSeed = (req.seed || 1) ^ hash32(req.base_question_id);
  const stepSeed = hash32(String((sessionState.used_proto_ids || []).length));
  const seed = (baseSeed ^ stepSeed) >>> 0;
  const rnd = mulberry32(seed);

  const picked = candidates[Math.floor(rnd() * candidates.length)];
  const q = buildQuestion(picked.man, picked.t, picked.pr);

  return { analog: q, type_id: typeId, type_title: sessionState.type_title || '' };
}

// ---------- Проверка ответа (как в hw.js) ----------
function normalize(s, kinds) {
  let t = s == null ? '' : String(s);
  t = t.trim();
  if (kinds.includes('strip_spaces')) t = t.replace(/\s+/g, '');
  if (kinds.includes('unicode_minus_to_ascii')) t = t.replace(/[\u2212\u2012\u2013\u2014]/g, '-');
  if (kinds.includes('comma_to_dot')) t = t.replace(/,/g, '.');
  return t;
}

function parseNumber(s) {
  const frac = s.match(/^\s*([+-]?\d+(?:\.\d+)?)\s*\/\s*([+-]?\d+(?:\.\d+)?)\s*$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  return Number(s);
}

function compareNumber(x, v, tol) {
  if (!Number.isFinite(x)) return false;
  const abs = tol && typeof tol.abs === 'number' ? tol.abs : null;
  const rel = tol && typeof tol.rel === 'number' ? tol.rel : null;
  if (abs != null && Math.abs(x - v) <= abs) return true;
  if (rel != null && Math.abs(x - v) <= Math.abs(v) * rel) return true;
  return Math.abs(x - v) <= 1e-12;
}

function matchText(norm, spec) {
  const acc = spec.accept || [];
  for (const a of acc) {
    if (a.exact && norm === a.exact) return true;
    if (a.regex) {
      const re = new RegExp(a.regex, a.flags || '');
      if (re.test(norm)) return true;
    }
  }
  return false;
}

function checkFree(spec, raw) {
  const chosen_text = String(raw ?? '').trim();
  const norm = normalize(chosen_text, spec.normalize || []);

  function bestCorrectText() {
    const c = spec && spec.correct_text != null ? String(spec.correct_text).trim() : '';
    if (c) return c;

    const t = spec && spec.text != null ? String(spec.text).trim() : '';
    if (t) return t;

    if (spec && spec.value != null) {
      const v = String(spec.value).trim();
      if (v) return v;
    }

    const a0 =
      spec && spec.accept && spec.accept[0] && spec.accept[0].exact != null
        ? String(spec.accept[0].exact).trim()
        : '';
    if (a0) return a0;

    return '';
  }

  if (spec.type === 'string') {
    const ok = matchText(norm, spec);
    return {
      correct: ok,
      chosen_text,
      normalized_text: norm,
      correct_text: bestCorrectText(),
    };
  }

  // number
  const x = parseNumber(norm);

  let v = null;
  if (typeof spec.value === 'number') {
    v = spec.value;
  } else if (spec.value != null) {
    const n = Number(String(spec.value).replace(',', '.'));
    if (Number.isFinite(n)) v = n;
  }

  if (v == null) {
    const cand =
      spec.correct_text != null ? spec.correct_text :
      (spec.text != null ? spec.text : '');
    const n = Number(String(cand).replace(',', '.'));
    if (Number.isFinite(n)) v = n;
  }

  const ok = Number.isFinite(v) ? compareNumber(x, v, spec.tolerance) : false;

  const ct = bestCorrectText() || (Number.isFinite(v) ? String(v) : '');
  return {
    correct: ok,
    chosen_text,
    normalized_text: norm,
    correct_text: ct,
  };
}

// ---------- UI ----------
function mountRunnerUI() {
  const host = $('#runner');
  if (!host) return;

  host.classList.remove('hidden');

  host.innerHTML = `
    <div class="panel hw-panel">
    <div class="run-body">
      <div class="list-meta" id="analogMeta"></div>

      <div class="task-list" id="taskList"></div>

      <div class="hw-bottom">
        <button id="finishAnalog" type="button">Завершить</button>
      </div>
    </div>
    </div>
  `;

  // summary создаём рядом с панелью runner (как в hw.html: div#summary с panel внутри)
  let summary = $('#summary');
  if (!summary) {
    summary = document.createElement('div');
    summary.id = 'summary';
    summary.className = 'hidden';
    // как в hw.js: summary живёт рядом с runner внутри той же панели
    const place = host.parentElement || document.body;
    place.appendChild(summary);
  }

  summary.innerHTML = `
    <div class="panel">
      <div class="hw-summary-head">
        <h2>Отчет и статистика</h2>
      </div>
      <div id="stats" class="stats"></div>
      <div class="hw-review-controls">
        <div class="mode-toggle">
          <button id="toggleWrong" type="button" class="mode-btn">Неверные (0)</button>
        </div>
      </div>
      <div class="task-list hw-review-list" id="reviewList"></div>
    </div>`;

  const toggleWrongBtn = $('#toggleWrong', summary);
  if (toggleWrongBtn) toggleWrongBtn.onclick = () => toggleWrongFilter();
  syncWrongFilterButton();
  wireNextAnalogInSummary(summary);
}

function hideSummaryShowRunner() {
  const summary = $('#summary');
  if (summary) summary.classList.add('hidden');
  const runner = $('#runner');
  if (runner) runner.classList.remove('hidden');
}

function showSummaryHideRunner() {
  const runner = $('#runner');
  if (runner) runner.classList.add('hidden');
  const summary = $('#summary');
  if (summary) summary.classList.remove('hidden');
}



function wireNextAnalogInSummary(summaryRoot) {
  if (!summaryRoot) return;
  try {
    if (summaryRoot.dataset && summaryRoot.dataset.nextAnalogWired === '1') return;
    if (summaryRoot.dataset) summaryRoot.dataset.nextAnalogWired = '1';
  } catch (_) {}

  summaryRoot.addEventListener('click', (e) => {
    const t = e && e.target ? e.target : null;
    const btn = t && t.closest ? t.closest('button.analog-btn[data-action="next-analog"]') : null;
    if (!btn) return;

    try { e.preventDefault(); } catch (_) {}
    try { e.stopPropagation(); } catch (_) {}

    if (btn.disabled) return;

    const prevText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Подбираем...';

    Promise.resolve(startNextAnalog())
      .catch((err) => console.error(err))
      .finally(() => {
        btn.disabled = false;
        btn.textContent = prevText || 'Решить аналог';
      });
  });
}

function renderTaskList() {
  const listEl = $('#taskList');
  if (!listEl) return;
  listEl.innerHTML = '';

  const qs = Array.isArray(SESSION.questions) ? SESSION.questions : [];
  qs.forEach((q, idx) => {
    const card = document.createElement('div');
    card.className = 'task-card q-card';

    const head = document.createElement('div');
    head.className = 'hw-task-head';

    const num = document.createElement('div');
    num.className = 'task-num';
    num.textContent = String(idx + 1);
    head.appendChild(num);
    card.appendChild(head);

    const stem = document.createElement('div');
    stem.className = 'task-stem';
    setStem(stem, q.stem);
    card.appendChild(stem);

    if (q.figure?.img) {
      const figWrap = document.createElement('div');
      figWrap.className = 'task-fig';
      const img = document.createElement('img');
      img.src = asset(q.figure.img);
      img.alt = q.figure.alt || '';
      figWrap.appendChild(img);
      card.appendChild(figWrap);
    }

    const ansRow = document.createElement('div');
    ansRow.className = 'hw-answer-row';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Ответ';
    input.autocomplete = 'off';
    input.dataset.idx = String(idx);

    input.addEventListener('input', () => {
      const i = Number(input.dataset.idx);
      const qq = SESSION.questions[i];
      if (!qq) return;
      qq.chosen_text = String(input.value ?? '');
    });

    ansRow.appendChild(input);
    card.appendChild(ansRow);

    listEl.appendChild(card);
  });

  if (window.MathJax) {
    try {
      if (window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([listEl]).catch(err => console.error(err));
      } else if (window.MathJax.typeset) {
        window.MathJax.typeset([listEl]);
      }
    } catch (e) {
      console.error('MathJax error', e);
    }
  }
}

// ---------- отчёт (как после ДЗ) ----------
function syncWrongFilterButton() {
  const btn = document.getElementById('toggleWrong');
  if (!btn) return;

  const qs = (typeof SESSION === 'object' && SESSION && Array.isArray(SESSION.questions)) ? SESSION.questions : [];
  const wrong = qs.reduce((s, q) => s + (q && q.correct ? 0 : 1), 0);

  btn.textContent = `Неверные (${wrong})`;
  btn.classList.toggle('active', REVIEW_ONLY_WRONG);
}

function resetWrongFilter() {
  REVIEW_ONLY_WRONG = false;
  syncWrongFilterButton();
}

function toggleWrongFilter() {
  REVIEW_ONLY_WRONG = !REVIEW_ONLY_WRONG;
  syncWrongFilterButton();
  renderReviewCards();
}

function formatHms(ms) {
  const s = Math.max(0, Math.round(Number(ms || 0) / 1000));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (x) => String(x).padStart(2, '0');
  if (hh) return `${hh}:${pad(mm)}:${pad(ss)}`;
  return `${mm}:${pad(ss)}`;
}

function renderStats({ total, correct, duration_ms, avg_ms } = {}) {
  const t = Number(total ?? 0);
  const c = Number(correct ?? 0);
  const d = Number(duration_ms ?? 0);
  const a = Number(avg_ms ?? Math.round(d / Math.max(1, t)));

  const statsEl = $('#stats');
  if (!statsEl) return;

  statsEl.innerHTML =
    `<div>Всего: ${t}</div>` +
    `<div>Верно: ${c}</div>` +
    `<div>Точность: ${Math.round((100 * c) / Math.max(1, t))}%</div>` +
    `<div>Общее время: ${formatHms(d)}</div>` +
    `<div>Среднее на задачу: ${formatHms(a)}</div>`;
}

function renderReviewCards() {
  const host = $('#reviewList');
  if (!host) return;
  host.innerHTML = '';

  const onlyWrong = REVIEW_ONLY_WRONG;
  const qs = Array.isArray(SESSION.questions) ? SESSION.questions : [];

  qs.forEach((q, idx) => {
    if (onlyWrong && q.correct) return;

    const card = document.createElement('div');
    card.className = 'task-card q-card';

    const head = document.createElement('div');
    head.className = 'hw-review-head';

    const num = document.createElement('div');
    num.className = 'task-num ' + (q.correct ? 'ok' : 'bad');
    num.textContent = String(idx + 1);

    head.appendChild(num);
    card.appendChild(head);

    const stem = document.createElement('div');
    stem.className = 'task-stem';
    setStem(stem, q.stem);
    card.appendChild(stem);

    if (q.figure?.img) {
      const figWrap = document.createElement('div');
      figWrap.className = 'task-fig';
      const img = document.createElement('img');
      img.src = asset(q.figure.img);
      img.alt = q.figure.alt || '';
      figWrap.appendChild(img);
      card.appendChild(figWrap);
    }

    const ans = document.createElement('div');
    ans.className = 'hw-review-answers';
    const protoId = String(q.question_id || q.id || '').trim();

    ans.innerHTML =
      `<div class="hw-ans-line">` +
      `<span>Ваш ответ: <span class="muted">${escHtml(q.chosen_text || '')}</span></span>` +
      `<span class="hw-actions">` +
      `<span class="video-solution-slot" data-video-proto="${escHtml(protoId)}"></span>` +
      `${(REQ && ASESSION)
        ? `<button type="button" class="analog-btn" data-action="next-analog" data-topic-id="${escHtml(String(REQ.topic_id || '').trim())}" data-base-proto="${escHtml(String(REQ.base_question_id || '').trim())}">Решить аналог</button>`
        : `<button type="button" class="analog-btn" disabled>Решить аналог</button>`}` +
      `</span>` +
      `</div>` +
      `<div class="hw-ans-line">Правильный ответ: <span class="muted">${escHtml(q.correct_text || '')}</span></div>`;

    card.appendChild(ans);
    host.appendChild(card);
  });

  // Видео-решения (Rutube): превращаем слоты в кнопки и включаем модалку
  try {
    hydrateVideoLinks(host, { mode: 'modal', missingText: 'Видео скоро будет' });
    wireVideoSolutionModal(host);
  } catch (e) {
    console.warn('video solutions init failed', e);
  }

  if (window.MathJax) {
    try {
      if (window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([host]).catch(err => console.error(err));
      } else if (window.MathJax.typeset) {
        window.MathJax.typeset([host]);
      }
    } catch (e) {
      console.error('MathJax error', e);
    }
  }
}

function ensureSaveStatusInSummary(savedText) {
  const summaryPanel = $('#summary .panel') || $('#summary');
  if (!summaryPanel) return;

  let statusEl = $('#hwSaveStatus', summaryPanel);
  if (!statusEl) {
    statusEl = document.createElement('div');
    statusEl.id = 'hwSaveStatus';
    statusEl.className = 'muted';
    statusEl.style.marginTop = '10px';
    summaryPanel.appendChild(statusEl);
  }
  statusEl.textContent = savedText || 'Результат сохранён.';
}

function showSummaryAfterFinish({ total, correct, duration_ms, avg_ms, savedText } = {}) {
  showSummaryHideRunner();

  renderStats({ total, correct, duration_ms, avg_ms });
  resetWrongFilter();
  renderReviewCards();
  ensureSaveStatusInSummary(savedText);

  try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (_) {}
}

function withTimeout(promise, ms) {
  let t = null;
  const timer = new Promise((resolve) => {
    t = setTimeout(() => resolve({ __timeout: true }), Math.max(0, ms || 0));
  });
  return Promise.race([promise.then((v) => ({ __value: v })).catch((e) => ({ __error: e })), timer]).finally(() => {
    if (t) clearTimeout(t);
  });
}

async function finishAnalog() {
  SESSION.meta = SESSION.meta || {};
  if (SESSION.meta.finishing) return;
  SESSION.meta.finishing = true;

  const btn = $('#finishAnalog');
  if (btn) btn.disabled = true;

  // считываем ответы из полей
  document.querySelectorAll('#taskList input[type="text"][data-idx]').forEach((el) => {
    const i = Number(el.dataset.idx);
    const q = SESSION.questions[i];
    if (!q) return;
    q.chosen_text = String(el.value ?? '');
  });

  const q = SESSION.questions[0];
  if (!q) return;

  const t0 = SESSION.started_at || Date.now();
  const duration_ms = Math.max(0, Date.now() - t0);

  const spec = q.answer_spec || q.answer;
  const raw = q.chosen_text ?? '';
  const check = checkFree(spec, raw);

  q.correct = !!check.correct;
  q.chosen_text = check.chosen_text;
  q.normalized_text = check.normalized_text;
  q.correct_text = (check.correct_text && String(check.correct_text).trim()) ? check.correct_text : (q.correct_text || '');
  q.time_ms = duration_ms;

  const total = 1;
  const correct = q.correct ? 1 : 0;
  const avg_ms = duration_ms;

  // обновляем used_proto_ids (чтобы следующий аналог не повторялся)
  if (ASESSION && q.question_id) {
    const id = String(q.question_id).trim();
    if (id && !ASESSION.used_proto_ids.includes(id)) {
      ASESSION.used_proto_ids.push(id);
      saveAnalogSession(ASESSION);
    }
  }

  // отправка в статистику (если пользователь авторизован)
  const payloadQuestions = [{
    topic_id: q.topic_id,
    question_id: q.question_id,
    difficulty: q.difficulty,
    correct: !!check.correct,
    time_ms: duration_ms,
    chosen_text: check.chosen_text,
    normalized_text: check.normalized_text,
    correct_text: check.correct_text,
  }];

  const nowIso = new Date().toISOString();
  const startedIso = new Date(t0).toISOString();

  const attemptRow = {
    mode: 'tasks',
    topic_ids: [q.topic_id],
    total: 1,
    correct,
    avg_ms: duration_ms,
    duration_ms,
    started_at: startedIso,
    finished_at: nowIso,
    payload: {
      questions: payloadQuestions,
      meta: {
        kind: 'hw_analog',
        base_question_id: SESSION.base_question_id,
        analog_question_id: q.question_id,
      },
    },
    created_at: nowIso,
  };

  let savedText = '';
  try {
    const r = await withTimeout(insertAttempt(attemptRow), 10000);
    if (r?.__timeout) {
      savedText = 'Результат подсчитан, но сохранение в статистику заняло слишком много времени.';
    } else if (r?.__error) {
      console.warn('insertAttempt failed', r.__error);
      savedText = 'Результат подсчитан, но не удалось сохранить в статистику.';
    } else {
      const res = r.__value;
      if (res && res.skipped) savedText = 'Результат не сохранён (нужен вход в аккаунт).';
      else savedText = '';
    }
  } catch (e) {
    console.warn('insertAttempt failed', e);
    savedText = 'Результат подсчитан, но не удалось сохранить в статистику.';
  }

  showSummaryAfterFinish({ total, correct, duration_ms, avg_ms, savedText });
}

async function startAnalogSolve() {
  if (!REQ) return;

  showMsg('Подбираем аналог...');
  diagReady();

  // Сброс флагов, чтобы можно было решать многократно на одной странице
  SESSION.meta = SESSION.meta || {};
  SESSION.meta.finishing = false;

  mountRunnerUI();
  hideSummaryShowRunner();

  const picked = await pickAnalogQuestion(REQ, ASESSION);
  const q = picked.analog;

  if (!q) {
    // аналоги закончились
    showMsg('В этой подтеме больше нет доступных аналогов (все варианты уже решены или отсутствуют).');
    showSummaryAfterFinish({ total: 0, correct: 0, duration_ms: 0, avg_ms: 0, savedText: 'Аналоги закончились.' });
    return;
  }

  SESSION.started_at = Date.now();
  SESSION.topic_id = REQ.topic_id;
  SESSION.base_question_id = REQ.base_question_id;
  SESSION.return_url = REQ.return_url || '';
  SESSION.questions = [Object.assign(q, { chosen_text: '' })];

  showMsg('');

  // meta (подтема)
  const meta = $('#analogMeta');
  if (meta) {
    const title = (picked.type_id || picked.type_title) ? `${picked.type_id}. ${picked.type_title || ''}` : '';
    meta.textContent = title ? `Подтема: ${title}` : '';
  }

  renderTaskList();

  const btn = $('#finishAnalog');
  if (btn) {
    btn.disabled = false;
    btn.onclick = () => finishAnalog();
  }

  diagReady();
}

async function startNextAnalog() {
  // кнопка доступна только в summary, после finish
  if (!REQ) return;

  // Если до этого была попытка — уже записали used в finishAnalog.
  // Здесь просто запускаем новый подбор и сбрасываем UI.
  try {
    await startAnalogSolve();
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (_) {}
  } catch (e) {
    console.error(e);
    showMsg('Ошибка подбора аналога: ' + (e && e.message ? e.message : String(e)));
  }
}

async function main() {
  showMsg('');

  const req = readRequest();
  if (!req) {
    showMsg('Нет данных для аналога. Откройте отчёт ДЗ и нажмите "Решить аналог" рядом с задачей.');
    return;
  }

  REQ = req;
  ASESSION = readAnalogSession(req);
  saveAnalogSession(ASESSION);

  // на всякий случай: снимаем сторожевой таймер до подгрузки контента
  diagReady();

  await startAnalogSolve();
}
