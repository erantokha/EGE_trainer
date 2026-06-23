import {
  buildPart2EtalonContent,
  renderPart2Stem,
  mkEl,
} from '../../tasks/part2_render.js?v=2026-06-18-23-231425';

const MANIFESTS = [
  '/content/tasks/part2/13/13.trig.factor.json',
  '/content/tasks/part2/13/13.trig.group.json',
  '/content/tasks/part2/13/13.trig.homog.json',
  '/content/tasks/part2/13/13.trig.quad.json',
  '/content/tasks/part2/13/13.trig.other.json',
  '/content/tasks/part2/13/13.log.json',
  '/content/tasks/part2/13/13.exp.json',
];

const DEFAULT_ID = '13.trig.factor.46.1';

const state = {
  prototypes: [],
  selected: null,
};

const $ = (sel) => document.querySelector(sel);

function mathBlock(tex, cls = 'math-line') {
  return mkEl('div', cls, `\\[ ${tex} \\]`);
}

function inlineMathList(items) {
  return items.map((item) => `\\( ${item} \\)`).join(';\\quad ');
}

async function typeset(el = document.body) {
  const started = Date.now();
  while (
    (!window.MathJax || !window.MathJax.typesetPromise)
    && Date.now() - started < 6000
  ) {
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  if (!window.MathJax || !window.MathJax.typesetPromise) return;
  try {
    if (window.MathJax.startup?.promise) await window.MathJax.startup.promise;
    await window.MathJax.typesetPromise([el]);
  } catch (err) {
    console.error('MathJax failed', err);
  }
}

async function loadPrototypes() {
  const manifests = await Promise.all(
    MANIFESTS.map(async (path) => {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`Не удалось загрузить ${path}`);
      return res.json();
    }),
  );

  const prototypes = [];
  for (const manifest of manifests) {
    for (const type of (manifest.types || [])) {
      for (const proto of (type.prototypes || [])) {
        prototypes.push({
          ...proto,
          manifestTitle: manifest.title,
          typeTitle: type.title,
          topic: manifest.topic,
        });
      }
    }
  }
  return prototypes;
}

function labelForProto(proto) {
  const cid = proto.cid ? `${proto.cid} · ` : '';
  const method = proto.method || proto.typeTitle || proto.manifestTitle || proto.topic;
  return `${cid}${proto.id} · ${method}`;
}

function fillSelect() {
  const select = $('#protoSelect');
  select.textContent = '';
  for (const proto of state.prototypes) {
    const option = document.createElement('option');
    option.value = proto.id;
    option.textContent = labelForProto(proto);
    select.appendChild(option);
  }
  select.value = state.selected?.id || DEFAULT_ID;
  select.addEventListener('change', () => {
    const next = state.prototypes.find((proto) => proto.id === select.value) || state.prototypes[0];
    renderProto(next);
  });
}

function renderTask(proto) {
  $('#taskCid').textContent = proto.cid || proto.id;
  $('#taskMethod').textContent = proto.method || proto.typeTitle || proto.manifestTitle || '№13';
  $('#taskTitle').textContent = proto.typeTitle || proto.manifestTitle || 'Задача №13';
  renderPart2Stem($('#taskStem'), proto.stem);
}

function renderCurrent(proto) {
  const mount = $('#currentMount');
  mount.textContent = '';
  const panel = mkEl('div', 'part2-etalon');
  panel.appendChild(buildPart2EtalonContent(proto.solution, proto.answer, { stem: proto.stem }));
  mount.appendChild(panel);
}

function section(title, number) {
  const wrap = mkEl('section', 'solution-stage');
  const head = mkEl('h4', 'stage-title');
  head.appendChild(mkEl('b', '', String(number)));
  head.appendChild(document.createTextNode(title));
  wrap.appendChild(head);
  return wrap;
}

function renderClean(proto) {
  const mount = $('#cleanMount');
  mount.textContent = '';
  const sol = proto.solution || {};
  const ans = proto.answer || {};
  const flow = mkEl('div', 'solution-flow');

  const algebra = section('Преобразуем уравнение', 1);
  const algebraStack = mkEl('div', 'math-stack');
  for (const step of (sol.steps || [])) algebraStack.appendChild(mathBlock(step));
  algebra.appendChild(algebraStack);
  flow.appendChild(algebra);

  const general = section('Разбиваем на случаи', 2);
  const groups = mkEl('div', 'split-groups');
  for (const group of (sol.gen_groups || [])) {
    const box = mkEl('div', 'split-group');
    if (group.head) box.appendChild(mathBlock(group.head, 'split-head'));
    for (const item of (group.series || [])) box.appendChild(mathBlock(item));
    groups.appendChild(box);
  }
  general.appendChild(groups);
  flow.appendChild(general);

  if (sol.figure || (sol.below || []).length) {
    const roots = section('Отбираем корни на отрезке', 3);
    if (sol.figure) {
      const fig = mkEl('div', 'figure-row');
      const img = mkEl('img');
      img.src = '/' + String(sol.figure).replace(/^\/+/, '');
      img.alt = 'Окружность отбора корней';
      fig.appendChild(img);
      fig.appendChild(mkEl('div', 'figure-caption', 'Точки на тригонометрической окружности'));
      roots.appendChild(fig);
    }
    const rootStack = mkEl('div', 'root-stack');
    for (const line of (sol.below || [])) rootStack.appendChild(mathBlock(line, 'root-line'));
    roots.appendChild(rootStack);
    flow.appendChild(roots);
  }

  const answer = section('Записываем ответ', 4);
  const answerStack = mkEl('div', 'answer-stack');
  if ((ans.general || []).length) {
    answerStack.appendChild(mkEl('div', 'answer-line', `а) ${inlineMathList(ans.general)}`));
  }
  if ((ans.roots || []).length) {
    answerStack.appendChild(mkEl('div', 'answer-line', `б) ${inlineMathList(ans.roots)}`));
  }
  answer.appendChild(answerStack);
  flow.appendChild(answer);

  mount.appendChild(flow);
}

function renderExam(proto) {
  const mount = $('#examMount');
  mount.textContent = '';
  const sol = proto.solution || {};
  const ans = proto.answer || {};
  const sheet = mkEl('div', 'exam-sheet');

  const solution = mkEl('section', 'exam-block');
  solution.appendChild(mkEl('h4', 'exam-title', 'Решение.'));
  for (const step of (sol.steps || [])) solution.appendChild(mathBlock(step, 'exam-line'));
  for (const group of (sol.gen_groups || [])) {
    if (group.head) solution.appendChild(mathBlock(group.head, 'exam-line'));
    for (const item of (group.series || [])) solution.appendChild(mathBlock(item, 'exam-line'));
  }
  sheet.appendChild(solution);

  const roots = mkEl('section', 'exam-block');
  roots.appendChild(mkEl('h4', 'exam-title', 'Отбор корней.'));
  if (sol.figure) {
    const fig = mkEl('div', 'figure-row');
    const img = mkEl('img');
    img.src = '/' + String(sol.figure).replace(/^\/+/, '');
    img.alt = 'Окружность отбора корней';
    fig.appendChild(img);
    roots.appendChild(fig);
  }
  for (const line of (sol.below || [])) roots.appendChild(mathBlock(line, 'exam-line'));
  sheet.appendChild(roots);

  const answer = mkEl('section', 'exam-block');
  answer.appendChild(mkEl('h4', 'exam-title', 'Ответ.'));
  if ((ans.general || []).length) answer.appendChild(mkEl('div', 'exam-line', `а) ${inlineMathList(ans.general)}`));
  if ((ans.roots || []).length) answer.appendChild(mkEl('div', 'exam-line', `б) ${inlineMathList(ans.roots)}`));
  sheet.appendChild(answer);

  mount.appendChild(sheet);
}

async function renderProto(proto) {
  if (!proto) return;
  state.selected = proto;
  renderTask(proto);
  renderCurrent(proto);
  renderClean(proto);
  renderExam(proto);
  await typeset(document.body);
}

async function init() {
  try {
    state.prototypes = await loadPrototypes();
    const params = new URLSearchParams(location.search);
    const requested = params.get('id') || DEFAULT_ID;
    state.selected = state.prototypes.find((proto) => proto.id === requested)
      || state.prototypes.find((proto) => proto.id === DEFAULT_ID)
      || state.prototypes[0];
    fillSelect();
    await renderProto(state.selected);
  } catch (err) {
    console.error(err);
    $('#taskTitle').textContent = 'Не удалось открыть лабораторию';
    $('#taskStem').textContent = err?.message || String(err);
  }
}

init();
