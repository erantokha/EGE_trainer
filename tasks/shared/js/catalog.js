// tasks/shared/js/catalog.js
// Общие утилиты каталога: загрузка index.json, построение разделов, резолвинг путей к ассетам.

const BASE = new URL('../', location.href); // страницы лежат в /tasks/*.html — поднимаемся на уровень вверх к корню

/**
 * Преобразует относительный путь вида "content/..." в абсолютный URL.
 * Если на вход пришёл нестроковый путь или он не начинается с "content/",
 * возвращаем как есть (для абсолютных ссылок/пустых значений).
 */
export function asset(p) {
  return (typeof p === 'string' && p.startsWith('content/'))
    ? new URL(p, BASE).href
    : p;
}

/**
 * Загружает общий индекс каталога задач.
 * Ожидается файл /content/tasks/index.json
 */
export async function loadCatalogIndex() {
  const url = new URL('content/tasks/index.json', BASE).href;
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

  // Отсортируем и сами разделы
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
