// tasks/lightbox.js
// Лайтбокс + фиксация дублей нумерации в аккордеоне

(function(){
  function ensureLightbox(){
    if (document.querySelector('.lightbox-backdrop')) return;
    const wrap = document.createElement('div');
    wrap.className = 'lightbox-backdrop';
    wrap.setAttribute('role','dialog');
    wrap.setAttribute('aria-modal','true');
    wrap.innerHTML = `
      <div class="lightbox-dialog">
        <button class="lightbox-close" aria-label="Закрыть">✕</button>
        <img class="lightbox-img" alt="">
      </div>
    `;
    document.body.appendChild(wrap);

    wrap.addEventListener('click', (e)=>{
      if (e.target.classList.contains('lightbox-backdrop') || e.target.classList.contains('lightbox-close')){
        closeLightbox();
      }
    });
    document.addEventListener('keydown', (e)=>{
      if (e.key === 'Escape') closeLightbox();
    });
  }

  function openLightbox(src, alt){
    ensureLightbox();
    const wrap = document.querySelector('.lightbox-backdrop');
    const img  = wrap.querySelector('.lightbox-img');
    img.src = src;
    img.alt = alt || '';
    wrap.classList.add('show');
  }

  function closeLightbox(){
    const wrap = document.querySelector('.lightbox-backdrop');
    if (!wrap) return;
    wrap.classList.remove('show');
  }

  // Пометить картинки как zoomable
  function markZoomable(root=document){
    const selectors = [
      '#runner .qfig img',   // главная картинка в раннере
      'img#figure',          // явный id, если используется
      '#runner .figure-wrap img',
      '#sheet img',
      '.task-list img',
      '.task-item img'
    ];
    root.querySelectorAll(selectors.join(',')).forEach(img=>{
      if (!img.classList.contains('zoomable')){
        img.classList.add('zoomable');
        img.setAttribute('loading','lazy');
      }
    });
  }

  // Делегирование клика
  document.addEventListener('click', (e)=>{
    const img = e.target.closest('img.zoomable');
    if (!img) return;
    e.preventDefault();
    // если когда-нибудь добавишь data-full — используем его
    const src = img.dataset.full || img.src;
    openLightbox(src, img.alt);
  });

  // Фикс дублей нумерации ("7. 7. Вычисления")
  function fixDuplicateNumbers(){
    const nodes = document.querySelectorAll('.node .title');
    nodes.forEach(el=>{
      const t = (el.textContent || '').trim();
      let m = t.match(/^(\d+)\.\s+\1\.\s*(.*)$/);
      if (m) { el.textContent = `${m[1]}. ${m[2]}`; return; }
      m = t.match(/^(\d+)\.\s+\1\s+(.*)$/);
      if (m) { el.textContent = `${m[1]}. ${m[2]}`; return; }
    });
  }

  // Инициализация
  function init(){
    ensureLightbox();
    markZoomable();
    fixDuplicateNumbers();
  }

  document.addEventListener('DOMContentLoaded', init);
  window.addEventListener('load', ()=>markZoomable());

  // На случай SPA/динамики
  const mo = new MutationObserver((muts)=>{
    for (const m of muts){
      m.addedNodes && m.addedNodes.forEach(node=>{
        if (node.nodeType === 1){
          if (node.matches('img')) markZoomable(document);
          else if (node.querySelector) markZoomable(node);
        }
      });
    }
  });
  mo.observe(document.body, {childList:true, subtree:true});

  // Экспорт
  window.TasksLightbox = { markZoomable, fixDuplicateNumbers };
})();
