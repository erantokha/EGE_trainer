// tasks/shared/js/data/catalog.js
// Общие утилиты каталога: определение корня репозитория,
// резолвинг путей к ассетам, загрузка index.json и построение "раздел → темы".

/**
 * Корневой href репозитория (например, https://erantokha.github.io/EGE_trainer/).
 * Работает локально (file:/, http://localhost) и на GitHub Pages.
 * Можно переопределить через window.__DEBUG_ROOT__() во время отладки.
 */
export function baseHref() {
  if (typeof window !== 'undefined' && typeof window.__DEBUG_ROOT__ === 'function') {
    try {
      const u = String(window.__DEBUG_ROOT__());
      if (u) return u.endsWith('/') ? u : u + '/';
    } catch {}
  }
  const { origin, pathname } = location;
  // Пример pathname: /EGE_trainer/tasks/pages/picker/index.html
  const parts = pathname.split('/').filter(Boolean);
  const repo = parts[0] || '';
  return repo ? `${origin}/${repo}/` : `${origin}/`;
}

// Абсолютная база для построения URL'ов
const BASE = baseHref();

/**
 * Преобразует относительный путь вида "content/..." в абсолютный URL.
 * Абсолютные ссылки/пустые значения возвращает как есть.
 */
export function asset(p) {
  return (typeof p === 'string' && p.startsWith('content/'))
    ? new URL(p, BASE).href
    : p;
}

/** Загрузка общего индекса каталога задач: /content/tasks/index.json */
export async function loadCatalogIndex() {
  const url = new URL('content/tasks/index.json', BASE).href;
  const resp = await fetch(url, { cache: 'no-store' });
  if (!resp.ok) throw new Error(`index.json not found (${resp.status}) at ${url}`);
  return resp.json();
}

/**
 * Построение структуры "Раздел → Темы" из плоского индекса.
 * Возвращает массив разделов: [{ id, title, topics: [{id,title,path}, ...] }, ...]
 */
export function makeSections(catalog) {
  const sections = catalog.filter((x) => x.type === 'group');
  const topics   = catalog.filter((x) => !!x.parent && x.enabled !== false);

  const byId = (a, b) => cmpId(a.id, b.id);

  for (const s of sections) {
    s.topics = topics.filter((t) => t.parent === s.id).sort(byId);
  }
  sections.sort(byId);
  return sections;
}

/**
 * СОВМЕСТИМЫЙ «старый» API для страниц, которые ожидают loadCatalog().
 * Загружает индекс и возвращает объект { catalog, sections }.
 * (Раньше функция могла мутировать внешние переменные — теперь она чистая.)
 */
export async function loadCatalog() {
  const catalog = await loadCatalogIndex();
  const sections = makeSections(catalog);
  return { catalog, sections };
}

// ---------------- helpers ----------------
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

export default { baseHref, asset, loadCatalogIndex, makeSections, loadCatalog };
