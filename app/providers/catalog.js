// app/providers/catalog.js
// Stage 1 catalog provider:
// - prefers canonical RPC public.catalog_tree_v1()
// - falls back to layer-2 catalog tables while RPC is not deployed yet
// - exposes a legacy-compatible adapter for current stats/student screens

import { supaRest } from './supabase-rest.js?v=2026-03-29-9';

let __treeCache = null;
let __treePromise = null;
let __legacyCache = null;

function asText(value) {
  return String(value ?? '').trim();
}

function asSort(value, fallback = 999999) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function compareByOrderThenId(a, b, idKey) {
  const d = asSort(a?.sort_order) - asSort(b?.sort_order);
  if (d !== 0) return d;
  return asText(a?.[idKey]).localeCompare(asText(b?.[idKey]), 'ru');
}

function isMissingCatalogTreeRpc(err) {
  const status = Number(err?.status || err?.httpStatus || 0) || 0;
  const details = err?.details;

  let text = String(err?.message || '');
  if (typeof details === 'string') text += ` ${details}`;
  else if (details && typeof details === 'object') {
    try { text += ` ${JSON.stringify(details)}`; } catch (_) {}
  }

  text = text.toLowerCase();

  return (
    err?.code === 'RPC_ERROR' &&
    (
      status === 404 ||
      text.includes('pgrst202') ||
      text.includes('could not find the function') ||
      text.includes('unknown function') ||
      (text.includes('catalog_tree_v1') && text.includes('not found'))
    )
  );
}

function normalizeSubtopic(item) {
  const subtopicId = asText(item?.subtopic_id);
  const themeId = asText(item?.theme_id);
  const title = asText(item?.title);
  if (!subtopicId || !themeId || !title) return null;

  return {
    subtopic_id: subtopicId,
    theme_id: themeId,
    title,
    sort_order: asSort(item?.sort_order),
  };
}

function normalizeTheme(item) {
  const themeId = asText(item?.theme_id);
  const title = asText(item?.title);
  if (!themeId || !title) return null;

  const rawSubtopics = Array.isArray(item?.subtopics) ? item.subtopics : [];
  const subtopics = rawSubtopics
    .map(normalizeSubtopic)
    .filter(Boolean)
    .sort((a, b) => compareByOrderThenId(a, b, 'subtopic_id'));

  return {
    theme_id: themeId,
    title,
    sort_order: asSort(item?.sort_order),
    total_subtopics: subtopics.length,
    subtopics,
  };
}

function buildTreeFromRows(themeRows, subtopicRows) {
  const themeMap = new Map();
  let catalogVersion = '';

  for (const row of (Array.isArray(themeRows) ? themeRows : [])) {
    const themeId = asText(row?.theme_id);
    const title = asText(row?.title);
    if (!themeId || !title) continue;

    const item = {
      theme_id: themeId,
      title,
      sort_order: asSort(row?.sort_order),
      total_subtopics: 0,
      subtopics: [],
    };
    themeMap.set(themeId, item);

    const version = asText(row?.catalog_version);
    if (version) catalogVersion = version;
  }

  for (const row of (Array.isArray(subtopicRows) ? subtopicRows : [])) {
    const subtopic = normalizeSubtopic(row);
    if (!subtopic) continue;

    const theme = themeMap.get(subtopic.theme_id);
    if (!theme) continue;

    theme.subtopics.push(subtopic);

    const version = asText(row?.catalog_version);
    if (version) catalogVersion = version;
  }

  const themes = Array.from(themeMap.values())
    .map((theme) => ({
      ...theme,
      subtopics: theme.subtopics.sort((a, b) => compareByOrderThenId(a, b, 'subtopic_id')),
      total_subtopics: theme.subtopics.length,
    }))
    .sort((a, b) => compareByOrderThenId(a, b, 'theme_id'));

  let totalSubtopics = 0;
  for (const theme of themes) totalSubtopics += theme.subtopics.length;

  return {
    themes,
    meta: {
      catalog_version: catalogVersion,
      generated_at: new Date().toISOString(),
      total_themes: themes.length,
      total_subtopics: totalSubtopics,
      version: 'catalog_tree_v1',
    },
  };
}

function normalizeTreePayload(payload) {
  const rawThemes = Array.isArray(payload?.themes) ? payload.themes : [];
  const themes = rawThemes
    .map(normalizeTheme)
    .filter(Boolean)
    .sort((a, b) => compareByOrderThenId(a, b, 'theme_id'));

  let totalSubtopics = 0;
  for (const theme of themes) totalSubtopics += theme.subtopics.length;

  const rawMeta = (payload?.meta && typeof payload.meta === 'object') ? payload.meta : {};

  return {
    themes,
    meta: {
      catalog_version: asText(rawMeta.catalog_version),
      generated_at: rawMeta.generated_at || new Date().toISOString(),
      total_themes: Number(rawMeta.total_themes) || themes.length,
      total_subtopics: Number(rawMeta.total_subtopics) || totalSubtopics,
      version: asText(rawMeta.version) || 'catalog_tree_v1',
    },
  };
}

async function loadCatalogTreeViaRpc(timeoutMs) {
  const data = await supaRest.rpcAny(['catalog_tree_v1'], {}, { timeoutMs });
  return normalizeTreePayload(data);
}

async function loadCatalogTreeViaTables(timeoutMs) {
  const [themes, subtopics] = await Promise.all([
    supaRest.select(
      'catalog_theme_dim',
      'select=theme_id,title,sort_order,catalog_version&is_enabled=eq.true&is_hidden=eq.false&order=sort_order.asc,theme_id.asc',
      { timeoutMs }
    ),
    supaRest.select(
      'catalog_subtopic_dim',
      'select=subtopic_id,theme_id,title,sort_order,catalog_version&is_enabled=eq.true&is_hidden=eq.false&order=theme_id.asc,sort_order.asc,subtopic_id.asc',
      { timeoutMs }
    ),
  ]);

  return buildTreeFromRows(themes, subtopics);
}

function adaptTreeToLegacy(tree) {
  const sections = new Map();
  const topicTitle = new Map();
  const topicsBySection = new Map();

  for (const theme of (tree?.themes || [])) {
    const themeId = asText(theme?.theme_id);
    const themeTitle = asText(theme?.title);
    if (!themeId || !themeTitle) continue;

    sections.set(themeId, themeTitle);

    const topicRows = [];
    for (const subtopic of (theme?.subtopics || [])) {
      const subtopicId = asText(subtopic?.subtopic_id);
      const subtopicTitle = asText(subtopic?.title);
      if (!subtopicId || !subtopicTitle) continue;

      topicTitle.set(subtopicId, subtopicTitle);
      topicRows.push({ id: subtopicId, title: subtopicTitle });
    }

    topicsBySection.set(themeId, topicRows);
  }

  return {
    ...tree,
    sections,
    topicTitle,
    topicsBySection,
    totalTopics: topicTitle.size,
  };
}

export async function loadCatalogTree(opts = {}) {
  if (__treeCache) return __treeCache;
  if (__treePromise) return __treePromise;

  const timeoutMs = Math.max(0, Number(opts?.timeoutMs ?? 15000) || 15000);

  __treePromise = (async () => {
    try {
      try {
        __treeCache = await loadCatalogTreeViaRpc(timeoutMs);
      } catch (err) {
        if (!isMissingCatalogTreeRpc(err)) throw err;
        __treeCache = await loadCatalogTreeViaTables(timeoutMs);
      }
      __legacyCache = null;
      return __treeCache;
    } finally {
      __treePromise = null;
    }
  })();

  return __treePromise;
}

export async function loadCatalogLegacy(opts = {}) {
  if (__legacyCache) return __legacyCache;
  const tree = await loadCatalogTree(opts);
  __legacyCache = adaptTreeToLegacy(tree);
  return __legacyCache;
}

export function invalidateCatalogCache() {
  __treeCache = null;
  __treePromise = null;
  __legacyCache = null;
}
