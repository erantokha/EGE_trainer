
import { $ } from '../../shared/js/core/dom.js';
import { loadCatalog } from '../../shared/js/data/catalog.js';
import { ensureManifest } from '../../shared/js/data/manifests.js';

const BASE = new URL('../../', location.href);
const asset = (p)=> typeof p==='string' && p.startsWith('content/') ? new URL(p, BASE).href : p;

document.addEventListener('DOMContentLoaded', () => {
  initWorksheet().catch(e=>{
    console.error(e);
    const host = $('#wsContent');
    if(host){ host.innerHTML = '<div style="opacity:.8">Ошибка загрузки задач. Проверьте index.json и манифесты.</div>'; }
  });
});

function getSectionIdFromQuery(){
  const params = new URLSearchParams(location.search);
  const sec = params.get('section');
  return sec && sec.trim() ? sec.trim() : null;
}

async function initWorksheet(){
  const sectionId = getSectionIdFromQuery();
  const titleEl = $('#wsTitle');
  const metaEl = $('#wsMeta');
  const host = $('#wsContent');
  if(!sectionId){ titleEl.textContent='Раздел не указан'; host.innerHTML='<div style="opacity:.8">В URL не указан параметр section.</div>'; return; }

  const { CATALOG, groups } = await loadCatalog();
  const section = groups.find(x=>x.id===sectionId);
  if(!section){ titleEl.textContent = `Раздел ${sectionId} не найден`; host.innerHTML='<div style="opacity:.8">В index.json нет такого раздела.</div>'; return; }

  titleEl.textContent = `${section.id}. ${section.title}`;
  metaEl.textContent = 'Ниже приведены все прототипы задач по выбранному номеру (все темы данного раздела).';

  const topics = section.topics.filter(x=> x.path && (x.enabled===undefined || x.enabled===true));
  if(!topics.length){ host.innerHTML = '<div style="opacity:.8">Для этого раздела пока нет тем с манифестами.</div>'; return; }

  const questions = [];
  for(const topic of topics){
    const man = await ensureManifest(topic); if(!man) continue;
    const topicTitle = man.title || topic.title || '';
    const topicId = man.topic || topic.id || '';
    for(const type of (man.types||[])){
      const typeTitle = type.title || '';
      const stemTplBase = type.stem_template || type.stem || '';
      for(const proto of (type.prototypes||[])){
        const params = proto.params || {};
        const stemTpl = proto.stem || stemTplBase;
        const stem = String(stemTpl||'').replace(/\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g,(_,k)=> params[k]!==undefined ? String(params[k]) : '');
        const fig = proto.figure || type.figure || null;
        const ans = proto.answer?.text ?? (proto.answer?.value!=null ? String(proto.answer.value):'');
        questions.push({ topicId, topicTitle, typeId:type.id, typeTitle, questionId:proto.id, stem, figure:fig, answer:ans });
      }
    }
  }
  questions.sort((a,b)=> a.questionId<b.questionId?-1:a.questionId>b.questionId?1:0);
  renderQuestions(host, questions);
}

function renderQuestions(host, list){
  if(!list.length){ host.innerHTML='<div style="opacity:.8">В манифестах для этого раздела пока нет задач.</div>'; return; }
  host.innerHTML = '';
  for(const q of list){
    const card = document.createElement('article');
    card.className='ws-item';
    card.innerHTML = `
      <div class="ws-head">
        <div class="ws-num">${q.questionId||''}</div>
        <div class="ws-title">${q.topicTitle||''}${q.typeTitle ? ' • '+q.typeTitle : ''}</div>
      </div>
      <div class="ws-stem">${q.stem}</div>
      ${ q.figure?.img ? `<div class="figure-wrap"><img src="${asset(q.figure.img)}" alt="${q.figure.alt||''}"></div>` : '' }
      <details class="ws-ans"><summary>Ответ</summary><div class="ws-ans-text">${String(q.answer??'')}</div></details>
    `;
    host.appendChild(card);
  }
  if(window.MathJax?.typesetPromise){
    window.MathJax.typesetPromise([host]).catch(console.error);
  }else if(window.MathJax?.typeset){
    window.MathJax.typeset([host]);
  }
}
