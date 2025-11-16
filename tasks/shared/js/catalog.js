// tasks/shared/js/catalog.js
// Общие утилиты каталога: загрузка index.json, построение разделов,
// резолв путей ассетов. Делает надёжное определение корня репозитория
// и fallback, если сервер отдаёт 404 по основному пути.

// === Определяем корень репозитория (для GitHub Pages: /<repo>/) ===
function repoBasePath() {
  // Пример: /EGE_trainer/tasks/index.html  -> "/EGE_trainer/"
  //         /EGE_trainer/                  -> "/EGE_trainer/"
  //         /tasks/index.html (кастомный домен) -> "/"
  const segs = location.pathname.split('/').filter(Boolean);
  const first = segs[0] || '';
  if (first && first !== 'tasks') return `/${first}/`;
  return '/';
}
const REPO_BASE_ABS = new URL(repoBasePath(), location.origin).href;

// ЛЕГАСИ-база: подняться на уровень вверх от текущей страницы
const LEGACY_BASE_ABS = new URL('../', location.href).href;

// Экспортируем для отладки (можно смотреть в консоли)
export const __CATALOG_DEBUG__ = {
  REPO_BASE_ABS,
  LEGACY_BASE_ABS,
};

// --- Вспомогательный fetch с fallback ---
async function fetchWithFallback(relUrl) {
  const primary = new URL(relUrl, REPO_BASE_ABS).href;
  let resp = await fetch(primary, { cache: 'no-store' });
  if (resp.ok) return resp;

  const secondary = new URL(relUrl, LEGACY_BASE_ABS).href;
  resp = await fetch(secondary, { cache: 'no-store' });
  if (resp.ok) return resp;

  const err = new Error(
    `index.json not found.\nTried:\n 1) ${primary}\n 2) ${secondary}`
  );
  err.tried = [primary, secondary];
  throw err;
}

// --- ПУБЛИЧНЫЕ API ---

/** Загрузка общего индекса каталога задач */
export async function loadCatalogIndex() {
  const resp = await fetchWithFallback('content/tasks/index.json');
  return resp.json();
}

/** Преобразует "content/..." в абсолютный URL относительно корня репозитория */
export function asset(p) {
  return (typeof p === 'string' && p.startsWith('content/'))
    ? new URL(p, REPO_BASE_ABS).href
    : p;
}

/** Строит структуру «Раздел → Темы» из плоского индекса */
export function makeSections(catalog) {
  const sections = catalog.filter(x => x.type === 'group');
  const topics = catalog.filter(x => !!x.parent && x.enabled !== false);

  const byId = (a, b) => cmpId(a.id, b.id);

  for (const s of sections) {
    s.topics = topics.filter(t => t.parent === s.id).sort(byId);
  }
  sections.sort(byId);
  return sections;
}

// --- Утилита сортировки по составным id: "3.10" > "3.2" корректно ---
function cmpId(a, b) {
  const as = String(a).split('.').map(Number);
  const bs = String(b).split('.').map(Number);
  const n = Math.max(as.length, bs.length);
  for (let i = 0; i < n; i++) {
    const ai = as[i] ?? 0;
    const bi = bs[i] ?? 0;
    if (ai !== bi) return ai - bi;
  }
  return 0;
}
