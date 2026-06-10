// app/ui/confirm_finish.js
// Подтверждение завершения тренировки/ДЗ/аналога при пустых ответах.
// Self-contained: модалка + стили инжектятся модулем, страничные CSS не нужны.
// confirmFinish() -> Promise<boolean>: true = завершить, false = продолжить решение.

let STYLES_DONE = false;

function injectStyles() {
  if (STYLES_DONE) return;
  STYLES_DONE = true;
  const css = `
.cf-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10050;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(15, 23, 42, .45);
}
.cf-modal {
  width: 100%;
  max-width: 380px;
  background: var(--panel, #fff);
  color: var(--text, #0f172a);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 14px;
  box-shadow: 0 18px 50px rgba(15, 23, 42, .25);
  padding: 18px;
}
.cf-title {
  font-weight: 700;
  font-size: 16px;
  margin: 0 0 6px;
}
.cf-text {
  font-size: 14px;
  opacity: .9;
  margin: 0 0 14px;
  line-height: 1.45;
}
.cf-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  flex-wrap: wrap;
}
.cf-btn {
  appearance: none;
  border-radius: 10px;
  padding: 9px 14px;
  font-size: 14px;
  cursor: pointer;
  border: 1px solid var(--border, #cbd5e1);
  background: var(--panel-2, transparent);
  color: inherit;
}
.cf-btn:hover { filter: brightness(.97); }
.cf-btn.cf-primary {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
}
@media (max-width: 480px) {
  .cf-actions { flex-direction: column-reverse; }
  .cf-btn { width: 100%; }
}
`;
  const el = document.createElement('style');
  el.id = 'cf-styles';
  el.textContent = css;
  document.head.appendChild(el);
}

const TEXTS = {
  training: {
    title: 'Завершить тренировку?',
    msg: (e, t) => `У вас не заполнено ${e} из ${t} ответов. Завершить тренировку?`,
    ok: 'Завершить',
  },
  homework: {
    title: 'Сдать домашнее задание?',
    msg: (e, t) => `У вас не заполнено ${e} из ${t} ответов. Сдать домашнее задание?`,
    ok: 'Сдать',
  },
  analog: {
    title: 'Завершить?',
    msg: () => 'Ответ не заполнен. Завершить без ответа?',
    ok: 'Завершить',
  },
};

/**
 * Показывает подтверждение завершения.
 * @param {{empty:number, total:number, kind:'training'|'homework'|'analog'}} opts
 * @returns {Promise<boolean>} true = завершить, false = продолжить решение
 */
export function confirmFinish({ empty = 0, total = 0, kind = 'training' } = {}) {
  injectStyles();
  const t = TEXTS[kind] || TEXTS.training;

  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'cf-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');

    const modal = document.createElement('div');
    modal.className = 'cf-modal';

    const title = document.createElement('div');
    title.className = 'cf-title';
    title.textContent = t.title;

    const text = document.createElement('p');
    text.className = 'cf-text';
    text.textContent = t.msg(empty, total);

    const actions = document.createElement('div');
    actions.className = 'cf-actions';

    const contBtn = document.createElement('button');
    contBtn.type = 'button';
    contBtn.className = 'cf-btn';
    contBtn.id = 'cfContinue';
    contBtn.textContent = 'Продолжить решение';

    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'cf-btn cf-primary';
    okBtn.id = 'cfFinish';
    okBtn.textContent = t.ok;

    actions.appendChild(contBtn);
    actions.appendChild(okBtn);
    modal.appendChild(title);
    modal.appendChild(text);
    modal.appendChild(actions);
    backdrop.appendChild(modal);

    let done = false;
    const close = (result) => {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey, true);
      backdrop.remove();
      resolve(result);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(false);
      }
    };

    contBtn.addEventListener('click', () => close(false));
    okBtn.addEventListener('click', () => close(true));
    // клик по фону = «продолжить решение» (безопасный выбор)
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close(false);
    });
    document.addEventListener('keydown', onKey, true);

    document.body.appendChild(backdrop);
    try { contBtn.focus(); } catch (_) {}
  });
}
