// tasks/shared/js/data/catalog.js
// Общие утилиты каталога: загрузка index.json, построение разделов,
// резолвинг путей к ассетам.

// ВНИМАНИЕ: страницы лежат в /tasks/pages/*/index.html.
// Чтобы попасть в корень репозитория (/EGE_trainer/), поднимаемся на 3 уровня.
const BASE = new URL('../../../', location.href);

/**
 * Преобразует относительный путь вида "content/..." в абсолютный URL.
 * Абсолютные ссылки/пустые значения возвращает как есть.
 */
export function asset(p) {
  return (typeof p === 'string' && p.startsWith('content/'))
    ? new URL(p, BASE).href
    : p;
}

/**
 * Загружает общий индекс каталога задач: /content/tasks/index.json
 */
export async function loadCatalogIndex() {
  const url = new URL('content/tasks/index.json', BASE).href;
  const resp = await fetch(url, { cache: 'no-store' });
  if (!resp.ok) {
    throw new Error(`index.json not found (${resp.status}) at ${url}`);
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
  const topics   = catalog.filter(x => !!x.parent && x.enabled !== false);

  const byId = (a, b) => cmpId(a.id, b.id);

  for (const s of sections) {
    s.topics = topics.filter(t => t.parent === s.id).sort(byId);
  }

  sections.sort(byId);
  return sections;
}

// ---------- helpers ----------
function cmpId(a, b) {
  const as = String(a).split('.').map(Number);
  const bs = String(b).split('.').map(Number);
  const L = Math.max(as.length, bs.length);
  for (let i = 0; i < L; i++) {
    const ai = as[i] ?? 0;
    const bi = bs[i] ?? 0;
    if (ai !== bi) return ai - bi;
  }
  return 0;
}
