// app/providers/catalog.js
// Stage 1 catalog provider:
// - prefers canonical RPC public.catalog_tree_v1()
// - falls back to layer-2 catalog tables while RPC is not deployed yet
// - exposes a legacy-compatible adapter for current stats/student screens

import { supaRest } from './supabase-rest.js?v=2026-04-07-4';

let __treeCache = null;
let __treePromise = null;
let __legacyCache = null;
let __indexLikeCache = null;
let __indexLikePromise = null;

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

function isMissingCatalogRpc(err, rpcName) {
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
      (text.includes(String(rpcName || '').toLowerCase()) && text.includes('not found'))
    )
  );
}

function isMissingCatalogTreeRpc(err) {
  return isMissingCatalogRpc(err, 'catalog_tree_v1');
}

function isMissingCatalogIndexLikeRpc(err) {
  return isMissingCatalogRpc(err, 'catalog_index_like_v1');
}

function isMissingCatalogSubtopicUnicsRpc(err) {
  return isMissingCatalogRpc(err, 'catalog_subtopic_unics_v1');
}

function isMissingCatalogQuestionLookupRpc(err) {
  return isMissingCatalogRpc(err, 'catalog_question_lookup_v1');
}

function normalizeTextList(values) {
  return Array.from(new Set((Array.isArray(values) ? values : [values])
    .map((value) => asText(value))
    .filter(Boolean)));
}

function chunkArray(arr, size = 200) {
  const out = [];
  const list = Array.isArray(arr) ? arr : [];
  const n = Math.max(1, Math.trunc(Number(size) || 200));
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
}

function quotePostgrestText(value) {
  return `"${String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function buildInFilter(values) {
  const ids = normalizeTextList(values);
  if (!ids.length) return '';
  return `in.(${ids.map(quotePostgrestText).join(',')})`;
}

function buildSelectParams(select, filters = {}) {
  const params = new URLSearchParams();
  params.set('select', String(select || '').trim());
  for (const [key, value] of Object.entries(filters || {})) {
    if (value == null) continue;
    const text = String(value).trim();
    if (!text) continue;
    params.set(key, text);
  }
  return params;
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

function buildIndexLikeFromRows(themeRows, subtopicRows) {
  const out = [];

  const themes = Array.isArray(themeRows) ? themeRows.slice() : [];
  themes.sort((a, b) => compareByOrderThenId(a, b, 'theme_id'));

  for (const row of themes) {
    const themeId = asText(row?.theme_id);
    const title = asText(row?.title);
    if (!themeId || !title) continue;

    out.push({
      id: themeId,
      title,
      type: 'group',
    });
  }

  const subtopics = Array.isArray(subtopicRows) ? subtopicRows.slice() : [];
  subtopics.sort((a, b) => {
    const td = asText(a?.theme_id).localeCompare(asText(b?.theme_id), 'ru');
    if (td !== 0) return td;
    return compareByOrderThenId(a, b, 'subtopic_id');
  });

  for (const row of subtopics) {
    const subtopicId = asText(row?.subtopic_id);
    const themeId = asText(row?.theme_id);
    const title = asText(row?.title);
    if (!subtopicId || !themeId || !title) continue;

    const path = asText(row?.source_path);
    out.push({
      id: subtopicId,
      title,
      parent: themeId,
      path,
      enabled: true,
      hidden: false,
    });
  }

  return out;
}

function normalizeIndexLikeItem(item) {
  const type = asText(item?.type).toLowerCase();
  if (type === 'group') {
    const themeId = asText(item?.theme_id || item?.id);
    const title = asText(item?.title);
    if (!themeId || !title) return null;

    return {
      id: themeId,
      theme_id: themeId,
      title,
      type: 'group',
      sort_order: asSort(item?.sort_order),
    };
  }

  if (type === 'topic') {
    const subtopicId = asText(item?.subtopic_id || item?.id);
    const themeId = asText(item?.parent || item?.theme_id);
    const title = asText(item?.title);
    if (!subtopicId || !themeId || !title) return null;

    return {
      id: subtopicId,
      subtopic_id: subtopicId,
      theme_id: themeId,
      parent: themeId,
      title,
      type: 'topic',
      path: asText(item?.path),
      enabled: item?.enabled === false ? false : true,
      hidden: item?.hidden === true ? true : false,
      sort_order: asSort(item?.sort_order),
    };
  }

  return null;
}

function normalizeSubtopicUnicRow(item) {
  const subtopicId = asText(item?.subtopic_id);
  const themeId = asText(item?.theme_id);
  const unicId = asText(item?.unic_id);
  const title = asText(item?.title);
  if (!subtopicId || !themeId || !unicId || !title) return null;

  return {
    subtopic_id: subtopicId,
    theme_id: themeId,
    unic_id: unicId,
    title,
    sort_order: asSort(item?.sort_order),
    total_question_count: Math.max(0, Math.trunc(Number(item?.total_question_count) || 0)),
    is_counted_in_coverage: item?.is_counted_in_coverage === false ? false : true,
    catalog_version: asText(item?.catalog_version),
  };
}

function compareCatalogSubtopicUnics(a, b) {
  const td = asText(a?.theme_id).localeCompare(asText(b?.theme_id), 'ru');
  if (td !== 0) return td;
  const sd = asText(a?.subtopic_id).localeCompare(asText(b?.subtopic_id), 'ru');
  if (sd !== 0) return sd;
  return compareByOrderThenId(a, b, 'unic_id');
}

function normalizeQuestionLookupRow(item) {
  const questionId = asText(item?.question_id);
  const unicId = asText(item?.unic_id);
  const subtopicId = asText(item?.subtopic_id);
  const themeId = asText(item?.theme_id);
  if (!questionId || !unicId || !subtopicId || !themeId) return null;

  return {
    question_id: questionId,
    unic_id: unicId,
    subtopic_id: subtopicId,
    theme_id: themeId,
    sort_order: asSort(item?.sort_order),
    manifest_path: asText(item?.manifest_path),
    catalog_version: asText(item?.catalog_version),
  };
}

function compareQuestionLookupRows(a, b) {
  const td = asText(a?.theme_id).localeCompare(asText(b?.theme_id), 'ru');
  if (td !== 0) return td;
  const sd = asText(a?.subtopic_id).localeCompare(asText(b?.subtopic_id), 'ru');
  if (sd !== 0) return sd;
  const ud = asText(a?.unic_id).localeCompare(asText(b?.unic_id), 'ru');
  if (ud !== 0) return ud;
  return compareByOrderThenId(a, b, 'question_id');
}

function normalizeIndexLikePayload(payload) {
  const rawItems = Array.isArray(payload?.items) ? payload.items : [];
  const items = rawItems.map(normalizeIndexLikeItem).filter(Boolean);

  const groups = items
    .filter((item) => item.type === 'group')
    .sort((a, b) => compareByOrderThenId(a, b, 'id'));

  const topics = items
    .filter((item) => item.type === 'topic')
    .sort((a, b) => {
      const td = asText(a?.parent).localeCompare(asText(b?.parent), 'ru');
      if (td !== 0) return td;
      return compareByOrderThenId(a, b, 'id');
    });

  return [...groups, ...topics];
}

async function loadCatalogIndexLikeViaRpc(timeoutMs) {
  const data = await supaRest.rpcAny(['catalog_index_like_v1'], {}, { timeoutMs });
  return normalizeIndexLikePayload(data);
}

async function loadCatalogIndexLikeViaTables(timeoutMs) {
  const [themes, subtopics] = await Promise.all([
    supaRest.select(
      'catalog_theme_dim',
      'select=theme_id,title,sort_order&is_enabled=eq.true&is_hidden=eq.false&order=sort_order.asc,theme_id.asc',
      { timeoutMs }
    ),
    supaRest.select(
      'catalog_subtopic_dim',
      'select=subtopic_id,theme_id,title,sort_order,source_path&is_enabled=eq.true&is_hidden=eq.false&order=theme_id.asc,sort_order.asc,subtopic_id.asc',
      { timeoutMs }
    ),
  ]);

  return buildIndexLikeFromRows(themes, subtopics);
}

async function loadCatalogSubtopicUnicsViaRpc(subtopicIds, timeoutMs) {
  const data = await supaRest.rpcAny(
    ['catalog_subtopic_unics_v1'],
    { p_subtopic_ids: subtopicIds?.length ? subtopicIds : null },
    { timeoutMs }
  );
  const rows = Array.isArray(data) ? data : (data ? [data] : []);
  return rows.map(normalizeSubtopicUnicRow).filter(Boolean).sort(compareCatalogSubtopicUnics);
}

async function loadCatalogSubtopicUnicsViaTables(subtopicIds, timeoutMs) {
  const normalizedIds = normalizeTextList(subtopicIds);

  const themeParams = buildSelectParams(
    'theme_id,sort_order',
    {
      is_enabled: 'eq.true',
      is_hidden: 'eq.false',
      order: 'sort_order.asc,theme_id.asc',
    }
  );

  const subtopicParams = buildSelectParams(
    'subtopic_id,theme_id,sort_order',
    {
      is_enabled: 'eq.true',
      is_hidden: 'eq.false',
      ...(normalizedIds.length ? { subtopic_id: buildInFilter(normalizedIds) } : {}),
      order: 'theme_id.asc,sort_order.asc,subtopic_id.asc',
    }
  );

  const [themeRows, subtopicRows, unicRows] = await Promise.all([
    supaRest.select('catalog_theme_dim', themeParams, { timeoutMs }),
    supaRest.select('catalog_subtopic_dim', subtopicParams, { timeoutMs }),
    supaRest.select(
      'catalog_unic_dim',
      buildSelectParams(
        'subtopic_id,theme_id,unic_id,title,sort_order,total_question_count,is_counted_in_coverage,catalog_version',
        {
          is_enabled: 'eq.true',
          is_hidden: 'eq.false',
          ...(normalizedIds.length ? { subtopic_id: buildInFilter(normalizedIds) } : {}),
          order: 'theme_id.asc,subtopic_id.asc,sort_order.asc,unic_id.asc',
        }
      ),
      { timeoutMs }
    ),
  ]);

  const visibleThemeIds = new Set((themeRows || []).map((row) => asText(row?.theme_id)).filter(Boolean));
  const visibleSubtopicKeys = new Set(
    (subtopicRows || [])
      .map((row) => `${asText(row?.theme_id)}::${asText(row?.subtopic_id)}`)
      .filter((key) => key !== '::')
  );

  return (unicRows || [])
    .map(normalizeSubtopicUnicRow)
    .filter(Boolean)
    .filter((row) => {
      if (!visibleThemeIds.has(row.theme_id)) return false;
      return visibleSubtopicKeys.has(`${row.theme_id}::${row.subtopic_id}`);
    })
    .sort(compareCatalogSubtopicUnics);
}

async function selectCatalogQuestionRowsByKey({
  key,
  values,
  timeoutMs,
}) {
  const ids = normalizeTextList(values);
  if (!ids.length) return [];

  const chunks = chunkArray(ids, 200);
  const allRows = [];

  for (const chunk of chunks) {
    const rows = await supaRest.select(
      'catalog_question_dim',
      buildSelectParams(
        'question_id,unic_id,subtopic_id,theme_id,sort_order,manifest_path,catalog_version',
        {
          is_enabled: 'eq.true',
          is_hidden: 'eq.false',
          [key]: buildInFilter(chunk),
          order: 'theme_id.asc,subtopic_id.asc,unic_id.asc,sort_order.asc,question_id.asc',
        }
      ),
      { timeoutMs }
    );
    for (const row of (rows || [])) allRows.push(row);
  }

  return allRows;
}

async function lookupCatalogQuestionsViaRpc(questionIds, unicIds, timeoutMs) {
  const data = await supaRest.rpcAny(
    ['catalog_question_lookup_v1'],
    {
      p_question_ids: questionIds?.length ? questionIds : null,
      p_unic_ids: unicIds?.length ? unicIds : null,
    },
    { timeoutMs }
  );
  const rows = Array.isArray(data) ? data : (data ? [data] : []);
  return rows.map(normalizeQuestionLookupRow).filter(Boolean).sort(compareQuestionLookupRows);
}

async function lookupCatalogQuestionsViaTables(questionIds, unicIds, timeoutMs) {
  const normalizedQuestionIds = normalizeTextList(questionIds);
  const normalizedUnicIds = normalizeTextList(unicIds);
  if (!normalizedQuestionIds.length && !normalizedUnicIds.length) return [];

  const [questionRowsByQuestionId, questionRowsByUnicId] = await Promise.all([
    selectCatalogQuestionRowsByKey({ key: 'question_id', values: normalizedQuestionIds, timeoutMs }),
    selectCatalogQuestionRowsByKey({ key: 'unic_id', values: normalizedUnicIds, timeoutMs }),
  ]);

  const mergedByQuestionId = new Map();
  for (const row of [...questionRowsByQuestionId, ...questionRowsByUnicId]) {
    const normalized = normalizeQuestionLookupRow(row);
    if (!normalized) continue;
    mergedByQuestionId.set(normalized.question_id, normalized);
  }

  const mergedRows = Array.from(mergedByQuestionId.values());
  if (!mergedRows.length) return [];

  const mergedUnicIds = normalizeTextList(mergedRows.map((row) => row.unic_id));
  const subtopicIds = normalizeTextList(mergedRows.map((row) => row.subtopic_id));
  const themeIds = normalizeTextList(mergedRows.map((row) => row.theme_id));

  const [themeRows, subtopicRows, unicRows] = await Promise.all([
    supaRest.select(
      'catalog_theme_dim',
      buildSelectParams('theme_id', {
        is_enabled: 'eq.true',
        is_hidden: 'eq.false',
        ...(themeIds.length ? { theme_id: buildInFilter(themeIds) } : {}),
      }),
      { timeoutMs }
    ),
    supaRest.select(
      'catalog_subtopic_dim',
      buildSelectParams('subtopic_id,theme_id,source_path', {
        is_enabled: 'eq.true',
        is_hidden: 'eq.false',
        ...(subtopicIds.length ? { subtopic_id: buildInFilter(subtopicIds) } : {}),
      }),
      { timeoutMs }
    ),
    supaRest.select(
      'catalog_unic_dim',
      buildSelectParams('unic_id,subtopic_id,theme_id', {
        is_enabled: 'eq.true',
        is_hidden: 'eq.false',
        ...(mergedUnicIds.length ? { unic_id: buildInFilter(mergedUnicIds) } : {}),
      }),
      { timeoutMs }
    ),
  ]);

  const visibleThemeIds = new Set((themeRows || []).map((row) => asText(row?.theme_id)).filter(Boolean));
  const subtopicMeta = new Map();
  for (const row of (subtopicRows || [])) {
    const subtopicId = asText(row?.subtopic_id);
    const themeId = asText(row?.theme_id);
    if (!subtopicId || !themeId) continue;
    subtopicMeta.set(`${themeId}::${subtopicId}`, {
      theme_id: themeId,
      subtopic_id: subtopicId,
      source_path: asText(row?.source_path),
    });
  }

  const visibleUnicKeys = new Set(
    (unicRows || [])
      .map((row) => `${asText(row?.theme_id)}::${asText(row?.subtopic_id)}::${asText(row?.unic_id)}`)
      .filter((key) => key !== '::::')
  );

  return mergedRows
    .filter((row) => {
      if (!visibleThemeIds.has(row.theme_id)) return false;
      if (!subtopicMeta.has(`${row.theme_id}::${row.subtopic_id}`)) return false;
      return visibleUnicKeys.has(`${row.theme_id}::${row.subtopic_id}::${row.unic_id}`);
    })
    .map((row) => {
      if (row.manifest_path) return row;
      const subtopic = subtopicMeta.get(`${row.theme_id}::${row.subtopic_id}`) || null;
      return {
        ...row,
        manifest_path: asText(subtopic?.source_path),
      };
    })
    .sort(compareQuestionLookupRows);
}

export async function loadCatalogIndexLike(opts = {}) {
  if (__indexLikeCache) return __indexLikeCache;
  if (__indexLikePromise) return __indexLikePromise;

  const timeoutMs = Math.max(0, Number(opts?.timeoutMs ?? 15000) || 15000);

  __indexLikePromise = (async () => {
    try {
      try {
        __indexLikeCache = await loadCatalogIndexLikeViaRpc(timeoutMs);
      } catch (err) {
        if (!isMissingCatalogIndexLikeRpc(err)) throw err;
        __indexLikeCache = await loadCatalogIndexLikeViaTables(timeoutMs);
      }
      return __indexLikeCache;
    } finally {
      __indexLikePromise = null;
    }
  })();

  return __indexLikePromise;
}

export async function loadCatalogSubtopicUnicsV1(subtopicIds = null, opts = {}) {
  const timeoutMs = Math.max(0, Number(opts?.timeoutMs ?? 15000) || 15000);
  const normalizedIds = normalizeTextList(subtopicIds);

  try {
    return await loadCatalogSubtopicUnicsViaRpc(normalizedIds, timeoutMs);
  } catch (err) {
    if (!isMissingCatalogSubtopicUnicsRpc(err)) throw err;
    return await loadCatalogSubtopicUnicsViaTables(normalizedIds, timeoutMs);
  }
}

export async function lookupCatalogQuestionsV1({
  questionIds = null,
  unicIds = null,
} = {}, opts = {}) {
  const timeoutMs = Math.max(0, Number(opts?.timeoutMs ?? 15000) || 15000);
  const normalizedQuestionIds = normalizeTextList(questionIds);
  const normalizedUnicIds = normalizeTextList(unicIds);

  if (!normalizedQuestionIds.length && !normalizedUnicIds.length) return [];

  try {
    return await lookupCatalogQuestionsViaRpc(normalizedQuestionIds, normalizedUnicIds, timeoutMs);
  } catch (err) {
    if (!isMissingCatalogQuestionLookupRpc(err)) throw err;
    return await lookupCatalogQuestionsViaTables(normalizedQuestionIds, normalizedUnicIds, timeoutMs);
  }
}

export async function lookupQuestionsByIdsV1(questionIds = null, opts = {}) {
  return await lookupCatalogQuestionsV1({ questionIds, unicIds: null }, opts);
}

export async function lookupQuestionsByUnicsV1(unicIds = null, opts = {}) {
  return await lookupCatalogQuestionsV1({ questionIds: null, unicIds }, opts);
}

export async function loadCatalogTopicPathMap(opts = {}) {
  const items = await loadCatalogIndexLike(opts);
  const topicPath = new Map();

  for (const item of items) {
    const id = asText(item?.id);
    const path = asText(item?.path);
    if (!id || !path) continue;
    topicPath.set(id, path);
  }

  return topicPath;
}

export function invalidateCatalogCache() {
  __treeCache = null;
  __treePromise = null;
  __legacyCache = null;
  __indexLikeCache = null;
  __indexLikePromise = null;
}
