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
let _FAMILY_INDEX = null;

/**
 * Приводим protoId к "чистому" виду:
 * - убираем пробелы
 * - если внутри есть служебные суффиксы (например "7.3.1.2#1"), вытаскиваем только "7.3.1.2"
 */
function normProtoId(x) {
  const s = String(x || '').trim();
  // Обычно prototype_id имеет >= 4 сегмента: 7.3.1.2
  const m = s.match(/(\d+(?:\.\d+){3,})/);
  return (m ? m[1] : s).trim();
}

function baseIdFromProtoId(id) {
  const s = String(id || '');
  const parts = s.split('.');
  if (parts.length >= 4) {
    const last = parts[parts.length - 1];
    if (/^\d+$/.test(last)) return parts.slice(0, -1).join('.');
  }
  return s;
}

function normalizeUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('//')) return 'https:' + s;
  if (/^(www\.)?rutube\.ru\//i.test(s) || s.startsWith('rutube.ru/')) return 'https://' + s;
  return s;
}

function buildFamilyIndex(map) {
  const idx = Object.create(null);
  for (const [k0, v0] of Object.entries(map || {})) {
    const url = normalizeUrl(v0);
    if (!url) continue;
    const k = normProtoId(k0);
    if (!k) continue;

    const base = baseIdFromProtoId(k);
    const parts = k.split('.');
    const last = parts[parts.length - 1];
    const lastNum = /^\d+$/.test(last) ? parseInt(last, 10) : 1e9;

    const cur = idx[base];
    if (!cur || lastNum < cur.lastNum) {
      idx[base] = { url, key: k, lastNum };
    }
  }
  return idx;
}

async function loadRutubeMap(opts = {}) {
  const force = !!opts.force;
  if (!force && _MAP) return _MAP;
  if (!force && _MAP_PROMISE) return _MAP_PROMISE;

  _MAP_PROMISE = (async () => {
    try {
      const resp = await fetch(withBuild(MAP_URL), { cache: 'no-store' });
      if (!resp.ok) {
        _MAP = {};
        _FAMILY_INDEX = Object.create(null);
        return _MAP;
      }

      const obj = await resp.json();
      const raw = (obj && typeof obj === 'object') ? obj : {};

      // Нормализуем ключи (на случай пробелов/служебных суффиксов в ключах) и урлы.
      const norm = Object.create(null);
      for (const [k0, v0] of Object.entries(raw)) {
        const k = normProtoId(k0);
        const url = normalizeUrl(v0);
        if (!k) continue;

        // если ключ дублируется: предпочитаем непустую ссылку
        if (!norm[k] || (url && !norm[k])) norm[k] = url || norm[k] || '';
      }

      _MAP = norm;
      _FAMILY_INDEX = buildFamilyIndex(_MAP);
      return _MAP;
    } catch (e) {
      console.warn('rutube_map load failed', e);
      _MAP = {};
      _FAMILY_INDEX = Object.create(null);
      return _MAP;
    } finally {
      _MAP_PROMISE = null;
    }
  })();

  return _MAP_PROMISE;
}

function getUrlFromMap(map, protoId) {
  const id = normProtoId(protoId);
  if (!id || !map) return '';

  // 1) точное совпадение
  const direct = map[id];
  if (typeof direct === 'string' && direct.trim()) return direct.trim();

  // 2) если кто-то положил ключ ровно базой (без ".1")
  const base = baseIdFromProtoId(id);
  const baseDirect = map[base];
  if (typeof baseDirect === 'string' && baseDirect.trim()) return baseDirect.trim();

  // 3) самый ранний "родственник" в этом семействе (например, у тебя есть только 7.3.1.1)
  const fam = _FAMILY_INDEX && _FAMILY_INDEX[base];
  if (fam && fam.url) return fam.url;

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
    const u = new URL(normalizeUrl(String(rawUrl || '')), location.href);
    const host = String(u.hostname || '').toLowerCase();
    if (!host.includes('rutube')) return '';

    const parts = u.pathname.split('/').filter(Boolean);

    // /play/embed/<id>
    const iPlay = parts.indexOf('play');
    if (iPlay !== -1 && parts[iPlay + 1] === 'embed' && parts[iPlay + 2]) return parts[iPlay + 2];

    // /video/embed/<id> или /video/<id>
    const iVideo = parts.indexOf('video');
    if (iVideo !== -1) {
      if (parts[iVideo + 1] === 'embed' && parts[iVideo + 2]) return parts[iVideo + 2];
      if (parts[iVideo + 1]) return parts[iVideo + 1];
    }

    // fallback: последний сегмент
    return parts[parts.length - 1] || '';
  } catch (_) {
    return '';
  }
}

function toRutubeEmbedUrl(rawUrl) {
  const src = normalizeUrl(rawUrl);
  const id = extractRutubeId(src);
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

  document.addEventListener('keydown', (e) => {
    if (!_MODAL || _MODAL.hidden) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeVideoModal();
    }
  });

  modal.addEventListener('click', (e) => {
    if (e.target && e.target.getAttribute && e.target.getAttribute('data-vs-close') === '1') {
      closeVideoModal();
    }
  });

  return _MODAL;
}

function openVideoModal(rawUrl, title) {
  const url = normalizeUrl(String(rawUrl || '').trim());
  if (!url) return;

  const embed = toRutubeEmbedUrl(url);

  if (!embed) {
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

    const url = normalizeUrl(String(el.dataset.videoUrl || '').trim());
    if (!url) return;

    e.preventDefault();
    e.stopPropagation();

    const title = String(el.dataset.videoTitle || '').trim() || 'Видео-решение';
    openVideoModal(url, title);
  });
}
