// tasks/shared/js/data/manifests.js
// Загрузка манифестов тем (content/.../*.json) и нормализация путей.

// Поднимаемся из /tasks/pages/*/ к корню репозитория:
const BASE = new URL('../../../', location.href);

/**
 * Сформировать абсолютный URL к файлу манифеста/картинке.
 */
export function asset(p) {
  return (typeof p === 'string' && p.startsWith('content/'))
    ? new URL(p, BASE).href
    : p;
}

/**
 * Загрузить манифест по объекту темы (с полем path) или по строковому пути.
 * Возвращает JSON манифеста.
 */
export async function loadManifest(topicOrPath) {
  const path = typeof topicOrPath === 'string' ? topicOrPath : topicOrPath?.path;
  if (!path) throw new Error('loadManifest: empty path');

  const url = new URL(path, BASE).href;
  const resp = await fetch(url, { cache: 'no-store' });
  if (!resp.ok) {
    throw new Error(`manifest not found (${resp.status}) at ${url}`);
  }
  return resp.json();
}
