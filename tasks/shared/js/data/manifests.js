// tasks/shared/js/data/manifests.js
// Загрузка и кэширование манифестов тем (content/tasks/**.json)

import { baseHref, asset } from './catalog.js';

/** Абсолютный URL к файлу манифеста темы. */
function manifestUrl(topic) {
  if (!topic || !topic.path) throw new Error('Topic has no path');
  const root = baseHref();                 // https://…/EGE_trainer/
  return new URL(asset(topic.path), root).href;
}

/**
 * Загружает и кэширует манифест в topic._manifest.
 * Возвращает объект манифеста.
 */
export async function ensureManifest(topic) {
  if (!topic) return null;
  if (topic._manifest) return topic._manifest;

  const url = manifestUrl(topic);
  const resp = await fetch(url, { cache: 'no-store' });
  if (!resp.ok) throw new Error(`Manifest not found (${resp.status}) at ${url}`);

  const man = await resp.json();
  // Заполняем базовые поля, если их нет в JSON
  if (!man.topic) man.topic = topic.id || '';
  if (!man.title) man.title = topic.title || '';

  topic._manifest = man;
  return man;
}

/** Суммарная «вместимость» (кол-во прототипов) по манифесту. */
export function prototypesCapacity(manifest) {
  return (manifest?.types || []).reduce((s, t) => s + (t.prototypes?.length || 0), 0);
}

// На всякий случай — default-экспорт совместимости,
// если где-то вдруг импортировали по умолчанию.
export default { ensureManifest, prototypesCapacity };
