// app/video_solutions.js
// Видео-решения (Rutube): карта prototype_id -> url и удобная "гидрация" слотов в UI.
// Использование:
//   hydrateVideoLinks(container, { mode: 'modal', missingText: 'Видео скоро будет' });
//   wireVideoSolutionModal(container);

const IN_TASKS_DIR = /\/tasks(\/|$)/.test(location.pathname);

function getBuild() {
  const el = document.querySelector('meta[name="app-build"]');
  const v = el && typeof el.content === 'string' ? el.content.trim() : '';
  return v || 'dev';
}

function withBuild(urlLike) {
  const u = new URL(String(urlLike), location.href);
  u.searchParams.set('v', getBuild());
  return u.href;
}

const MAP_URL = new URL(
  IN_TASKS_DIR ? '../content/video/rutube_map.json' : './content/video/rutube_map.json',
  location.href,
).toString();

let _MAP = null;
let _MAP_PROMISE = null;

async function loadRutubeMap(opts = {}) {
  const force = !!opts.force;
  if (!force && _MAP) return _MAP;
  if (!force && _MAP_PROMISE) return _MAP_PROMISE;

  _MAP_PROMISE = (async () => {
    try {
      const resp = await fetch(withBuild(MAP_URL), { cache: 'no-store' });
      if (!resp.ok) {
        _MAP = {};
        return _MAP;
      }
      const obj = await resp.json();
      _MAP = (obj && typeof obj === 'object') ? obj : {};
      return _MAP;
    } catch (e) {
      console.warn('rutube_map load failed', e);
      _MAP = {};
      return _MAP;
    } finally {
      _MAP_PROMISE = null;
    }
  })();

  return _MAP_PROMISE;
}

function normProtoId(x) {
  return String(x || '').trim();
}

function getUrlFromMap(map, protoId) {
  const id = normProtoId(protoId);
  if (!id || !map) return '';
  const u = map[id];
  if (typeof u === 'string' && u.trim()) return u.trim();
  return '';
}

function mkMissing(text) {
  const span = document.createElement('span');
  span.className = 'video-solution-missing';
  span.textContent = text;
  return span;
}

function mkLink(url, protoId) {
  const a = document.createElement('a');
  a.className = 'video-solution-link';
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = 'Видео-решение';
  a.dataset.videoUrl = url;
  a.dataset.videoProto = normProtoId(protoId);
  return a;
}

function mkModalBtn(url, protoId) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'video-solution-btn';
  b.textContent = 'Видео-решение';
  b.dataset.videoUrl = url;
  b.dataset.videoProto = normProtoId(protoId);
  b.dataset.videoTitle = `Прототип ${normProtoId(protoId)}`;
  return b;
}

export async function hydrateVideoLinks(root, opts = {}) {
  const host = root || document;
  const mode = String(opts.mode || 'link').toLowerCase(); // 'link' | 'modal'
  const missingText = String(opts.missingText || 'Видео скоро будет');

  const slots = Array.from(host.querySelectorAll('.video-solution-slot[data-video-proto]'));
  if (!slots.length) return;

  const map = await loadRutubeMap();
  for (const slot of slots) {
    const protoId = slot.getAttribute('data-video-proto') || '';
    const url = getUrlFromMap(map, protoId);
    slot.innerHTML = '';
    if (!url) {
      slot.appendChild(mkMissing(missingText));
      continue;
    }
    if (mode === 'modal') {
      slot.appendChild(mkModalBtn(url, protoId));
    } else {
      slot.appendChild(mkLink(url, protoId));
    }
  }
}

// -------- Модальное окно --------

function extractRutubeId(rawUrl) {
  try {
    const u = new URL(String(rawUrl || ''), location.href);
    const host = String(u.hostname || '').toLowerCase();
    if (!host.includes('rutube')) return '';

    const parts = u.pathname.split('/').filter(Boolean);

    // /play/embed/<id>
    const iPlay = parts.indexOf('play');
    if (iPlay !== -1 && parts[iPlay + 1] === 'embed' && parts[iPlay + 2]) return parts[iPlay + 2];

    // /video/embed/<id>
    const iVideo = parts.indexOf('video');
    if (iVideo !== -1) {
      if (parts[iVideo + 1] === 'embed' && parts[iVideo + 2]) return parts[iVideo + 2];
      if (parts[iVideo + 1]) return parts[iVideo + 1];
    }

    // fallback: last segment
    return parts[parts.length - 1] || '';
  } catch (_) {
    return '';
  }
}

function toRutubeEmbedUrl(rawUrl) {
  const id = extractRutubeId(rawUrl);
  if (!id) return '';
  return `https://rutube.ru/play/embed/${encodeURIComponent(id)}`;
}

let _MODAL = null;
let _IFRAME = null;
let _TITLE = null;
let _LAST_ACTIVE = null;

function ensureModal() {
  if (_MODAL) return _MODAL;

  const modal = document.createElement('div');
  modal.id = 'vsModal';
  modal.className = 'vs-modal';
  modal.hidden = true;

  modal.innerHTML = `
    <div class="vs-modal-backdrop" data-vs-close="1"></div>
    <div class="vs-modal-card" role="dialog" aria-modal="true" aria-label="Видео-решение">
      <div class="vs-modal-head">
        <div class="vs-modal-title" id="vsModalTitle">Видео-решение</div>
        <button type="button" class="vs-modal-close" id="vsModalClose" aria-label="Закрыть">×</button>
      </div>
      <div class="vs-modal-body">
        <div class="vs-iframe-wrap">
          <iframe id="vsModalFrame" src="about:blank" allow="autoplay; fullscreen" allowfullscreen loading="lazy"></iframe>
        </div>
        <div class="vs-modal-foot" id="vsModalFoot" hidden>
          <a class="video-solution-link" id="vsModalOpenExternal" href="#" target="_blank" rel="noopener">Открыть на Rutube</a>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  _MODAL = modal;
  _IFRAME = modal.querySelector('#vsModalFrame');
  _TITLE = modal.querySelector('#vsModalTitle');

  const closeBtn = modal.querySelector('#vsModalClose');
  const backdrop = modal.querySelector('.vs-modal-backdrop');

  const close = () => closeVideoModal();
  closeBtn?.addEventListener('click', close);
  backdrop?.addEventListener('click', close);

  // Escape
  document.addEventListener('keydown', (e) => {
    if (!_MODAL || _MODAL.hidden) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeVideoModal();
    }
  });

  // Click outside card
  modal.addEventListener('click', (e) => {
    if (e.target && e.target.getAttribute && e.target.getAttribute('data-vs-close') === '1') {
      closeVideoModal();
    }
  });

  return _MODAL;
}

function openVideoModal(rawUrl, title) {
  const url = String(rawUrl || '').trim();
  if (!url) return;

  const embed = toRutubeEmbedUrl(url);
  if (!embed) {
    // если формат не распознан — просто открываем внешнюю ссылку
    window.open(url, '_blank', 'noopener');
    return;
  }

  ensureModal();

  _LAST_ACTIVE = document.activeElement;
  if (_TITLE) _TITLE.textContent = String(title || 'Видео-решение');

  const foot = _MODAL.querySelector('#vsModalFoot');
  const ext = _MODAL.querySelector('#vsModalOpenExternal');
  if (ext) ext.href = url;
  if (foot) foot.hidden = false;

  if (_IFRAME) _IFRAME.src = embed;

  document.body.classList.add('vs-modal-open');
  _MODAL.hidden = false;

  // фокус на кнопку закрытия
  const closeBtn = _MODAL.querySelector('#vsModalClose');
  closeBtn?.focus?.();
}

function closeVideoModal() {
  if (!_MODAL || _MODAL.hidden) return;

  try {
    if (_IFRAME) _IFRAME.src = 'about:blank';
  } catch (_) {}

  _MODAL.hidden = true;
  document.body.classList.remove('vs-modal-open');

  const foot = _MODAL.querySelector('#vsModalFoot');
  if (foot) foot.hidden = true;

  // возвращаем фокус
  try { _LAST_ACTIVE?.focus?.(); } catch (_) {}
  _LAST_ACTIVE = null;
}

export function wireVideoSolutionModal(root) {
  const host = root || document;
  if (host.dataset && host.dataset.vsWired === '1') return;
  if (host.dataset) host.dataset.vsWired = '1';

  host.addEventListener('click', (e) => {
    const t = e.target;
    if (!t) return;

    const el = t.closest ? t.closest('[data-video-url]') : null;
    if (!el) return;
    if (!host.contains(el)) return;

    const url = String(el.dataset.videoUrl || '').trim();
    if (!url) return;

    // в режиме modal всегда перехватываем
    e.preventDefault();
    e.stopPropagation();

    const title = String(el.dataset.videoTitle || '').trim() || 'Видео-решение';
    openVideoModal(url, title);
  });
}
