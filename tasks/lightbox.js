// tasks/lightbox.js
// 1) Lightbox для увеличения картинок по клику
// 2) Фикс дублей нумерации в аккордеоне: вида "7. 7. Вычисления"

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

    // Закрытие по клику на фон/крестик/ESC
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

  // Помечаем картинки как кликабельные (в раннере и в режиме «задачи списком»)
  function markZoomable(){
    const selectors = [
      '#runner .figure-wrap img',
      '#sheet img',                 // если на листе задач используется контейнер с id="sheet"
      '.task-list img',             // на всякий случай, если список оформлен классом
      '.task-item img'              // и для карточек в списке
    ];
    const imgs = document.querySelectorAll(selectors.join(', '));
    imgs.forEach(img=>{
      img.classList.add('zoomable');
      img.setAttribute('loading','lazy');
    });
  }

  // Делегирование клика — открываем лайтбокс
  document.addEventListener('click', (e)=>{
    const img = e.target.closest('img.zoomable');
    if (!img) return;
    // игнорируем встроенные ссылки, если есть
    e.preventDefault();
    openLightbox(img.src, img.alt);
  });

  // Фикс «7. 7. Вычисления» → оставляем одно число.
  function fixDuplicateNumbers(){
    const nodes = document.querySelectorAll('.node .title');
    nodes.forEach(el=>{
      const t = (el.textContent || '').trim();
      // варианты: "7. 7. Вычисления" или "8. 8 Производная..."
      let m = t.match(/^(\d+)\.\s+\1\.\s*(.*)$/);
      if (m) { el.textContent = `${m[1]}. ${m[2]}`; return; }
      m = t.match(/^(\d+)\.\s+\1\s+(.*)$/);
      if (m) { el.textContent = `${m[1]}. ${m[2]}`; return; }
    });
  }

  // Инициализация
  document.addEventListener('DOMContentLoaded', ()=>{
    ensureLightbox();
    markZoomable();
    fixDuplicateNumbers();
  });

  // На случай динамической отрисовки (после смены страницы/рендера задач)
  window.addEventListener('load', ()=>{
    markZoomable();
    fixDuplicateNumbers();
  });

  // Экспорт для ручного вызова при SPA-перерисовках:
  window.TasksLightbox = { markZoomable, fixDuplicateNumbers };
})();
