// tasks/shared/js/catalog.js
// Общие утилиты каталога: загрузка index.json, построение разделов,
// корректное вычисление BASE для GitHub Pages при любой вложенности страниц.

/**
 * Определяем базу репозитория (до папки /tasks/).
 * Работает как из /tasks/index.html, так и из /tasks/pages/*.html, /tasks/unique.html и т.п.
 * Примеры:
 *   https://site.io/EGE_trainer/tasks/index.html           → https://site.io/EGE_trainer/
 *   https://site.io/EGE_trainer/tasks/pages/index.html     → https://site.io/EGE_trainer/
 *   http://localhost:5173/tasks/pages/index.html           → http://localhost:5173/
 */
function computeRepoBaseHref() {
  const { origin, pathname } = location; // напр. "/EGE_trainer/tasks/pages/index.html"
  const idx = pathname.indexOf('/tasks/'); // позиция сегмента "/tasks/"
  if (idx >= 0) {
    // Берём всё до "/tasks/" (включая завершающий "/")
    const rootPath = pathname.slice(0, idx + 1); // напр. "/EGE_trainer/"
    return origin + rootPath;
  }
  // Фолбэк: поднимемся на два уровня (страховка для нетипичных путей)
  const u = new URL('../../', location.href);
  return u.href;
}

// База репозитория, к которой относительно подключаем /content/...
const REPO_BASE = computeRepoBaseHref();

/**
 * Преобразует относительный путь вида "content/..." в абсолютный URL.
 * Если на вход пришёл нестроковый путь или он не начинается с "content/",
 * возвращаем как есть (для абсолютных ссылок/пустых значений).
 */
export function asset(p) {
  return (typeof p === 'string' && p.startsWith('content/'))
    ? new URL(p, REPO_BASE).href
    : p;
}

/**
 * Загружает общий индекс каталога задач.
 * Ожидается файл /content/tasks/index.json (относительно корня репозитория).
 */
export async function loadCatalogIndex() {
  const url = new URL('content/tasks/index.json', REPO_BASE).href;
  const resp = await fetch(url, { cache: 'no-store' });
  if (!resp.ok) {
    throw new Error(`Не удалось загрузить ${url}: ${resp.status} ${resp.statusText}`);
  }
  return resp.json();
}

/**
 * Строит структуру "Раздел → Темы" из плоского индекса.
 * Возвращает массив разделов вида:
 * [{ id, title, topics: [{id,title,path}, ...] }, ...]
 */
export function makeSections(catalog) {
  const sections = catalog.filter(x => x.type === 'group');

  // Все узлы, у которых есть parent, — это темы (второй уровень)
  const topics = catalog.filter(x => !!x.parent && x.enabled !== false);

  // Сортировка по «числовому» id: 3.10 > 3.2 корректно
  const byId = (a, b) => cmpId(a.id, b.id);

  for (const s of sections) {
    s.topics = topics.filter(t => t.parent === s.id).sort(byId);
  }

  sections.sort(byId);
  return sections;
}

// --------- Вспомогательные ---------
function cmpId(a, b) {
  const as = String(a).split('.').map(x => Number(x));
  const bs = String(b).split('.').map(x => Number(x));
  const len = Math.max(as.length, bs.length);
  for (let i = 0; i < len; i++) {
    const ai = as[i] ?? 0;
    const bi = bs[i] ?? 0;
    if (ai !== bi) return ai - bi;
  }
  return 0;
}

// Экспортируем на всякий случай базу — удобно для диагностики в консоли
export const __DEBUG_BASE__ = REPO_BASE;
