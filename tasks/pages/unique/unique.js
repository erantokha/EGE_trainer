
import { $, $$, esc } from '../../shared/js/core/dom.js';
import { loadCatalog } from '../../shared/js/data/catalog.js';
import { ensureManifest } from '../../shared/js/data/manifests.js';

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(location.search);
  const sectionId = params.get('section');
  const sectionTitle = params.get('title') || sectionId;
  $('#uniqTitle').textContent = `Уникальные прототипы ФИПИ по номеру ${sectionTitle}`;

  const { groups } = await loadCatalog();
  const sec = groups.find(g=>g.id===sectionId);
  if(!sec){ $('#uniqAccordion').innerHTML='<div style="opacity:.8">Раздел не найден.</div>'; return; }

  const host = $('#uniqAccordion'); host.innerHTML='';
  for(const topic of sec.topics){
    const man = await ensureManifest(topic);
    if(!man) continue;
    // collect unique prototypes (proto.flags?.includes('unic') or proto.unic===true)
    const uniqueByType = [];
    for(const typ of (man.types||[])){
      const filtered = (typ.prototypes||[]).filter(p=> p.unic===true || (p.flags||[]).includes?.('unic'));
      if(!filtered.length) continue;
      uniqueByType.push({ type:typ, list:filtered });
    }
    if(!uniqueByType.length) continue;
    host.appendChild(renderTopic(topic, uniqueByType));
  }
});

function renderTopic(topic, blocks){
  const node = document.createElement('div');
  node.className='node section expanded';
  node.innerHTML = `
    <div class="row">
      <button class="title" style="cursor:pointer;background:transparent;border:none;padding:0;color:var(--text)">${esc(topic.id)}. ${esc(topic.title)}</button>
      <div class="spacer"></div>
    </div>
    <div class="children"></div>
  `;
  const ch = $('.children', node);

  for(const {type, list} of blocks){
    const part = document.createElement('div');
    part.className='node topic expanded';
    part.innerHTML = `
      <div class="row">
        <div class="title">${esc(type.title||type.id||'')}</div>
        <div class="spacer"></div>
      </div>
      <div class="children"></div>
    `;
    const inner = $('.children', part);
    for(const p of list){
      const card = document.createElement('article');
      card.className='ws-item';
      card.style.margin='8px 0';
      card.innerHTML = `
        <div class="ws-head">
          <div class="ws-num">${esc(p.id)}</div>
          <div class="ws-title">${esc(type.title||'')}</div>
        </div>
        <div class="ws-stem">${p.stem || ''}</div>
        ${ p.figure?.img ? `<div class="figure-wrap"><img src="${p.figure.img}" alt="${esc(p.figure.alt||'')}"></div>` : ''}
        <details class="ws-ans"><summary>Ответ</summary><div class="ws-ans-text">${esc(String(p.answer?.text ?? p.answer?.value ?? ''))}</div></details>
      `;
      inner.appendChild(card);
    }
    ch.appendChild(part);
  }

  // toggle for topic block
  $('.title', node).addEventListener('click', ()=>{
    node.classList.toggle('expanded');
  });

  // MathJax typeset
  if(window.MathJax?.typesetPromise) window.MathJax.typesetPromise([node]).catch(console.error);

  return node;
}
