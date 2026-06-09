// app/ui/nav.js
// Единая модификатор-aware навигация по страницам приложения.
//
// Зачем: переходы внутри приложения исторически делались через
// `<button>` + `window.open(..., '_blank')` / `location.href`. Из-за этого
// (1) некоторые страницы всегда открывались в новой вкладке и (2) нативный
// Ctrl/Cmd+click (и средний клик) не работал — у `<button>` нет href, который
// браузер мог бы открыть в новой вкладке.
//
// Контракт: по умолчанию — переход в ТЕКУЩЕЙ вкладке; при Ctrl/Cmd (или среднем
// клике) — в новой. Для async-переходов (URL известен только после запроса)
// используется пара reserveTab() + commitNavigation(): пустая вкладка
// открывается синхронно в рамках пользовательского жеста (иначе её заблокирует
// popup-блокировщик), а навигация в неё выполняется после await.

// true, если пользователь явно просит новую вкладку: Ctrl (win/linux) / Cmd (mac)
// или средний клик мыши (button === 1 / auxclick).
export function wantsNewTab(e) {
  if (!e) return false;
  if (e.type === 'auxclick' || e.button === 1) return true;
  return !!(e.metaKey || e.ctrlKey);
}

// Синхронная навигация. modifier → новая вкладка, иначе — текущая.
// noopener сознательно НЕ ставим: роль для сайдбара резолвится из
// localStorage('ege_role') cross-tab (см. picker.js), а копия sessionStorage
// в открытую вкладку полезна для legacy-флоу.
export function navigate(url, e) {
  const u = String(url || '');
  if (!u) return;
  if (wantsNewTab(e)) {
    try {
      const w = window.open(u, '_blank');
      if (w) return;
    } catch (_) { /* fallthrough на текущую вкладку */ }
  }
  location.assign(u);
}

// Для async-навигации: если нужен новый таб — открыть пустую вкладку СИНХРОННО
// (в рамках жеста, иначе popup-блокировщик). Вернёт окно или null.
export function reserveTab(e) {
  if (!wantsNewTab(e)) return null;
  try { return window.open('', '_blank') || null; } catch (_) { return null; }
}

// Завершить async-навигацию: в зарезервированную вкладку, если она есть и жива;
// иначе — в текущей. На любой ошибке деградирует до текущей вкладки.
export function commitNavigation(url, reservedTab) {
  const u = String(url || '');
  if (!u) {
    if (reservedTab) { try { reservedTab.close(); } catch (_) {} }
    return;
  }
  if (reservedTab && !reservedTab.closed) {
    try { reservedTab.location.href = u; return; } catch (_) {
      try { reservedTab.close(); } catch (_) {}
    }
  }
  location.assign(u);
}

// Удобный биндер для «чистых» nav-элементов (без доп. логики в обработчике):
// поддерживает Ctrl/Cmd (click) и средний клик (auxclick).
// getUrl — строка или функция (e) => string.
export function attachNav(el, getUrl) {
  if (!el) return;
  const handler = (e) => {
    if (e.type === 'auxclick' && e.button !== 1) return;
    const url = typeof getUrl === 'function' ? getUrl(e) : getUrl;
    if (!url) return;
    if (e.type === 'auxclick') e.preventDefault();
    navigate(url, e);
  };
  el.addEventListener('click', handler);
  el.addEventListener('auxclick', handler);
}
