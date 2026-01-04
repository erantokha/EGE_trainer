// app/bootstrap.js
// Единый "boot" для страниц:
// - запускает инициализацию даже если DOMContentLoaded уже был
// - ловит необработанные ошибки (чтобы не было "мертвых" кнопок без объяснения)
// - безопасно инициализирует шапку (Google Auth)

import { initHeader } from './ui/header.js?v=2025-12-29-1';

const BOOT_KEY = '__EGE_TRAINER_PAGE_BOOT__';

function alreadyBooted() {
  try {
    return !!window[BOOT_KEY];
  } catch (_) {
    return false;
  }
}

function markBooted() {
  try {
    window[BOOT_KEY] = true;
  } catch (_) {}
}

function ensureFatalBanner() {
  let box = document.getElementById('fatalBox');
  if (box) return box;

  box = document.createElement('div');
  box.id = 'fatalBox';
  box.style.cssText = [
    'position:fixed',
    'left:12px',
    'right:12px',
    'bottom:12px',
    'z-index:99999',
    'padding:10px',
    'border:1px solid #d33',
    'background:#fff',
    'color:#111',
    'border-radius:10px',
    'font:14px/1.35 system-ui, -apple-system, Segoe UI, Roboto, Arial',
  ].join(';');

  box.innerHTML = `
    <div style="display:flex;gap:10px;align-items:center;justify-content:space-between;">
      <div>Ошибка JavaScript: страница могла не инициализироваться.</div>
      <button id="fatalReload" type="button" style="padding:6px 10px;border-radius:10px;border:1px solid #aaa;background:#f5f5f5;cursor:pointer;">Перезагрузить</button>
    </div>
    <pre id="fatalText" style="white-space:pre-wrap;max-height:160px;overflow:auto;margin:10px 0 0"></pre>
  `;

  document.body.appendChild(box);
  box.querySelector('#fatalReload')?.addEventListener('click', () => location.reload());
  return box;
}

function reportFatal(kind, err) {
  try {
    console.error('[fatal]', kind, err);
  } catch (_) {}

  const msg =
    (err && (err.stack || err.message)) ? String(err.stack || err.message) : String(err);

  const box = ensureFatalBanner();
  const pre = box.querySelector('#fatalText');
  if (pre) pre.textContent = msg;
}

export function installGlobalErrorTrap() {
  // Ставим один раз, иначе будем дублировать баннеры/логи.
  if (alreadyBooted()) return;

  window.addEventListener('error', (e) => {
    reportFatal('error', e?.error || e?.message || e);
  });
  window.addEventListener('unhandledrejection', (e) => {
    reportFatal('unhandledrejection', e?.reason || e);
  });
}

function whenDomReady(fn) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn, { once: true });
  } else {
    fn();
  }
}

function hasHeaderMount(mount) {
  if (!mount) return false;
  if (typeof mount === 'string') return !!document.getElementById(mount);
  return mount instanceof Element;
}

export function bootPage({ headerOptions = null, init = async () => {} } = {}) {
  whenDomReady(async () => {
    // Важно: ошибки должны стать видимыми, иначе получаем "кнопки не работают" без следов.
    installGlobalErrorTrap();

    // Инициализация страницы тоже должна выполниться один раз.
    if (alreadyBooted()) return;
    markBooted();

    // Шапка: не ломаем страницу, даже если что-то с ней не так.
    try {
      if (headerOptions && hasHeaderMount(headerOptions.mount || 'appHeader')) {
        initHeader(headerOptions);
      }
    } catch (e) {
      console.warn('[boot] header init failed', e);
    }

    // Основной init страницы.
    try {
      await init();
    } catch (e) {
      reportFatal('init', e);
    }
  });
}
