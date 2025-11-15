// tasks/shared/js/catalog.js
// Единая точка истины для путей и загрузки каталога

// URL папки /tasks/ (на 2 уровня выше этого файла)
export const TASKS_ROOT = new URL('../../', import.meta.url);

/**
 * Безопасное преобразование относительных путей активов из каталога
 * в абсолютные URL (для GitHub Pages с подкаталогом репозитория).
 * Применяем только к путям, начинающимся с "content/".
 */
export function asset(p) {
  return (typeof p === 'string' && p.startsWith('content/'))
    ? new URL(p, TASKS_ROOT).href
    : p;
}

/**
 * Надёжная загрузка каталога с несколькими кандидатами путей.
 * Первый успешно найденный index будет использован.
 */
export async function loadCatalogIndex() {
  const candidates = [
    'content/tasks/index.json', // основной путь
    'content/index.json',       // запасной
    'index.json'                // крайний случай (локалка)
  ];

  let lastErr = null;
  for (const rel of candidates) {
    const url = new URL(rel, TASKS_ROOT).href;
    try {
      const resp = await fetch(url, { cache: 'no-store' });
      if (resp.ok) {
        const json = await resp.json();
        return json;
      }
      lastErr = new Error(`HTTP ${resp.status} @ ${url}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`index.json not found. Tried: ${candidates.map(c => new URL(c, TASKS_ROOT).href).join(', ')}\nLast error: ${lastErr}`);
}

/**
 * Удобный конструктор дерева разделов:
 * [{id,title,topics:[{...}, ...]}, ...]
 */
export function makeSections(catalog) {
  const sections = catalog.filter(x => x.type === 'group');
  for (const sec of sections) {
    sec.topics = catalog.filter(x => x.parent === sec.id);
  }
  return sections;
}
