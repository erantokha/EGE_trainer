// app/video_solutions.js
// Видео-решения (Rutube): загрузка карты prototype_id -> url и гидратация плейсхолдеров на странице.
//
// Использование (в других модулях):
//   import { hydrateVideoLinks } from '../app/video_solutions.js?v=BUILD';
//   ... при рендере рядом с ответом:
//     <span class="video-solution-slot" data-video-proto="7.3.1.1.1"></span>
//   ... после рендера:
//     hydrateVideoLinks(container);
//
// Файл карты:
//   /content/video/rutube_map.json
// Формат:
//   { "7.3.1.1.1": "https://rutube.ru/video/....../", "7.3.1.1.2": "" }

const BUILD = document.querySelector('meta[name="app-build"]')?.content?.trim() || '';

function withV(url) {
  const u = String(url || '');
  if (!BUILD) return u;
  const sep = u.includes('?') ? '&' : '?';
  return `${u}${sep}v=${encodeURIComponent(BUILD)}`;
}

const IN_TASKS_DIR = /\/tasks(\/|$)/.test(location.pathname);
const MAP_URL = new URL(
  IN_TASKS_DIR ? '../content/video/rutube_map.json' : './content/video/rutube_map.json',
  location.href,
).toString();

let _mapCache = null;
let _mapPromise = null;

async function loadRutubeMap() {
  if (_mapCache) return _mapCache;
  if (_mapPromise) return _mapPromise;

  _mapPromise = (async () => {
    try {
      const res = await fetch(withV(MAP_URL), { cache: 'force-cache' });
      if (!res.ok) {
        _mapCache = {};
        return _mapCache;
      }
      const data = await res.json();
      _mapCache = (data && typeof data === 'object' && !Array.isArray(data)) ? data : {};
      return _mapCache;
    } catch (_) {
      _mapCache = {};
      return _mapCache;
    } finally {
      // чтобы не держать "висящий" промис вечно
      _mapPromise = null;
    }
  })();

  return _mapPromise;
}

async function getRutubeUrl(protoId) {
  const id = String(protoId || '').trim();
  if (!id) return '';
  const map = await loadRutubeMap();
  return String(map?.[id] || '').trim();
}

function _makeLink(url, text) {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  a.className = 'video-solution-link';
  a.textContent = text;
  return a;
}

// rootEl: контейнер, в котором искать плейсхолдеры
// Плейсхолдер: любой элемент с атрибутом data-video-proto="7.3.1.1.1"
async function hydrateVideoLinks(rootEl, options = {}) {
  const root = rootEl || document;
  const text = String(options.text || 'Видео-решение');
  const missingText = String(options.missingText || 'Видео скоро будет');
  const showMissing = options.showMissing !== false;

  const nodes = Array.from(root.querySelectorAll('[data-video-proto]'));
  if (!nodes.length) return;

  const map = await loadRutubeMap();

  for (const node of nodes) {
    if (!node || node.nodeType !== 1) continue;

    // не гидратируем повторно, если уже делали
    if (node.dataset.videoHydrated === '1') continue;

    const id = String(node.dataset.videoProto || '').trim();
    if (!id) continue;

    const url = String(map?.[id] || '').trim();

    if (url) {
      const a = _makeLink(url, text);
      node.replaceChildren(a);
      node.classList.add('video-solution-ready');
      node.classList.remove('video-solution-missing');
    } else {
      if (showMissing) {
        node.textContent = missingText;
        node.classList.add('video-solution-missing');
        node.classList.remove('video-solution-ready');
      } else {
        node.replaceChildren();
      }
    }

    node.dataset.videoHydrated = '1';
  }
}

export { loadRutubeMap, getRutubeUrl, hydrateVideoLinks };

