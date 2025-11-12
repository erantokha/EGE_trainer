// tasks/lightbox.js
// 1) Lightbox для увеличения картинок по клику
// 2) Фикс дублей нумерации в аккордеоне: "7. 7. Вычисления" → "7. Вычисления"

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

    // закрытие по клику на фон/крестик/ESC
    wrap.addEventListener('click', (e)=>{
      if (e.target.classList.contains('lightbox-backdrop') || e.target.classList.contains('lightbox-close')){
        closeLightbox();
      }
    });
    document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') closeLightbox(); });
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
    if (wrap) wrap.classList.remove('show');
  }

  // Пометить картинки как zoomable
  function markZoomable(root=document){
    // максимально широкий, но безопасный набор селекторов
    const selectors = [
      '.figure-wrap img',
      '#runner img',
      '#sheet img',
      '.task-list img',
      '.task-item img',
      '.stem img'
    ];
    const imgs = root.querySelectorAll(selectors.join(', '));
    imgs.forEach(img=>{
      if (!img.classList.contains('zoomable')) {
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
    const full = img.dataset.full || img.src; // можно указать data-full для полноразмерной версии
    openLightbox(full, img.alt);
  });

  // Фикс дублей нумерации
  function fixDuplicateNumbers(root=document){
    const nodes = root.querySelectorAll('.node .title');
    nodes.forEach(el=>{
      const t = (el.textContent || '').trim();
      // "8. 8. Производная ..." или "8. 8 Производная ..."
      let m = t.match(/^(\d+)\.\s+\1\.\s*(.*)$/);
      if (m) { el.textContent = `${m[1]}. ${m[2]}`; return; }
      m = t.match(/^(\d+)\.\s+\1\s+(.*)$/);
      if (m) { el.textContent = `${m[1]}. ${m[2]}`; return; }
    });
  }

  // Инициализация
  function init(root=document){
    ensureLightbox();
    markZoomable(root);
    fixDuplicateNumbers(root);
  }

  document.addEventListener('DOMContentLoaded', ()=> init());
  window.addEventListener('load', ()=> init());

  // На случай SPA — отслеживаем добавление узлов и помечаем новые картинки
  const mo = new MutationObserver((mutations)=>{
    for (const m of mutations){
      for (const node of m.addedNodes){
        if (!(node instanceof HTMLElement)) continue;
        init(node);
      }
    }
  });
  mo.observe(document.documentElement, {childList:true, subtree:true});

  // экспорт для ручного вызова
  window.TasksLightbox = { markZoomable, fixDuplicateNumbers, init };
})();
