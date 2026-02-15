// tasks/analog.js
// Тест из одного задания: "аналог" к задаче из отчёта ДЗ.
// Источник: sessionStorage['analog_request_v1'] (topic_id + base_question_id)

import { withBuild } from '../app/build.js?v=2026-02-13-4';
import { safeEvalExpr } from '../app/core/safe_expr.mjs?v=2026-02-13-4';
import { setStem } from '../app/ui/safe_dom.js?v=2026-02-13-4';
import { insertAttempt } from '../app/providers/supabase-write.js?v=2026-02-13-4';

const $ = (sel, root = document) => root.querySelector(sel);

const INDEX_URL = '../content/tasks/index.json';
const REQ_KEY = 'analog_request_v1';

let SESSION = {
  started_at: null,
  topic_id: '',
  base_question_id: '',
  question: null,
  answer_spec: null,
  chosen_text: '',
  result: null,
};

document.addEventListener('DOMContentLoaded', () => {
  main().catch((e) => {
    console.error(e);
    showMsg('Ошибка: ' + (e && e.message ? e.message : String(e)));
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

function interpolate(template, vars) {
  const V = vars || {};
  return String(template ?? '').replace(/\$\{([^}]+)\}/g, (_, expr) => {
    try {
      const e = String(expr || '').trim();
      // безопасно считаем выражение в контексте vars
      const v = safeEvalExpr(e, V);
      return (v == null) ? '' : String(v);
    } catch (e) {
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
    // пробуем сделать "number" если это похоже на число
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

  return {
    id: proto && proto.id ? proto.id : '',
    question_id: proto && proto.id ? proto.id : '',
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


async function pickAnalogQuestion(req) {
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

  let base = null;
  let baseManifest = null;
  let baseType = null;
  let baseProto = null;

  // Загружаем манифесты темы и ищем базовый прототип
  for (const p of paths) {
    const u = asset(p);
    const man = await fetchJson(u);

    if (!man || !Array.isArray(man.types)) continue;
    for (const t of man.types) {
      if (!t || !Array.isArray(t.prototypes)) continue;
      for (const pr of t.prototypes) {
        if (pr && String(pr.id || '').trim() === req.base_question_id) {
          baseManifest = man;
          baseType = t;
          baseProto = pr;
          base = buildQuestion(man, t, pr);
          break;
        }
      }
      if (base) break;
    }
    if (base) break;
  }

  if (!base || !baseType || !baseProto || !baseManifest) {
    throw new Error('Не удалось найти базовую задачу в манифестах темы. proto=' + req.base_question_id);
  }

  const candidates = (baseType.prototypes || []).filter((p) => String(p && p.id || '').trim() && String(p.id).trim() !== req.base_question_id);
  if (!candidates.length) {
    throw new Error('В этой подтеме нет других прототипов для аналога.');
  }

  const seed = (req.seed || 1) ^ hash32(req.base_question_id);
  const rnd = mulberry32(seed >>> 0);
  const pick = candidates[Math.floor(rnd() * candidates.length)];

  const q = buildQuestion(baseManifest, baseType, pick);

  return {
    base,
    analog: q,
  };
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

  if (spec.type === 'string' && spec.format === 'ege_decimal') {
    const expected = String(spec.text != null ? spec.text : spec.value != null ? spec.value : '');
    const ok = norm === expected;
    return { correct: ok, chosen_text, normalized_text: norm, correct_text: expected };
  }

  if (spec.type === 'number') {
    const x = parseNumber(norm);
    const v = Number(spec.value);
    const ok = compareNumber(x, v, spec.tolerance || { abs: 0 });
    return { correct: ok, chosen_text, normalized_text: String(x), correct_text: String(v) };
  } else {
    const ok = matchText(norm, spec);
    return {
      correct: ok,
      chosen_text,
      normalized_text: norm,
      correct_text: (spec.accept?.map?.((p) => p.regex || p.exact)?.join(' | ')) || '',
    };
  }
}

// ---------- UI ----------
function mountUI() {
  const runner = $('#runner');
  if (!runner) return;

  runner.classList.remove('hidden');
  runner.innerHTML = `
    <div class="task-list" id="taskList"></div>

    <div class="panel" style="margin-top:14px">
      <div class="hw-answer-row">
        <input id="answerInput" type="text" placeholder="Ответ" autocomplete="off">
        <button id="finishBtn" type="button">Завершить</button>
      </div>
      <div id="resultBox" class="hidden" style="margin-top:10px"></div>
      <div id="saveBox" class="muted" style="margin-top:8px"></div>
      <div id="navBox" style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap"></div>
    </div>
  `;

  renderQuestion();

  const input = $('#answerInput');
  if (input) {
    input.addEventListener('input', () => {
      SESSION.chosen_text = String(input.value ?? '');
    });
    // фокус сразу
    try { input.focus(); } catch (_) {}
  }

  const finish = $('#finishBtn');
  if (finish) finish.addEventListener('click', finishAnalog);

  const nav = $('#navBox');
  if (nav) {
    const backUrl = SESSION.return_url || '';
    if (backUrl) {
      const a = document.createElement('a');
      a.href = backUrl;
      a.textContent = 'Назад к отчёту';
      nav.appendChild(a);
    }
    const statsLink = document.createElement('a');
    statsLink.href = './stats.html';
    statsLink.textContent = 'Статистика';
    nav.appendChild(statsLink);
  }
}

function renderQuestion() {
  const listEl = $('#taskList');
  if (!listEl || !SESSION.question) return;
  listEl.innerHTML = '';

  const q = SESSION.question;

  const card = document.createElement('div');
  card.className = 'task-card q-card';

  const head = document.createElement('div');
  head.className = 'hw-task-head';

  const num = document.createElement('div');
  num.className = 'task-num';
  num.textContent = '1';
  head.appendChild(num);

  // маленькая подпись подтемы
  const meta = document.createElement('div');
  meta.className = 'muted';
  meta.style.marginLeft = '10px';
  meta.textContent = q.type_title ? ('Подтема: ' + q.type_title) : '';
  head.appendChild(meta);

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

  listEl.appendChild(card);

  if (window.MathJax) {
    try {
      if (window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([listEl]).catch(err => console.error(err));
      } else if (window.MathJax.typeset) {
        window.MathJax.typeset([listEl]);
      }
    } catch (e) {
      console.warn('MathJax typeset failed', e);
    }
  }
}

async function finishAnalog() {
  const btn = $('#finishBtn');
  if (btn) btn.disabled = true;

  const q = SESSION.question;
  if (!q || !q.answer) {
    if (btn) btn.disabled = false;
    return;
  }

  const t0 = SESSION.started_at ? +SESSION.started_at : Date.now();
  const duration_ms = Math.max(0, Date.now() - t0);

  const spec = q.answer_spec || q.answer;
  const check = checkFree(spec, SESSION.chosen_text);

  SESSION.result = check;

  // Показываем результат
  const box = $('#resultBox');
  if (box) {
    box.classList.remove('hidden');
    box.innerHTML =
      `<div class="hw-ans-line"><span>Ваш ответ: <span class="muted">${escHtml(check.chosen_text)}</span></span></div>` +
      `<div class="hw-ans-line">Правильный ответ: <span class="muted">${escHtml(check.correct_text)}</span></div>` +
      `<div class="hw-ans-line">${check.correct ? '<span class="badge ok">Верно</span>' : '<span class="badge bad">Неверно</span>'}</div>`;
  }

  // Пишем в статистику (как "tasks")
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
    correct: check.correct ? 1 : 0,
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
    const res = await insertAttempt(attemptRow);
    if (res && res.skipped) {
      savedText = 'Результат не сохранён в статистику (нужен вход в аккаунт).';
    } else {
      savedText = 'Результат сохранён в статистику.';
    }
  } catch (e) {
    console.warn('insertAttempt failed', e);
    savedText = 'Не удалось сохранить результат в статистику.';
  }

  const saveBox = $('#saveBox');
  if (saveBox) saveBox.textContent = savedText;

  // блокируем ввод после завершения
  const input = $('#answerInput');
  if (input) input.disabled = true;

  // запрос можно очистить, чтобы не висел
  try { sessionStorage.removeItem(REQ_KEY); } catch (_) {}
}

async function main() {
  showMsg('');

  const req = readRequest();
  if (!req) {
    showMsg('Нет данных для аналога. Откройте отчёт ДЗ и нажмите "Решить аналог" рядом с задачей.');
    return;
  }

  SESSION.started_at = Date.now();
  SESSION.topic_id = req.topic_id;
  SESSION.base_question_id = req.base_question_id;
  SESSION.return_url = req.return_url || '';

  showMsg('Подбираем аналог...');

  const picked = await pickAnalogQuestion(req);
  const q = picked.analog;
  SESSION.question = q;

  showMsg('');

  mountUI();
}
