
import { $, $$ } from '../../shared/js/core/dom.js';
import { loadCatalog, baseHref } from '../../shared/js/data/catalog.js';
import { ensureManifest } from '../../shared/js/data/manifests.js';
import { CHOICE_TOPICS, CHOICE_SECTIONS, setSectionCount, setTopicCount, totalSelected } from '../../shared/js/data/picker-state.js';
import { distributeNonNegative, sample, buildQuestion } from '../../shared/js/runner/session-core.js';

let SECTIONS = [];

document.addEventListener('DOMContentLoaded', async () => {
  const { groups } = await loadCatalog();
  SECTIONS = groups;
  renderAccordion();

  $('#start')?.addEventListener('click', startSession);
});

function renderAccordion(){
  const host = $('#accordion');
  host.innerHTML = '';
  for(const sec of SECTIONS){
    host.appendChild(renderSectionNode(sec));
  }
  refreshTotal();
}

function renderSectionNode(sec){
  const node = document.createElement('div');
  node.className = 'node section';
  node.dataset.id = sec.id;
  node.innerHTML = `
    <div class="row">
      <div class="countbox">
        <button class="btn minus">−</button>
        <input class="count" type="number" min="0" step="1" value="${CHOICE_SECTIONS[sec.id]||0}">
        <button class="btn plus">+</button>
      </div>
      <button class="title section-toggle" style="cursor:pointer;background:transparent;border:none;padding:0;color:var(--text)">${sec.id}. ${sec.title}</button>
      <div class="inline-actions qa hidden">
        <a class="badge-btn" id="uniqBtn">Уникальные прототипы</a>
      </div>
      <div class="spacer"></div>
    </div>
    <div class="children"></div>
  `;

  const ch = $('.children', node);
  for(const t of sec.topics){
    ch.appendChild(renderTopicRow(t));
  }

  // toggle section: show/hide children AND the "Уникальные прототипы" badge
  const titleBtn = $('.section-toggle', node);
  titleBtn.addEventListener('click', () => {
    node.classList.toggle('expanded');
    // Show the unique button only for the active expanded section, hide for others
    $$('.node.section .qa').forEach(el => el.classList.add('hidden'));
    if(node.classList.contains('expanded')){
      $('.qa', node)?.classList.remove('hidden');
    } else {
      $('.qa', node)?.classList.add('hidden');
    }
  });

  // unique button opens new tab with section query
  const uniq = $('#uniqBtn', node);
  uniq?.addEventListener('click', (e)=>{
    e.preventDefault();
    const url = new URL('../unique/index.html', location.href);
    url.searchParams.set('section', sec.id);
    url.searchParams.set('title', `${sec.id}. ${sec.title}`);
    window.open(url.toString(), '_blank','noopener');
  });

  const num = $('.count', node);
  $('.minus', node).onclick = () => { num.value=Math.max(0, Number(num.value||0)-1); setSectionCount(sec.id, Number(num.value)); refreshTotal(); };
  $('.plus', node).onclick  = () => { num.value=Number(num.value||0)+1; setSectionCount(sec.id, Number(num.value)); refreshTotal(); };
  num.oninput = () => { const v=Math.max(0, Number(num.value||0)); num.value=v; setSectionCount(sec.id,v); refreshTotal(); };

  return node;
}

function renderTopicRow(topic){
  const row = document.createElement('div');
  row.className = 'node topic';
  row.dataset.id = topic.id;
  row.innerHTML = `
    <div class="row">
      <div class="countbox">
        <button class="btn minus">−</button>
        <input class="count" type="number" min="0" step="1" value="0">
        <button class="btn plus">+</button>
      </div>
      <div class="title topic-title">${topic.id}. ${topic.title}</div>
      <div class="spacer"></div>
    </div>
  `;

  const num = $('.count', row);
  $('.minus', row).onclick = () => { num.value=Math.max(0, Number(num.value||0)-1); setTopicCount(topic.id, Number(num.value)); refreshTotal(); };
  $('.plus', row).onclick  = () => { num.value=Number(num.value||0)+1; setTopicCount(topic.id, Number(num.value)); refreshTotal(); };
  num.oninput = () => { const v=Math.max(0, Number(num.value||0)); num.value=v; setTopicCount(topic.id,v); refreshTotal(); };

  return row;
}

function refreshTotal(){
  const total = totalSelected();
  const sumEl = $('#sum'); if(sumEl) sumEl.textContent = total;
  const start = $('#start');
  if(start){
    start.disabled = total<=0;
    start.classList.toggle('primary', total>0);
  }
}

async function startSession(){
  const chosen = [];
  const anyTopics = Object.values(CHOICE_TOPICS).some(v=>v>0);

  if (anyTopics){
    for(const sec of SECTIONS){
      for(const t of sec.topics){
        const want = CHOICE_TOPICS[t.id] || 0;
        if(!want) continue;
        const man = await ensureManifest(t);
        if(!man) continue;
        const caps = (man.types||[]).map(x=>({id:x.id, cap:(x.prototypes||[]).length}));
        const plan = distributeNonNegative(caps, want);
        for(const typ of man.types||[]){
          const k = plan.get(typ.id)||0; if(!k) continue;
          for(const p of sample(typ.prototypes||[], k)){
            chosen.push(buildQuestion(man, typ, p));
          }
        }
      }
    }
  } else {
    for(const sec of SECTIONS){
      const wantSection = CHOICE_SECTIONS[sec.id] || 0;
      if(!wantSection) continue;
      const topicCaps = [];
      for(const t of sec.topics){
        const man = await ensureManifest(t);
        if(!man) continue;
        const cap = (man.types||[]).reduce((s,x)=> s + (x.prototypes||[]).length, 0);
        topicCaps.push({ id:t.id, cap, _topic:t });
      }
      const planTopics = distributeNonNegative(topicCaps, wantSection);
      for(const {id} of topicCaps){
        const wantT = planTopics.get(id)||0;
        if(!wantT) continue;
        const topic = sec.topics.find(x=>x.id===id);
        const man = await ensureManifest(topic);
        if(!man) continue;
        const caps = (man.types||[]).map(x=>({id:x.id, cap:(x.prototypes||[]).length}));
        const plan = distributeNonNegative(caps, wantT);
        for(const typ of man.types||[]){
          const k = plan.get(typ.id)||0; if(!k) continue;
          for(const p of sample(typ.prototypes||[], k)){
            chosen.push(buildQuestion(man, typ, p));
          }
        }
      }
    }
  }

  sessionStorage.setItem('session_questions', JSON.stringify(chosen));
  const url = new URL('../session/index.html', location.href);
  location.href = url.toString();
}
