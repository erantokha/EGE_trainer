// app/ui/error_state.js
// Единый пользовательский error-state для сетевых/загрузочных сбоев.
// На первом экране — человеческий текст + [Повторить] + [На главную].
// Технические детали (код/diag_id/build/UA/raw) спрятаны под «Подробности».
// Self-contained: стили инжектятся модулем.

let STYLES_DONE = false;
function injectStyles() {
  if (STYLES_DONE) return;
  STYLES_DONE = true;
  const css = `
.es-wrap { max-width: 520px; margin: 40px auto; padding: 0 16px; text-align: center; }
.es-title { font-size: 19px; font-weight: 700; margin: 0 0 8px; color: var(--text, #0f172a); }
.es-msg { font-size: 14px; line-height: 1.5; opacity: .9; margin: 0 0 16px; }
.es-actions { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
.es-btn {
  appearance: none; border-radius: 10px; padding: 9px 16px; font-size: 14px; cursor: pointer;
  border: 1px solid var(--border, #cbd5e1); background: var(--panel-2, #fff); color: inherit;
}
.es-btn:hover { filter: brightness(.97); }
.es-btn.es-primary { background: #2563eb; border-color: #2563eb; color: #fff; }
.es-details-toggle {
  display: inline-block; margin-top: 14px; background: none; border: none; padding: 0;
  color: #2563eb; cursor: pointer; font-size: 13px; text-decoration: underline;
}
.es-details {
  display: none; text-align: left; white-space: pre-wrap; word-break: break-word;
  border: 1px solid var(--border, #e2e8f0); border-radius: 10px; background: var(--panel-2, #fafafa);
  padding: 12px; margin: 10px auto 0; max-width: 520px; font-size: 12.5px; line-height: 1.4;
}
`;
  const el = document.createElement('style');
  el.id = 'es-styles';
  el.textContent = css;
  document.head.appendChild(el);
}

const KIND_TEXT = {
  generic:    { title: 'Не удалось загрузить данные', msg: 'Попробуйте ещё раз.' },
  network:    { title: 'Не удалось связаться с сервером', msg: 'Проверьте интернет и попробуйте снова.' },
  profile:    { title: 'Не удалось загрузить профиль', msg: 'Попробуйте ещё раз.' },
  homework:   { title: 'Не удалось загрузить домашнее задание', msg: 'Попробуйте обновить страницу.' },
  stats:      { title: 'Не удалось загрузить статистику', msg: 'Попробуйте ещё раз.' },
  students:   { title: 'Не удалось загрузить список учеников', msg: 'Попробуйте ещё раз.' },
  student:    { title: 'Не удалось загрузить данные ученика', msg: 'Попробуйте ещё раз.' },
  module:     { title: 'Не удалось загрузить страницу', msg: 'Проверьте интернет и обновите страницу.' },
};

/* Классифицирует ошибку в kind по умолчанию, если явный kind не передан. */
export function classifyErrorKind(err) {
  const raw = (String(err?.message || '') + ' ' + JSON.stringify(err?.details ?? '')).toLowerCase();
  if (err?.code === 'TIMEOUT' || /timeout|failed to fetch|networkerror|err_/.test(raw) || err?.status === 0) return 'network';
  if (/dynamically imported module|import\(/.test(raw)) return 'module';
  return 'generic';
}

function buildDetails(err, extra) {
  const lines = [];
  if (extra?.code) lines.push('код: ' + extra.code);
  const status = err?.status ?? err?.details?.status;
  if (status != null && status !== '') lines.push('status: ' + status);
  const msg = err?.message || err?.details?.message;
  if (msg) lines.push('сообщение: ' + String(msg).slice(0, 300));
  try {
    var b = document.querySelector('meta[name="app-build"]');
    if (b) lines.push('build: ' + (b.getAttribute('content') || ''));
  } catch (_) {}
  try { lines.push('ua: ' + String(navigator.userAgent || '').slice(0, 160)); } catch (_) {}
  if (extra?.diagId) lines.push('diag_id: ' + extra.diagId);
  return lines.join('\n');
}

/**
 * Рендерит единый error-state внутри host.
 * @param {HTMLElement} host — контейнер (innerHTML будет заменён)
 * @param {object} opts
 *   - kind: 'generic'|'network'|'profile'|'homework'|'stats'|'students'|'student'|'module'
 *   - err: исходная ошибка (для авто-классификации и деталей)
 *   - onRetry: () => void|Promise — обработчик «Повторить» (реально перезапускает загрузку)
 *   - showHome: bool (по умолчанию true) — показывать «На главную»
 *   - homeUrl: string — куда ведёт «На главную» (по умолчанию вычисляется)
 *   - title/message: переопределение текста
 *   - detailExtra: { code, diagId }
 */
export function renderErrorState(host, opts = {}) {
  if (!host) return;
  injectStyles();

  const err = opts.err || null;
  // network имеет приоритет: если ошибка похожа на сетевую — показываем сетевой текст
  let kind = opts.kind || 'generic';
  if (!opts.kind || opts.kind === 'generic') {
    const auto = classifyErrorKind(err);
    if (auto === 'network' || auto === 'module') kind = auto;
  } else {
    const auto = classifyErrorKind(err);
    if (auto === 'network') kind = 'network';
  }
  const base = KIND_TEXT[kind] || KIND_TEXT.generic;
  const title = opts.title || base.title;
  const message = opts.message || base.msg;
  const showHome = opts.showHome !== false;
  const homeUrl = opts.homeUrl || computeHome();

  host.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'es-wrap';
  wrap.setAttribute('role', 'alert');

  const t = document.createElement('div');
  t.className = 'es-title';
  t.textContent = title;

  const m = document.createElement('p');
  m.className = 'es-msg';
  m.textContent = message;

  const actions = document.createElement('div');
  actions.className = 'es-actions';

  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'es-btn es-primary';
  retry.textContent = 'Повторить';
  retry.addEventListener('click', () => {
    retry.disabled = true;
    try { Promise.resolve(opts.onRetry?.()).finally(() => { retry.disabled = false; }); }
    catch (_) { retry.disabled = false; }
  });
  actions.appendChild(retry);

  if (showHome) {
    const home = document.createElement('a');
    home.className = 'es-btn';
    home.textContent = 'На главную';
    home.href = homeUrl;
    actions.appendChild(home);
  }

  wrap.appendChild(t);
  wrap.appendChild(m);
  wrap.appendChild(actions);

  const detailsText = buildDetails(err, opts.detailExtra);
  if (detailsText) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'es-details-toggle';
    toggle.textContent = 'Подробности';
    const pre = document.createElement('pre');
    pre.className = 'es-details';
    pre.textContent = detailsText;
    toggle.addEventListener('click', () => {
      const open = pre.style.display === 'block';
      pre.style.display = open ? 'none' : 'block';
      toggle.textContent = open ? 'Подробности' : 'Скрыть подробности';
    });
    wrap.appendChild(toggle);
    wrap.appendChild(pre);
  }

  host.appendChild(wrap);
}

function computeHome() {
  try {
    return /\/tasks(\/|$)/.test(location.pathname)
      ? new URL('../', location.href).toString()
      : new URL('./', location.href).toString();
  } catch (_) { return '/'; }
}
