# Cloudflare Worker — Supabase reverse-proxy

Прокси-Worker, чтобы тренажёр не ходил напрямую на `*.supabase.co` (этот домен блокируется у части ISP в РФ). Браузер обращается к Worker, Worker — к Supabase.

## Что проксируется

- `/auth/v1/*` — авторизация (login, signup, OAuth callback, token refresh).
- `/rest/v1/*` — PostgREST: каталог, RPC, профили, домашки.
- `/__proxy_health` — health-check (200 OK + JSON), используется диагностикой.

Что **не** проксируется (тренажёр не использует): `/storage/v1/*`, `/realtime/v1/*`, `/functions/v1/*`.

## Деплой — 2 фазы

### Фаза 1. Деплой на workers.dev (5 минут, без переноса домена)

URL Worker'а будет вида `ege-supabase-proxy.<account>.workers.dev`. Этого достаточно для smoke-теста.

```bash
# 1. Установить wrangler (Node 18+)
npm install -g wrangler

# 2. Авторизация в Cloudflare (откроется браузер)
wrangler login

# 3. Деплой
cd cloudflare-worker
wrangler deploy
```

В конце команда напечатает URL вида:
```
Deployed to https://ege-supabase-proxy.your-account.workers.dev
```

### Фаза 2. Привязка api.ege-trainer.ru (опционально, позже)

Требует, чтобы домен `ege-trainer.ru` был подключён к Cloudflare DNS.

**Перенос DNS в Cloudflare (один раз):**

1. В Cloudflare Dashboard → **Add a Site** → ввести `ege-trainer.ru`.
2. Cloudflare сканирует текущие DNS-записи у reg.ru — проверь, что **все импортированы корректно**, особенно:
   - `A` или `CNAME` для корневого домена → GitHub Pages (`185.199.108.153` и т.п. или `<user>.github.io`).
   - `MX` для почты, если она есть.
   - `TXT` для DKIM/SPF, если настроены.
3. Cloudflare даст две nameserver-записи (`xxx.ns.cloudflare.com`, `yyy.ns.cloudflare.com`).
4. Зайти в **reg.ru → Управление DNS** → поменять nameservers на cloudflare-овские.
5. Подождать пропагации (от 30 минут до 24 часов). До завершения сайт может быть нестабилен — лучше делать ночью.

**Привязка subdomain api.ege-trainer.ru:**

1. В `wrangler.toml` раскомментировать блок `[[routes]]`.
2. `wrangler deploy` — Worker автоматически создаст DNS-запись и выдаст SSL.

## Тестирование Worker'а

После деплоя (Фаза 1) проверь Worker напрямую:

```bash
# health
curl https://ege-supabase-proxy.<account>.workers.dev/__proxy_health
# ожидаем: {"ok":true,"target":"knhozdhvjhcovyjbjfji.supabase.co","ts":"..."}

# auth health (через прокси)
curl -H "apikey: <ANON_KEY>" \
  https://ege-supabase-proxy.<account>.workers.dev/auth/v1/health
# ожидаем: {"name":"GoTrue","version":"..."}

# рест ping (любая публичная RPC)
curl -H "apikey: <ANON_KEY>" \
  https://ege-supabase-proxy.<account>.workers.dev/rest/v1/catalog_theme_dim?select=*&limit=1
# ожидаем: JSON-массив (или [] если RLS режет)
```

## Подключение к тренажёру

После того как Worker отвечает:

1. В `app/config.js:5` поменять `url` на адрес Worker'а.
2. Во всех `.html` (root, `tasks/`, `tests/`) в `<meta http-equiv="Content-Security-Policy">` заменить `https://knhozdhvjhcovyjbjfji.supabase.co` на адрес Worker'а в `connect-src`.
3. В `app/diag_bootstrap.js:103` — проверить детектор `.supabase.co` (если он там есть).
4. **OAuth flow:**
   - Supabase Dashboard → Auth → Providers → Google → Callback URL: поменять на `https://<worker>/auth/v1/callback`.
   - Google Cloud Console → APIs & Services → Credentials → OAuth Client → Authorized redirect URIs: **добавить** новый URI (не удалять старый).

## Откат

Если что-то ломается:

- В коде: вернуть `url` в `app/config.js` на `https://knhozdhvjhcovyjbjfji.supabase.co` и push.
- OAuth: вернуть Callback URL в Supabase на старое значение, удалить запись из Google Cloud Console.
- Worker сам по себе не сломает прод — он не активируется в браузере, пока его URL не прописан в коде.

## Лимиты Free plan

- 100 000 requests / day на весь account. Для проекта с десятками учеников хватит с большим запасом.
- 10 ms CPU per request. Прокси такой простой, что это нерелевантно.
- Никаких ограничений на размер тела до 100 MB.

## Что внутри `proxy.js`

Около 100 строк, без зависимостей. Логика:

1. CORS preflight (OPTIONS) — отвечаем сами, не проксируем.
2. Health endpoint `/__proxy_health` — для тестов.
3. Allowlist путей — только `/auth/v1/*` и `/rest/v1/*`, всё прочее 404.
4. Перенос headers, чистка CF-специфичных (`cf-connecting-ip` и т.п.).
5. Запрос к Supabase с `redirect: 'manual'` — критично для OAuth flow, чтобы 302 на Google уходил клиенту 1:1.
6. Ответ копируется со всеми headers, поверх накладывается CORS.
