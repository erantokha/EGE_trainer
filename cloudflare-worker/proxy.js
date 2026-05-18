// Cloudflare Worker — reverse-proxy для Supabase.
// Цель: убрать `*.supabase.co` из URL-ов тренажёра, потому что этот домен
// блокируется у части ISP в РФ. Браузер ходит только на наш Worker.
//
// Что проксируется:
//   /auth/v1/*   — авторизация (signin, signup, token refresh, OAuth callback)
//   /rest/v1/*   — PostgREST (catalog, RPC, profiles, homeworks, ...)
//
// Что НЕ проксируется (тренажёр это не использует):
//   /storage/v1/*, /realtime/v1/*, /functions/v1/*

const SUPABASE_HOST = 'knhozdhvjhcovyjbjfji.supabase.co';

const ALLOWED_PATH_PREFIXES = [
  '/auth/v1/',
  '/rest/v1/',
];

const ALLOWED_ORIGINS = new Set([
  'https://ege-trainer.ru',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
]);

const CORS_ALLOW_HEADERS = [
  'Authorization',
  'apikey',
  'Content-Type',
  'X-Client-Info',
  'Prefer',
  'Range',
  'Accept-Profile',
  'Content-Profile',
  'x-supabase-api-version',
].join(', ');

const CORS_EXPOSE_HEADERS = [
  'Content-Range',
  'Content-Length',
  'X-Total-Count',
].join(', ');

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : 'https://ege-trainer.ru';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': CORS_ALLOW_HEADERS,
    'Access-Control-Expose-Headers': CORS_EXPOSE_HEADERS,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function jsonError(status, message, request) {
  return new Response(JSON.stringify({ error: 'proxy', message }), {
    status,
    headers: {
      ...corsHeaders(request),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // 1. CORS preflight отвечаем сами, без проксирования
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    // 2. Health-endpoint для диагностики (доступен без CORS-проверок)
    if (url.pathname === '/__proxy_health') {
      const colo = (request.cf && request.cf.colo) || 'unknown';
      return new Response(
        JSON.stringify({ ok: true, target: SUPABASE_HOST, colo, ts: new Date().toISOString() }),
        {
          status: 200,
          headers: {
            ...corsHeaders(request),
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Proxy-Colo': colo,
          },
        }
      );
    }

    // 3. Allowlist путей: всё прочее 404
    const allowed = ALLOWED_PATH_PREFIXES.some(p => url.pathname.startsWith(p));
    if (!allowed) {
      return jsonError(404, 'path not allowed', request);
    }

    // 4. Собираем target URL — путь и query 1:1
    const target = `https://${SUPABASE_HOST}${url.pathname}${url.search}`;

    // 5. Перенос headers, чистка CF-специфичных
    const upstreamHeaders = new Headers(request.headers);
    upstreamHeaders.set('Host', SUPABASE_HOST);
    [
      'cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor',
      'cf-worker', 'cdn-loop',
      'x-real-ip', 'x-forwarded-for', 'x-forwarded-proto', 'x-forwarded-host',
    ].forEach(h => upstreamHeaders.delete(h));

    // 6. Body — для не-GET/HEAD
    let body;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      body = await request.arrayBuffer();
    }

    // 7. Запрос к Supabase. redirect:'manual' — критично для OAuth flow:
    //    Supabase отвечает 302 на Google login URL, мы должны вернуть его клиенту 1:1.
    const colo = (request.cf && request.cf.colo) || 'unknown';
    const t0 = Date.now();
    let upstreamResp;
    try {
      upstreamResp = await fetch(target, {
        method: request.method,
        headers: upstreamHeaders,
        body,
        redirect: 'manual',
      });
    } catch (err) {
      const dt = Date.now() - t0;
      console.log(JSON.stringify({ event: 'upstream_fail', path: url.pathname, colo, ms: dt, err: String(err && err.message || err) }));
      const errHeaders = {
        ...corsHeaders(request),
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Proxy-Colo': colo,
        'X-Proxy-Upstream-Ms': String(dt),
      };
      return new Response(JSON.stringify({ error: 'proxy', message: `upstream fetch failed: ${err && err.message || err}`, ms: dt, colo }), { status: 502, headers: errHeaders });
    }
    const upstreamMs = Date.now() - t0;
    if (upstreamMs > 2000) {
      console.log(JSON.stringify({ event: 'slow_upstream', path: url.pathname, colo, ms: upstreamMs, status: upstreamResp.status }));
    }

    // 8. Ответ — копируем headers, накладываем CORS поверх, оставляем body как стрим
    const respHeaders = new Headers(upstreamResp.headers);
    const cors = corsHeaders(request);
    for (const [k, v] of Object.entries(cors)) {
      respHeaders.set(k, v);
    }
    respHeaders.set('X-Proxy-Colo', colo);
    respHeaders.set('X-Proxy-Upstream-Ms', String(upstreamMs));
    // Чтобы X-Proxy-* стали видимы для browser-JS, добавим к expose-list:
    const exposed = respHeaders.get('Access-Control-Expose-Headers') || '';
    respHeaders.set('Access-Control-Expose-Headers', exposed + ', X-Proxy-Colo, X-Proxy-Upstream-Ms');

    return new Response(upstreamResp.body, {
      status: upstreamResp.status,
      statusText: upstreamResp.statusText,
      headers: respHeaders,
    });
  },
};
