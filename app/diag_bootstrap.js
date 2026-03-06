// app/diag_bootstrap.js
// Экран самодиагностики для учеников (без DevTools).
// Задача: при сбоях сети/CDN/Supabase показать понятный экран, чтобы ученик сделал скриншот.

(function () {
  'use strict';

  if (window.__EGE_DIAG__ && window.__EGE_DIAG__.__inited) return;

  function nowIso() {
    try { return new Date().toISOString(); } catch (_) { return String(Date.now()); }
  }

  function getBuild() {
    try {
      var m = document.querySelector('meta[name="app-build"]');
      return (m && m.getAttribute('content')) ? String(m.getAttribute('content')) : 'unknown';
    } catch (_) {
      return 'unknown';
    }
  }

  function getConn() {
    try {
      var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (!c) return null;
      return {
        effectiveType: c.effectiveType || null,
        downlink: (typeof c.downlink === 'number') ? c.downlink : null,
        rtt: (typeof c.rtt === 'number') ? c.rtt : null,
        saveData: !!c.saveData,
      };
    } catch (_) {
      return null;
    }
  }

  function shortUA() {
    try {
      var ua = String(navigator.userAgent || '');
      // чтобы не раздувать скриншот
      return ua.length > 180 ? (ua.slice(0, 180) + '…') : ua;
    } catch (_) {
      return 'unknown';
    }
  }

  function safeStr(x) {
    try {
      if (x == null) return '';
      var s = (typeof x === 'string') ? x : (x && x.message) ? String(x.message) : String(x);
      // не выводим потенциальные токены/секреты (на всякий случай)
      s = s.replace(/Bearer\s+[A-Za-z0-9\-\._~\+\/]+=*/g, 'Bearer [redacted]');
      s = s.replace(/refresh_token["']?\s*:\s*["'][^"']+["']/gi, 'refresh_token:"[redacted]"');
      s = s.replace(/access_token["']?\s*:\s*["'][^"']+["']/gi, 'access_token:"[redacted]"');
      return s;
    } catch (_) {
      return 'unknown';
    }
  }

  function mkId() {
    var a = Date.now().toString(36);
    var b = Math.random().toString(36).slice(2, 6);
    return (a + '-' + b);
  }

  var state = {
    __inited: true,
    id: mkId(),
    build: getBuild(),
    page: (function () { try { return location.pathname || '/'; } catch (_) { return '/'; } })(),
    href: (function () { try { return location.href || ''; } catch (_) { return ''; } })(),
    startedAt: Date.now(),
    pageReady: false,
    overlayShown: false,
    lastCode: null,
    lastMessage: null,
    events: [],
    fetchFails: [],
    supabaseFailCount: 0,
  };

  function pushArr(arr, item, maxLen) {
    arr.push(item);
    while (arr.length > maxLen) arr.shift();
  }

  function addEvent(ev) {
    ev = ev || {};
    ev.at = ev.at || nowIso();
    pushArr(state.events, ev, 20);
  }

  function addFetchFail(ff) {
    ff = ff || {};
    ff.at = ff.at || nowIso();
    pushArr(state.fetchFails, ff, 12);
  }

  function isSupabaseUrl(url) {
    url = String(url || '');
    return url.indexOf('.supabase.co/') !== -1;
  }

  function isContentUrl(url) {
    url = String(url || '');
    return url.indexOf('/content/') !== -1 || url.indexOf('content/tasks/') !== -1;
  }

  function isJsdelivr(url) {
    url = String(url || '');
    return url.indexOf('cdn.jsdelivr.net') !== -1;
  }

  function looksLikeSupabaseSdkUrl(url) {
    url = String(url || '');
    return isJsdelivr(url) && (url.indexOf('@supabase/supabase-js') !== -1 || url.indexOf('supabase-js') !== -1);
  }

  function ensureOverlay() {
    var el = document.getElementById('ege-diag-overlay');
    if (el) return el;

    el = document.createElement('div');
    el.id = 'ege-diag-overlay';
    el.style.cssText =
      'position:fixed;inset:0;z-index:999999;background:#fff;color:#111;' +
      'font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;' +
      'padding:16px;overflow:auto;display:none;';

    var wrap = document.createElement('div');
    wrap.style.cssText = 'max-width:760px;margin:0 auto;';

    var title = document.createElement('div');
    title.id = 'ege-diag-title';
    title.textContent = 'Проблема с загрузкой';
    title.style.cssText = 'font-size:18px;line-height:1.25;margin:0 0 10px 0;';

    var summary = document.createElement('div');
    summary.id = 'ege-diag-summary';
    summary.style.cssText = 'opacity:.92;margin:0 0 12px 0;white-space:pre-wrap;';

    var pre = document.createElement('pre');
    pre.id = 'ege-diag-details';
    pre.style.cssText =
      'white-space:pre-wrap;word-break:break-word;' +
      'border:1px solid #eee;border-radius:12px;background:#fafafa;' +
      'padding:12px;margin:0;line-height:1.35;font-size:12.5px;';

    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;';

    function mkBtn(text) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = text;
      b.style.cssText =
        'padding:10px 12px;border:1px solid #ddd;border-radius:10px;' +
        'background:#fff;cursor:pointer;font-size:14px;';
      return b;
    }

    var bReload = mkBtn('Обновить');
    bReload.id = 'ege-diag-reload';
    bReload.onclick = function () { try { location.reload(); } catch (_) {} };

    var bCopy = mkBtn('Скопировать детали');
    bCopy.id = 'ege-diag-copy';
    bCopy.onclick = function () {
      try {
        var txt = document.getElementById('ege-diag-details')?.textContent || '';
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(txt);
          bCopy.textContent = 'Скопировано';
          setTimeout(function () { bCopy.textContent = 'Скопировать детали'; }, 1200);
        }
      } catch (_) {}
    };

    var bClose = mkBtn('Закрыть');
    bClose.id = 'ege-diag-close';
    bClose.onclick = function () {
      try {
        el.style.display = 'none';
      } catch (_) {}
    };

    btnRow.appendChild(bReload);
    btnRow.appendChild(bCopy);
    btnRow.appendChild(bClose);

    var hints = document.createElement('div');
    hints.id = 'ege-diag-hints';
    hints.style.cssText = 'margin-top:12px;opacity:.85;font-size:13px;line-height:1.35;white-space:pre-wrap;';
    hints.textContent =
      'Что можно попробовать:\n' +
      '1) обновить страницу\n' +
      '2) открыть через другую сеть (например мобильный интернет)\n' +
      '3) если вы в РФ и не помогает — попробовать VPN\n\n' +
      'Сделайте скрин этого экрана и пришлите мне.';

    wrap.appendChild(title);
    wrap.appendChild(summary);
    wrap.appendChild(pre);
    wrap.appendChild(btnRow);
    wrap.appendChild(hints);

    el.appendChild(wrap);
    document.documentElement.appendChild(el);
    return el;
  }

  function formatDetails(extra) {
    var lines = [];
    lines.push('diag_id: ' + state.id);
    lines.push('time: ' + nowIso());
    lines.push('build: ' + state.build);
    lines.push('page: ' + state.page);
    try {
      lines.push('online: ' + (navigator.onLine ? 'true' : 'false'));
    } catch (_) {}
    var c = getConn();
    if (c) lines.push('connection: ' + JSON.stringify(c));
    lines.push('ua: ' + shortUA());
    if (state.lastCode) lines.push('code: ' + state.lastCode);
    if (state.lastMessage) lines.push('message: ' + state.lastMessage);

    if (state.fetchFails.length) {
      lines.push('');
      lines.push('fetch_fails:');
      for (var i = Math.max(0, state.fetchFails.length - 8); i < state.fetchFails.length; i++) {
        var f = state.fetchFails[i];
        lines.push('- ' + (f.at || '') + ' ' + (f.url || '') + ' status=' + (f.status ?? '?') + ' ' + (f.err ? safeStr(f.err) : ''));
      }
    }

    if (state.events.length) {
      lines.push('');
      lines.push('events:');
      for (var j = Math.max(0, state.events.length - 10); j < state.events.length; j++) {
        var e = state.events[j];
        var s = '- ' + (e.at || '') + ' [' + (e.type || 'event') + '] ' + (e.tag ? (e.tag + ' ') : '') + (e.url || '') + (e.status ? (' status=' + e.status) : '');
        if (e.msg) s += ' ' + safeStr(e.msg);
        lines.push(s.trim());
      }
    }

    if (extra && typeof extra === 'object') {
      try {
        lines.push('');
        lines.push('extra:');
        lines.push(safeStr(JSON.stringify(extra)));
      } catch (_) {}
    }

    return lines.join('\n');
  }

  function show(code, message, extra) {
    if (state.overlayShown) return;
    state.overlayShown = true;
    state.lastCode = code || state.lastCode || 'E_UNKNOWN';
    state.lastMessage = safeStr(message || state.lastMessage || '');
    try {
      var el = ensureOverlay();
      el.style.display = 'block';
      var summary = document.getElementById('ege-diag-summary');
      if (summary) {
        var first = (state.lastCode ? (state.lastCode + ': ') : '') + (state.lastMessage || 'Не удалось загрузить страницу.');
        summary.textContent = first;
      }
      var pre = document.getElementById('ege-diag-details');
      if (pre) pre.textContent = formatDetails(extra);
    } catch (_) {}
  }

  function report(code, message, details) {
    addEvent({ type: 'report', msg: safeStr(message || code || ''), url: details?.url || null, status: details?.status || null });
    // Автопоказ только если страница ещё не готова (чтобы не мешать работе в середине занятия)
    if (!state.pageReady) show(code, message, details);
  }

  function markReady() {
    state.pageReady = true;
  }

  // Глобальные ошибки
  window.addEventListener('error', function (ev) {
    try {
      var target = ev && ev.target;
      if (target && (target.tagName === 'SCRIPT' || target.tagName === 'LINK' || target.tagName === 'IMG')) {
        var url = target.src || target.href || '';
        addEvent({ type: 'resource', tag: String(target.tagName || '').toLowerCase(), url: String(url || ''), msg: 'load_error' });
        // критично: не загрузился Supabase SDK с CDN
        if (looksLikeSupabaseSdkUrl(url)) {
          show('E_CDN_SCRIPT', 'Не загрузился важный скрипт (Supabase SDK).', { url: String(url || '') });
        }
        return;
      }

      // обычная JS-ошибка
      addEvent({ type: 'error', msg: safeStr(ev && (ev.message || ev.error || 'error')), url: null });
    } catch (_) {}
  }, true);

  window.addEventListener('unhandledrejection', function (ev) {
    try {
      var reason = ev && ev.reason;
      var msg = safeStr(reason);
      addEvent({ type: 'rejection', msg: msg, url: null });

      // Частый кейс: не загрузился ESM-модуль с CDN (jsdelivr)
      if ((msg.indexOf('cdn.jsdelivr.net') !== -1 && msg.indexOf('supabase') !== -1) ||
          msg.indexOf('Failed to fetch dynamically imported module') !== -1 ||
          msg.indexOf('Importing a module script failed') !== -1) {
        show('E_CDN_SCRIPT', 'Не загрузились внешние модули (CDN).', { reason: msg });
      }
    } catch (_) {}
  });

  // Лёгкая обёртка вокруг fetch — только для сбора диагностики (поведение не меняем)
  try {
    if (typeof window.fetch === 'function') {
      var _fetch = window.fetch.bind(window);
      window.fetch = function (input, init) {
        var url = '';
        try {
          url = (typeof input === 'string') ? input : (input && input.url) ? input.url : String(input || '');
        } catch (_) { url = ''; }

        return _fetch(input, init).then(function (res) {
          try {
            if (res && !res.ok) {
              var st = res.status;
              if (isSupabaseUrl(url) || isContentUrl(url)) {
                addFetchFail({ url: String(url || ''), status: st, err: 'HTTP_' + st });
                if (!state.pageReady) {
                  if (isSupabaseUrl(url) && (st === 401 || st === 403)) {
                    show('E_SUPABASE_HTTP', 'Доступ к серверу отклонён (' + st + ').', { url: String(url || ''), status: st });
                  }
                }
              }
            }
          } catch (_) {}
          return res;
        }).catch(function (err) {
          try {
            if (isSupabaseUrl(url) || isContentUrl(url) || isJsdelivr(url)) {
              addFetchFail({ url: String(url || ''), status: 0, err: safeStr(err) });

              if (isSupabaseUrl(url)) {
                state.supabaseFailCount += 1;
                // Показываем и до, и после readiness: это именно «не работает сеть/доступ».
                if (state.supabaseFailCount >= 1) {
                  show('E_SUPABASE_NET', 'Не удаётся связаться с сервером (Supabase).', { url: String(url || ''), err: safeStr(err) });
                }
              } else if (isJsdelivr(url)) {
                show('E_CDN_NET', 'Не удаётся загрузить данные с CDN.', { url: String(url || ''), err: safeStr(err) });
              } else if (isContentUrl(url)) {
                show('E_CONTENT_NET', 'Не удаётся загрузить файлы контента.', { url: String(url || ''), err: safeStr(err) });
              }
            }
          } catch (_) {}
          throw err;
        });
      };
    }
  } catch (_) {}

  // Watchdog: если страница "висит" и не пометила себя готовой
  (function () {
    var timeoutMs = 18000;
    var t = setTimeout(function () {
      try {
        if (state.pageReady || state.overlayShown) return;

        // показываем только если уже накопились признаки проблемы
        var hasSignals = (state.events.length > 0) || (state.fetchFails.length > 0);
        if (!hasSignals) {
          show('E_INIT_TIMEOUT', 'Страница долго загружается.', {});
        } else {
          show('E_INIT_TIMEOUT', 'Страница не смогла загрузиться.', {});
        }
      } catch (_) {}
    }, timeoutMs);

    // на всякий случай чистим таймер, если кто-то явно пометит готовность
    state.__watchdog = t;
  })();

  // Экспорт
  window.__EGE_DIAG__ = {
    __inited: true,
    id: state.id,
    report: report,
    show: show,
    markReady: markReady,
    _state: state, // для внутреннего дебага
  };
})();
