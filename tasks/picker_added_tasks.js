// tasks/picker_added_tasks.js
// W2.1' Variant B — self-contained pure builders extracted from tasks/picker.js (teacher
// added-tasks / proto-picker resolve subsystem). These are stateless: no picker module-state,
// no DOM. They take inputs and return outputs (manifest fetch + bucket-key + req normalization).
// picker.js imports them; this module does NOT import picker.js (no cycle).
//
// A full role-split of picker.js was found infeasible (W2.1' stop-ask: shared count/proto/home-stats
// functions call into role logic → core call-closure = 100%). This is the cleanly-extractable leaf.

import { withBuild } from '../app/build.js?v=2026-06-07-15';
import { toAbsUrl } from '../app/core/url_path.js?v=2026-06-07-15';

export async function ensurePickerManifest(topic) {
  if (topic._manifest) return topic._manifest;
  if (topic._manifestPromise) return topic._manifestPromise;
  if (!topic.path) return null;

  const href = toAbsUrl(topic.path);

  topic._manifestPromise = (async () => {
    try {
      const resp = await fetch(withBuild(href), { cache: 'force-cache' });
      if (!resp.ok) return null;
      const j = await resp.json();
      topic._manifest = j;
      return j;
    } catch (_) {
      return null;
    }
  })();

  return topic._manifestPromise;
}

export async function loadTopicPoolForPreview(topic) {
  if (!topic) return [];
  if (topic._pool) return topic._pool;
  if (topic._poolPromise) return topic._poolPromise;

  const p = (async () => {
    const paths = [];
    if (Array.isArray(topic.paths)) {
      for (const x of topic.paths) {
        if (typeof x === 'string' && x) paths.push(x);
      }
    }
    if (topic.path) paths.push(topic.path);

    // fallback: старый режим (один манифест в topic.path)
    if (!paths.length) {
      const man = await ensurePickerManifest(topic);
      if (!man) return [];
      const manifest = man;
      manifest.topic = manifest.topic || topic.id;
      manifest.title = manifest.title || topic.title;
      const pool = [];
      for (const typ of (manifest.types || [])) {
        for (const proto of (typ.prototypes || [])) {
          pool.push({ manifest, type: typ, proto });
        }
      }
      return pool;
    }

    const fetches = paths.map(async (relPath) => {
      const href = toAbsUrl(relPath);
      try {
        const resp = await fetch(withBuild(href), { cache: 'force-cache' });
        if (!resp.ok) return null;
        const manifest = await resp.json();
        manifest.topic = manifest.topic || topic.id;
        manifest.title = manifest.title || topic.title;
        return manifest;
      } catch (_) {
        return null;
      }
    });

    const manifests = await Promise.all(fetches);
    const pool = [];
    for (const manifest of manifests) {
      if (!manifest) continue;
      for (const typ of (manifest.types || [])) {
        for (const proto of (typ.prototypes || [])) {
          pool.push({ manifest, type: typ, proto });
        }
      }
    }
    return pool;
  })();

  topic._poolPromise = p;
  const out = await p;
  topic._pool = Array.isArray(out) ? out : [];
  topic._poolPromise = null;
  return topic._pool;
}

export function normalizeResolveReqArray(source) {
  if (!source) return [];
  if (Array.isArray(source)) {
    return source
      .map((item) => ({
        id: String(item?.id || '').trim(),
        n: Math.max(0, Math.floor(Number(item?.n || 0))),
      }))
      .filter((item) => item.id && item.n > 0);
  }
  if (typeof source === 'object') {
    return Object.entries(source)
      .map(([id, n]) => ({
        id: String(id || '').trim(),
        n: Math.max(0, Math.floor(Number(n || 0))),
      }))
      .filter((item) => item.id && item.n > 0);
  }
  return [];
}

export function buildResolveBucketKey(scopeKind, scopeId) {
  const kind = String(scopeKind || '').trim().toLowerCase();
  const id = String(scopeId || '').trim();
  if (!id) return '';
  if (kind === 'unic' || kind === 'proto' || kind === 'type') return `proto:${id}`;
  if (kind === 'topic' || kind === 'subtopic') return `topic:${id}`;
  if (kind === 'section' || kind === 'theme') return `section:${id}`;
  return '';
}

export function getResolveRowBucketKey(row) {
  const kind = String(row?.scope_kind || '').trim().toLowerCase();
  if (kind === 'global_all') {
    const sectionId = String(row?.theme_id || row?.section_id || '').trim();
    if (sectionId) return `section:${sectionId}`;
  }

  const explicit = buildResolveBucketKey(row?.scope_kind, row?.scope_id);
  if (explicit) return explicit;

  const unicId = String(row?.unic_id || row?.proto_id || row?.type_id || '').trim();
  if (unicId) return `proto:${unicId}`;

  const topicId = String(row?.subtopic_id || row?.topic_id || '').trim();
  if (topicId) return `topic:${topicId}`;

  const sectionId = String(row?.theme_id || row?.section_id || '').trim();
  if (sectionId) return `section:${sectionId}`;

  return '';
}
