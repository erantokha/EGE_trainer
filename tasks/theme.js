// theme.js
// Всегда светлая тема: выставляем data-theme="light" и (при возможности) сохраняем в localStorage.
// Тёмную тему игнорируем даже если она была сохранена раньше.

(function () {
  const STORAGE_KEY = 'fipi_theme';

  function getInitialTheme() {
    // Игнорируем сохранённый "dark". Поддерживаем только "light".
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'light') return 'light';
    } catch (e) {
      // если localStorage недоступен — игнорируем
    }
    return 'light';
  }

  function applyTheme(theme) {
    // Жёстко фиксируем светлую тему
    const t = 'light';
    const root = document.documentElement;

    root.setAttribute('data-theme', t);
    // полезно для встроенных элементов (формы/скроллбары) на части браузеров
    try { root.style.colorScheme = 'light'; } catch (e) {}

    if (document.body) {
      document.body.setAttribute('data-theme', t);
      try { document.body.style.colorScheme = 'light'; } catch (e) {}
    }

    // Перезаписываем возможный старый "dark" на "light"
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch (e) {
      // не критично
    }

    syncToggle(t);
  }

  function syncToggle(theme) {
    const toggle = document.getElementById('themeToggle');
    if (!toggle) return;

    // если чекбокс существует, делаем его "выключенным" (т.к. dark запрещён)
    toggle.checked = false;
    toggle.disabled = true;
  }

  function init() {
    const current = getInitialTheme();
    applyTheme(current);

    const toggle = document.getElementById('themeToggle');
    if (!toggle) return;

    // На всякий случай: даже если кто-то включит, возвращаем светлую
    toggle.addEventListener('change', () => {
      applyTheme('light');
    });
  

  try { window.__EGE_DIAG__?.markReady?.(); } catch (_) {}
}

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
