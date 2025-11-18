// tasks/list.js
// Страница Список задач: вывод всех подобранных задач 1..N (как лист с прототипами).

const $ = (sel, root = document) => root.querySelector(sel);

// индекс и манифесты лежат в корне репозитория относительно /tasks/
const INDEX_URL = '../content/tasks/index.json';

let CATALOG = null;
let SECTIONS = [];

let CHOICE_TOPICS = {};   // topicId -> count (загружается из sessionStorage)
let CHOICE_SECTIONS = {}; // sectionId -> count (загружается из sessionStorage)
let SHUFFLE_TASKS = false; // флаг «перемешать задачи» из picker

// ---------- Инициализация ----------
document.addEventListener('DOMContentLoaded', async () => {
  // кнопка «Новая сессия» – возвращаемся к выбору задач
  $('#restart')?.addEventListener('click', () => {
    sessionStorage.removeItem('tasks_selection_v1');
    location.href = './index.html';
  });

  // Прячем интерфейс и показываем оверлей загрузки
  const runnerEl = $('#runner');
  const summaryEl = $('#summary');
  runnerEl?.classList.add('hidden');
  summaryEl?.classList.add('hidden');

  let overlay = $('#loadingOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'loadingOverlay';
    overlay.textContent = 'Загружаем задачи...';
    document.body.appendChild(overlay);
  } else {
    overlay.classList.remove('hidden');
  }

  const rawSel = sessionStorage.getItem('tasks_selection_v1');
  if (!rawSel) {
    location.href = './index.html';
    return;
  }

  let sel;
  try {
    sel = JSON.parse(rawSel);
  } catch (e) {
    console.error('Некорректный формат selection в sessionStorage', e);
    location.href = './index.html';
    return;
  }

  CHOICE_TOPICS = sel.topics || {};
  CHOICE_SECTIONS = sel.sections || {};
  SHUFFLE_TASKS = !!sel.shuffle;

  try {
    await loadCatalog();
    const questions = await pickPrototypes();
    await renderTaskList(questions);
  } catch (e) {
    console.error(e);
    const host = $('#runner') || document.body;
    if (host) {
      host.classList.remove('hidden');
      host.innerHTML =
        '<div style="opacity:.8;padding:8px 0">Ошибка загрузки задач. Проверьте content/tasks/index.json и манифесты.</div>';
    }
  } finally {
    $('#loadingOverlay')?.classList.add('hidden');
  }
});

// ---------- Загрузка каталога ----------
async function loadCatalog() {
  const resp = await fetch(INDEX_URL, { cache: 'no-store' });
  if (!resp.ok) throw new Error(`index.json not found: ${resp.status}`);
  CATALOG = await resp.json();

  const sections = CATALOG.filter(x => x.type === 'group');
  const topics   = CATALOG.filter(x => !!x.parent && x.enabled !== false);

  const byId = (a, b) => compareId(a.id, b.id);

  for (const sec of sections) {
    sec.topics = topics.filter(t => t.parent === sec.id).sort(byId);
  }
  sections.sort(byId);
  SECTIONS = sections;
}

// ---------- выбор задач ----------
async function ensureManifest(topic) {
  if (topic._manifest) return topic._manifest;
  if (!topic.path) return null;
  const url = new URL('../' + topic.path, location.href);
  const resp = await fetch(url.href);
  if (!resp.ok) return null;
  topic._manifest = await resp.json();
  return topic._manifest;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}
function sample(arr, k) {
  const a = [...arr];
  shuffle(a);
  return a.slice(0, Math.min(k, a.length));
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

async function pickPrototypes() {
  const chosen = [];
  const anyTopics = Object.values(CHOICE_TOPICS).some(v => v > 0);

  // A) задано по темам
  if (anyTopics) {
    for (const sec of SECTIONS) {
      for (const t of sec.topics) {
        const want = CHOICE_TOPICS[t.id] || 0;
        if (!want) continue;
        const man = await ensureManifest(t);
        if (!man) continue;

        const caps = (man.types || []).map(x => ({
          id: x.id,
          cap: (x.prototypes || []).length,
        }));
        const plan = distributeNonNegative(caps, want);

        for (const typ of man.types || []) {
          const k = plan.get(typ.id) || 0;
          if (!k) continue;
          for (const p of sample(typ.prototypes || [], k)) {
            chosen.push(buildQuestion(man, typ, p));
          }
        }
      }
    }

    if (SHUFFLE_TASKS) {
      shuffle(chosen);
    }
    return chosen;
  }

  // B) задано по разделам
  for (const sec of SECTIONS) {
    const wantSection = CHOICE_SECTIONS[sec.id] || 0;
    if (!wantSection) continue;

    const topicCaps = [];
    for (const t of sec.topics) {
      const man = await ensureManifest(t);
      if (!man) continue;
      const cap = (man.types || []).reduce(
        (s, x) => s + (x.prototypes || []).length,
        0,
      );
      topicCaps.push({ id: t.id, cap, _topic: t });
    }
    const planTopics = distributeNonNegative(topicCaps, wantSection);

    for (const { id } of topicCaps) {
      const wantT = planTopics.get(id) || 0;
      if (!wantT) continue;
      const topic = sec.topics.find(x => x.id === id);
      const man = await ensureManifest(topic);
      if (!man) continue;

      const caps = (man.types || []).map(x => ({
        id: x.id,
        cap: (x.prototypes || []).length,
      }));
      const plan = distributeNonNegative(caps, wantT);

      for (const typ of man.types || []) {
        const k = plan.get(typ.id) || 0;
        if (!k) continue;
        for (const p of sample(typ.prototypes || [], k)) {
          chosen.push(buildQuestion(man, typ, p));
        }
      }
    }
  }

  if (SHUFFLE_TASKS) {
    shuffle(chosen);
  }
  return chosen;
}

// ---------- построение вопроса ----------
function buildQuestion(manifest, type, proto) {
  const params = proto.params || {};
  const stemTpl = proto.stem || type.stem_template || type.stem || '';
  const stem = interpolate(stemTpl, params);
  const fig = proto.figure || type.figure || null;
  const ans = computeAnswer(type, proto, params);
  return {
    topic_id: manifest.topic || '',
    topic_title: manifest.title || '',
    question_id: proto.id,
    difficulty: proto.difficulty ?? (type.defaults?.difficulty ?? 1),
    figure: fig,
    stem,
    answer: ans,
  };
}

function computeAnswer(type, proto, params) {
  const spec = type.answer_spec || type.answerSpec;
  const t = { ...(type.defaults || {}), ...(spec || {}) };
  const out = {
    type: t.type || 'number',
    format: t.format || null,
    units: t.units || null,
    tolerance: t.tolerance || null,
    accept: t.accept || null,
    normalize: t.normalize || [],
  };
  if (proto.answer) {
    if (proto.answer.value != null) out.value = proto.answer.value;
    if (proto.answer.text != null) out.text = proto.answer.text;
  } else if (t.expr) {
    out.value = evalExpr(t.expr, params);
  }
  return out;
}

function interpolate(tpl, params) {
  return String(tpl || '').replace(
    /\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g,
    (_, k) => (params[k] !== undefined ? String(params[k]) : ''),
  );
}
function evalExpr(expr, params) {
  const pnames = Object.keys(params || {});
  // eslint-disable-next-line no-new-func
  const f = new Function(...pnames, `return (${expr});`);
  return f(...pnames.map(k => params[k]));
}

// ---------- Режим СПИСКА ЗАДАЧ ----------
async function renderTaskList(questions) {
  const arr = questions || [];
  const runner = $('#runner') || $('#summary') || document.body;
  if (!runner) return;

  if (!arr.length) {
    runner.classList.remove('hidden');
    runner.innerHTML =
      '<div style="opacity:.8;padding:8px 0">Не удалось подобрать задачи. Вернитесь на страницу выбора и проверьте настройки.</div>';
    return;
  }

  // на всякий случай прячем summary, если он есть
  $('#summary')?.classList.add('hidden');
  runner.classList.remove('hidden');

  const total = arr.length;
  runner.innerHTML = '';

  const title = document.createElement('h2');
  title.textContent = 'Список задач';
  runner.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'run-head';
  meta.innerHTML = `<div>Всего задач: ${total}</div>`;
  runner.appendChild(meta);

  const list = document.createElement('ol');
  list.style.margin = '12px 0 0';
  list.style.paddingLeft = '20px';

  arr.forEach((q) => {
    const li = document.createElement('li');
    li.style.marginBottom = '12px';

    const stem = document.createElement('div');
    stem.innerHTML = q.stem;
    li.appendChild(stem);

    if (q.figure?.img) {
      const fig = document.createElement('div');
      fig.style.marginTop = '6px';
      const img = document.createElement('img');
      img.src = asset(q.figure.img);
      img.alt = q.figure.alt || '';
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      fig.appendChild(img);
      li.appendChild(fig);
    }

    const details = document.createElement('details');
    details.style.marginTop = '6px';

    const summary = document.createElement('summary');
    summary.textContent = 'Ответ';
    details.appendChild(summary);

    const ans = document.createElement('div');
    const correctText =
      q.answer && q.answer.text != null
        ? String(q.answer.text)
        : q.answer && q.answer.value != null
          ? String(q.answer.value)
          : '';
    ans.textContent = correctText;
    ans.style.marginTop = '4px';

    details.appendChild(ans);
    li.appendChild(details);

    list.appendChild(li);
  });

  runner.appendChild(list);

  if (window.MathJax) {
    try {
      if (window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([runner]).catch(err => console.error(err));
      } else if (window.MathJax.typeset) {
        window.MathJax.typeset([runner]);
      }
    } catch (e) {
      console.error('MathJax error in list mode', e);
    }
  }
}

// ---------- утилиты ----------
function esc(s) {
  return String(s).replace(/[&<>"]/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
  })[m]);
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

// преобразование "content/..." в абсолютный путь от /tasks/
function asset(p) {
  return (typeof p === 'string' && p.startsWith('content/'))
    ? '../' + p
    : p;
}
