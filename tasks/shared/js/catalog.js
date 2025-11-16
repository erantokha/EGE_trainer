// Общие утилиты каталога: загрузка index.json, построение разделов, резолвинг ассетов.

// Определяем корень репозитория до сегмента "/tasks/"
const ROOT = (() => {
  const u = new URL(location.href);
  const i = u.pathname.indexOf('/tasks/');
  // если страница внутри /tasks/... → обрезаем до корня репо, иначе оставляем текущую директорию
  u.pathname = i !== -1 ? u.pathname.slice(0, i + 1) : u.pathname.replace(/[^/]*$/, '');
  u.search = '';
  u.hash = '';
  return u.origin + u.pathname; // оканчивается на "/"
})();

/** Преобразует "content/…" в абсолютный URL от корня репозитория. */
export function asset(p) {
  return (typeof p === 'string' && p.startsWith('content/'))
    ? new URL(p, ROOT).href
    : p;
}

/** Загружает общий индекс каталога задач: /content/tasks/index.json */
export async function loadCatalogIndex() {
  const url = new URL('content/tasks/index.json', ROOT).href;
  const resp = await fetch(url, { cache: 'no-store' });
  if (!resp.ok) throw new Error(`index.json not found at ${url}`);
  return resp.json();
}

/** Строит структуру "Раздел → Темы" из плоского индекса. */
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
    const da = as[i] ?? 0, db = bs[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}

// Небольшой хелпер для отладки в консоли (не обязателен)
export function __CATALOG_DEBUG__() { return { href: location.href, ROOT }; }
