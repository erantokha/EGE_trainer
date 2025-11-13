// tasks/lightbox.js
// 1) Lightbox для увеличения картинок по клику
// 2) Фикс дублей нумерации в аккордеоне

(function () {
  function ensureLightbox() {
    if (document.querySelector('.lightbox-backdrop')) return;
    const wrap = document.createElement('div');
    wrap.className = 'lightbox-backdrop';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.innerHTML = `
      <div class="lightbox-dialog">
        <button class="lightbox-close" aria-label="Закрыть">✕</button>
        <img class="lightbox-img" alt="">
      </div>
    `;
    document.body.appendChild(wrap);

    wrap.addEventListener('click', (e) => {
      if (
        e.target.classList.contains('lightbox-backdrop') ||
        e.target.classList.contains('lightbox-close')
      ) closeLightbox();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeLightbox();
    });
  }

  function openLightbox(src, alt) {
    ensureLightbox();
    const wrap = document.querySelector('.lightbox-backdrop');
    const img = wrap.querySelector('.lightbox-img');
    img.src = src;
    img.alt = alt || '';
    wrap.classList.add('show');
  }

  function closeLightbox() {
    const wrap = document.querySelector('.lightbox-backdrop');
    if (wrap) wrap.classList.remove('show');
  }

  function markZoomableIn(root) {
    const imgs = root.querySelectorAll('#runner .qfig img, #worksheet .worksheet-list img, .worksheet-list img');
    imgs.forEach((img) => {
      if (!img.classList.contains('zoomable')) {
        img.classList.add('zoomable');
        img.setAttribute('loading', 'lazy');
      }
    });
  }

  // Делегирование клика по картинке
  document.addEventListener('click', (e) => {
    const img = e.target.closest('img.zoomable');
    if (!img) return;
    e.preventDefault();
    openLightbox(img.dataset.full || img.src, img.alt);
  });

  // Фикс дублей "7. 7. Вычисления"
  function fixDuplicateNumbers() {
    document.querySelectorAll('.node .title').forEach((el) => {
      const t = (el.textContent || '').trim();
      let m = t.match(/^(\d+)\.\s+\1\.\s*(.*)$/);
      if (m) { el.textContent = `${m[1]}. ${m[2]}`; return; }
      m = t.match(/^(\d+)\.\s+\1\s+(.*)$/);
      if (m) { el.textContent = `${m[1]}. ${m[2]}`; return; }
    });
  }

  // Автопометка картинок при динамической подстановке
  function observeDynamic() {
    const targets = [document.body];
    const obs = new MutationObserver((mut) => {
      let needFix = false;
      mut.forEach((m) => {
        m.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          // если добавили runner/worksheet или внутри них появились img
          if (node.matches?.('#runner, #worksheet, .worksheet-list, .qfig') || node.querySelector?.('img')) {
            markZoomableIn(node);
          }
          if (node.querySelector?.('.node .title') || node.matches?.('.node .title')) needFix = true;
        });
      });
      if (needFix) fixDuplicateNumbers();
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  document.addEventListener('DOMContentLoaded', () => {
    ensureLightbox();
    markZoomableIn(document);
    fixDuplicateNumbers();
    observeDynamic();
  });
  window.addEventListener('load', () => {
    markZoomableIn(document);
    fixDuplicateNumbers();
  });

  // экспорт, если вдруг понадобится вручную
  window.TasksLightbox = {
    markZoomable: () => markZoomableIn(document),
    fixDuplicateNumbers
  };
})();
