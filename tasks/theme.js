// theme.js
// Управление темой (тёмная/светлая) через data-theme и localStorage.
// Работает на всех страницах с чекбоксом #themeToggle.

(function () {
  const STORAGE_KEY = 'fipi_theme';

  function getInitialTheme() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') {
        return saved;
      }
    } catch (e) {
      // если localStorage недоступен — просто игнорируем
    }

    // если в хранилище нет, пробуем системную тему
    if (window.matchMedia) {
      try {
        if (window.matchMedia('(prefers-color-scheme: light)').matches) {
          return 'light';
        }
      } catch (e) {
        // ничего
      }
    }

    // по умолчанию — тёмная тема
    return 'dark';
  }

  function applyTheme(theme) {
    const t = theme === 'light' ? 'light' : 'dark';
    const root = document.documentElement;

    root.setAttribute('data-theme', t);
    if (document.body) {
      document.body.setAttribute('data-theme', t);
    }

    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch (e) {
      // если не получилось записать — не критично
    }

    syncToggle(t);
  }

  function syncToggle(theme) {
    const toggle = document.getElementById('themeToggle');
    if (!toggle) return;

    // считаем, что "включённый" чекбокс = тёмная тема
    toggle.checked = theme === 'dark';
  }

  function init() {
    const current = getInitialTheme();
    applyTheme(current);

    const toggle = document.getElementById('themeToggle');
    if (!toggle) return;

    toggle.addEventListener('change', () => {
      const next = toggle.checked ? 'dark' : 'light';
      applyTheme(next);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
