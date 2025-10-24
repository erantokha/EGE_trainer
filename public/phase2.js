const ROOT = new URL('../', location.href).href;
const REGISTRY_URL = ROOT + 'content/index.json';
const topicsEl = document.getElementById('topics');
const modalEl = document.getElementById('topicModal');
const startBtn = document.getElementById('startBtn');
const toggleAllBtn = document.getElementById('toggleAll');
const btnTopics = document.getElementById('btnTopics');
const resultBox = document.getElementById('resultBox');
const hint = document.getElementById('hint');

let registry = null;
let checkboxes = [];
let allSelected = false;

btnTopics.addEventListener('click', () => { modalEl.classList.remove('hidden'); });
toggleAllBtn.addEventListener('click', () => {
  allSelected = !allSelected;
  checkboxes.forEach(cb => cb.checked = allSelected);
  toggleAllBtn.textContent = allSelected ? 'Сбросить все' : 'Выбрать все';
  updateHint();
});
startBtn.addEventListener('click', async () => {
  const selected = checkboxes.filter(cb => cb.checked).map(cb => cb.value);
  if (selected.length === 0) { alert('Выберите хотя бы одну тему'); return; }
  modalEl.classList.add('hidden');
  await loadAndValidate(selected);
});

function updateHint(){
  const selected = checkboxes.filter(cb => cb.checked).length;
  hint.textContent = selected === 0 ? 'Изначально ничего не выбрано' : `Выбрано тем: ${selected}`;
}

async function loadRegistry(){
  const res = await fetch(REGISTRY_URL);
  if(!res.ok) throw new Error('Не удалось загрузить content/index.json');
  registry = await res.json(); renderTopics();
}
function renderTopics(){
  topicsEl.innerHTML = ''; checkboxes = [];
  for(const t of registry.topics.filter(t => t.enabled)){
    const row = document.createElement('label'); row.className = 'topic';
    const cb = document.createElement('input'); cb.type='checkbox'; cb.value = t.id;
    cb.addEventListener('change', updateHint);
    const span = document.createElement('span'); span.textContent = t.title;
    row.append(cb, span); topicsEl.appendChild(row); checkboxes.push(cb);
  }
  updateHint();
}

async function loadAndValidate(selectedIds){
  resultBox.textContent = 'Загружаем пакеты…';
  const selected = registry.topics.filter(t => selectedIds.includes(t.id));
  const packs = await Promise.all(selected.map(t => fetch(ROOT + 'content/' + t.pack).then(r => r.json())));
  const bank = packs.flatMap(p => p.questions.map(q => ({...q, topic: p.topic})));
  const { validateQuestionBank } = await import(ROOT + 'app/core/validators.js');
  const errors = validateQuestionBank(bank);
  const byTopic = bank.reduce((a,q)=>((a[q.topic]=(a[q.topic]||0)+1),a),{});
  const rows = Object.entries(byTopic).map(([k,v]) => `<li>${k}: <b>${v}</b></li>`).join('');
  resultBox.innerHTML = `
    <div class="row"><div class="badge">Выбрано тем: ${selected.length}</div><div class="badge">Вопросов: ${bank.length}</div><div class="badge">Ошибок: ${errors.length}</div></div>
    <ul>${rows}</ul>
    ${errors.length ? '<p>Первые ошибки см. в консоли.</p>' : '<p>Формат валиден. Можно идти к Фазе 3.</p>'}
  `;
  if(errors.length){ console.table(errors.slice(0,20)); }
}

loadRegistry().catch(e => { resultBox.textContent = 'Ошибка загрузки реестра тем: ' + e.message; });
