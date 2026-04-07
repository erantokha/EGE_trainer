// app/ui/print_btn.js
// Кнопка «Печать» — показывает диалог настроек, принудительно загружает
// lazy-картинки, ждёт MathJax и вызывает window.print().

export function initPrintBtn(opts = {}) {
  const btn = document.getElementById('printBtn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      let settings;
      try {
        settings = await showPrintDialog(opts);
      } catch (_) {
        return; // пользователь нажал «Отмена» или Escape
      }

      // Временный заголовок поверх контента (виден только в @media print)
      let titleEl = null;
      if (settings.title) {
        titleEl = document.createElement('div');
        titleEl.className = 'print-custom-title';
        titleEl.textContent = settings.title;
        const panel = document.querySelector('.panel') || document.body;
        panel.insertBefore(titleEl, panel.firstChild);
      }

      // Раскрываем <details> с ответами, чтобы браузер их показал в печати
      const openedDetails = [];
      if (settings.withAnswers) {
        document.body.classList.add('print-with-answers');
        document.querySelectorAll('details.task-ans, details.ws-ans').forEach(d => {
          if (!d.open) { d.open = true; openedDetails.push(d); }
        });
      }

      try {
        await forceLoadImages();
        if (window.MathJax?.typesetPromise) {
          await window.MathJax.typesetPromise();
        }
      } catch (_) {}

      window.print();

      // Очистка после печати
      titleEl?.remove();
      document.body.classList.remove('print-with-answers');
      openedDetails.forEach(d => { d.open = false; });
    } finally {
      setTimeout(() => { btn.disabled = false; }, 500);
    }
  });
}

// ── Диалог настроек печати ──────────────────────────────────────────────────

function showPrintDialog({ hideAnswers = false } = {}) {
  return new Promise((resolve, reject) => {
    const overlay = document.createElement('div');
    overlay.className = 'print-dialog-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'print-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'printDialogH');

    dialog.innerHTML = `
      <h2 class="print-dialog-h" id="printDialogH">Настройки печати</h2>
      <div class="print-dialog-field">
        <label class="print-dialog-label" for="pdTitleInput">Заголовок (необязательно)</label>
        <input type="text" id="pdTitleInput" class="print-dialog-input"
               placeholder="Например: Контрольная работа №1" autocomplete="off" maxlength="200">
      </div>
      ${hideAnswers ? '' : `
      <div class="print-dialog-check-row">
        <input type="checkbox" id="pdWithAnswers" class="print-dialog-check">
        <label for="pdWithAnswers">Печатать с ответами</label>
      </div>`}
      <div class="print-dialog-actions">
        <button type="button" class="print-dialog-cancel">Отмена</button>
        <button type="button" class="print-dialog-confirm">Печать</button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Фокус на поле заголовка
    requestAnimationFrame(() => dialog.querySelector('#pdTitleInput').focus());

    function close(result) {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      if (result !== null) resolve(result);
      else reject(new Error('cancelled'));
    }

    function onKey(e) {
      if (e.key === 'Escape') close(null);
    }
    document.addEventListener('keydown', onKey);

    // Закрыть по клику на фон
    overlay.addEventListener('click', e => { if (e.target === overlay) close(null); });

    dialog.querySelector('.print-dialog-cancel').addEventListener('click', () => close(null));

    function confirm() {
      const title = dialog.querySelector('#pdTitleInput').value.trim();
      const withAnswers = dialog.querySelector('#pdWithAnswers')?.checked ?? false;
      close({ title, withAnswers });
    }

    dialog.querySelector('.print-dialog-confirm').addEventListener('click', confirm);
    dialog.querySelector('#pdTitleInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') confirm();
    });
  });
}

// ── Принудительная загрузка lazy-картинок ───────────────────────────────────

async function forceLoadImages() {
  // Переключаем все lazy-картинки в eager и сбрасываем src,
  // чтобы браузер загрузил их вне зависимости от положения прокрутки.
  for (const img of document.querySelectorAll('img[loading="lazy"]')) {
    img.loading = 'eager';
    if (!img.complete) {
      const src = img.src;
      img.src = '';
      img.src = src;
    }
  }

  const pending = Array.from(document.querySelectorAll('img'))
    .filter(img => img.src && !img.complete);

  if (!pending.length) return;

  const allLoaded = Promise.all(
    pending.map(img => new Promise(resolve => {
      img.addEventListener('load',  resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
    }))
  );

  // Таймаут 12 с: если картинка не грузится — всё равно открываем печать
  await Promise.race([allLoaded, new Promise(r => setTimeout(r, 12000))]);
}
