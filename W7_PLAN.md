# W7 — Selfhosted Supabase: миграция на собственный backend

## Метаданные

| Поле | Значение |
|---|---|
| Дата составления | 2026-05-18 |
| Автор | Claude (по диалогу с оператором) |
| Тип | миграционная волна |
| Приоритет | P0 (блокирует массовый запуск осенью 2026) |
| Целевое окно | июнь–август 2026 |
| Зависимости | не блокируется текущим W1/W2/W3 — может идти параллельно или после |
| Baseline commit на момент составления | `dcd7b600` (`revert(worker): drop OAuth redirect_uri rewrite`) |
| Связанные документы | `memory/project_ru_access.md`, `cloudflare-worker/README.md` |

## Статус (2026-05-19)

**Stage 0 закрыт.** Tactical migration на собственный VPS (только nginx-прокси перед Supabase Cloud) выполнен в рамках срочного снятия блокировок РКН для текущих учеников. Production-инфра: `api.ege-trainer.ru` (Timeweb Cloud, Москва, 1180 ₽/мес). Отчёт: `reports/w7_stage0_proxy_migration_report.md`.

**W7-full остаётся открытым** — это полная миграция БД на selfhosted Supabase stack на том же VPS. Целевое окно прежнее — лето 2026. План ниже описывает W7-full целиком; пункты, закрытые в Stage 0, помечены ✅.

---

## 1. Цель

Перенести тренажёр с Supabase Cloud (`knhozdhvjhcovyjbjfji.supabase.co`) на собственный selfhosted Supabase stack, развёрнутый на VPS внутри РФ, чтобы:

1. Исключить зависимость от блокируемых иностранных SaaS-доменов (`*.supabase.co`, `*.workers.dev`, etc.) — у части ISP в РФ они зарезаны на DPI/TCP-уровне.
2. Получить стабильный 95%+ uptime для российских учеников **без VPN**.
3. Подготовить инфраструктуру к запуску на массовую аудиторию (сотни–тысячи учеников осенью 2026).
4. Сохранить совместимость с существующим кодом тренажёра — Supabase JS SDK, REST/RPC, RLS должны работать **без изменений в `app/providers/*`**.

После W7 фронтенд тренажёра ходит **только** на `api.ege-trainer.ru` (наш домен, наш VPS), никаких `supabase.co`/`workers.dev`.

---

## 2. Контекст и мотивация

### Почему это нужно

Состояние на 2026-05-18 (`memory/project_ru_access.md`):

- **Прямой `*.supabase.co`**: зарезан у большинства ISP в РФ. Без VPN не работает.
- **Cloudflare Worker `*.workers.dev`** (текущий прокси, развёрнут в W7-stage-0 2026-05-18): работает у части учеников, но **не у всех** — у конкретных мобильных операторов (LTE/4G) `workers.dev` блокируется так же, как `supabase.co`. Подтверждено диагностикой одного ученика: `proxy_health: fail timeout 15s`, `supabase_health: fail timeout 15s`, при этом `google.com` и `cdn.jsdelivr.net` доступны.
- **Любой иностранный SaaS-хостинг** (vercel.app, deno.dev, fly.dev, render.com) — подвержен той же логике РКН-блокировок. Это системная проблема, не точечная.

### Альтернативы, которые мы отвергли

| Альтернатива | Почему нет |
|---|---|
| Cloudflare Custom Domain (`api.ege-trainer.ru` поверх Worker) | Не решает блокировку Cloudflare IP у части мобильных операторов. Шанс успеха 4/10. |
| Supabase Pro + Custom Auth Domain ($25/мес) | Меняет только auth endpoint, REST остаётся на `supabase.co`. Не решает основную проблему. |
| Свой backend с нуля (Node/Go + Postgres) | 2–3 месяца разработки, большой объём frontend rework. Архитектурно избыточно — Supabase stack нас устраивает. |
| Несколько прокси с fallback (Hetzner + DigitalOcean + workers.dev) | 9/10 надёжность, но сложный код, тяжёлая отладка, два VPS + Cloudflare. Откладываем как fallback стратегию, если W7 пойдёт не так. |

### Почему selfhosted Supabase

- **Тот же стек, что у нас сейчас в проде:** PostgreSQL + gotrue (auth) + PostgREST + Kong. Open-source, бесплатно.
- **Фронтенд почти не меняется.** Supabase JS SDK не различает, на каком домене стоит Supabase — только URL в конфиге. Все наши RPC/REST/RLS продолжат работать как есть.
- **Реалистичные трудозатраты:** 1.5–2 недели календарно, ~30–50 часов чистой работы при отсутствии форс-мажоров.
- **Хостинг внутри РФ** (Selectel / Yandex Cloud / VK Cloud / Timeweb Cloud) исключает блокировки **по построению**.

---

## 3. Out of scope (что НЕ делаем в W7)

- **Не переписываем backend с нуля.** Используем тот же стек, что и Supabase Cloud, через их официальный docker-compose.
- **Не делаем рефакторинг провайдеров** (`app/providers/*.js`). Они должны работать без изменений.
- **Не переносим Storage / Realtime / Edge Functions** — тренажёр их не использует (подтверждено recon в начале сессии).
- **Не делаем DNS-перенос `ege-trainer.ru` в Cloudflare.** Нам он не нужен — VPS внутри РФ, никакого Cloudflare в схеме. Reg.ru остаётся DNS-провайдером, добавим только A-запись для `api.ege-trainer.ru`.
- **Не трогаем Sentry интеграцию** — она остаётся как есть.
- **Не делаем CI-пайплайн для деплоя Supabase.** Деплой ручной (SSH + docker-compose), это норма для одного-двух операторов.
- **Не делаем HA (high-availability) / failover между двумя VPS.** Один VPS, бэкапы. При запуске на 10k+ учеников — отдельная волна W8.
- **Не делаем DDoS-защиту.** Тренажёр не такая цель. Если ситуация изменится — Cloudflare TCP/UDP proxy перед VPS как отдельная задача.

---

## 4. Затрагиваемые файлы

### Изменяемые

- `app/config.js:5` — URL поменять с workers.dev на `https://api.ege-trainer.ru`.
- Все HTML (root + `tasks/` + `tests/`) — в CSP `connect-src` добавить `https://api.ege-trainer.ru` (старые URL оставить — для отката).
- `tasks/diag_network.html` — обновить `PROXY_URL` и тесты, чтобы диагностика проверяла новый endpoint.
- `app/diag_bootstrap.js` — `isSupabaseUrl()` дополнить новым доменом.
- `docs/supabase/runtime_rpc_registry.md` — обновить заголовок (если упоминается host).
- `memory/project_ru_access.md` — обновить статус.
- `PROJECT_STATUS.md`, `GLOBAL_PLAN.md` — финальная синхронизация (см. §11).

### Создаваемые

- `selfhost/` (новая папка):
  - `docker-compose.yml` — стек Supabase.
  - `Caddyfile` (или `nginx.conf`) — HTTPS termination.
  - `.env.example` — шаблон переменных окружения (без секретов).
  - `README.md` — пошаговая инструкция деплоя и обслуживания.
  - `backup.sh` — скрипт ночного pg_dump в Object Storage.
  - `MIGRATION_NOTES.md` — журнал миграции (что и когда переносили из cloud).

### Удаляемые / архивируемые

- `cloudflare-worker/` — можно либо удалить, либо оставить с пометкой `DEPRECATED.md`. Удалить только после стабильной работы api.ege-trainer.ru в течение ≥2 недель.

---

## 5. Пошаговый план

### 5.0 Task-tracking (обязательно)

В начале работы исполнитель создаёт TaskList через TaskCreate с пунктами §5.1–§5.7. По мере выполнения обновляет статус через TaskUpdate: `in_progress` при старте, `completed` при завершении. Это нужно для куратора и оператора в реальном времени.

### 5.1 Подготовка инфраструктуры (4–8 ч)

**Что:**

1. Выбрать VPS-провайдера. Рекомендация: **Selectel** или **Yandex Cloud** (известные, надёжные, рублёвая оплата). Сравнить тарифы по характеристикам:
   - Минимум 4 ГБ RAM, 80 ГБ SSD, 2 vCPU.
   - Регион: Москва или Питер (для latency).
   - Цена: ~500–1000 ₽/мес.
2. Купить VPS, получить IP-адрес.
3. Выбрать домен и настроить DNS:
   - У reg.ru добавить A-запись `api.ege-trainer.ru` → IP VPS.
   - Опционально: также `api-staging.ege-trainer.ru` → тот же IP (для staging-фазы).
4. Выбрать SMTP-провайдер для отправки писем (auth confirmation, magic link, password reset):
   - **Вариант A**: Yandex Mail для домена (бесплатно, до ~100 писем/день, требует SPF/DKIM/DMARC).
   - **Вариант B**: Mailgun (5000 писем/мес бесплатно, проще настройка).
   - Решение принять на этапе 5.1.
5. Object Storage для бэкапов: **Selectel Object Storage** или **VK Cloud Storage** (S3-совместимые, ~100 ₽/мес за 100 ГБ).

**DoD пункта:** VPS работает, SSH доступен, DNS пропагирован, SMTP credentials получены, Object Storage bucket создан.

**Оператор:** регистрация в облаке, оплата, DNS у reg.ru, SPF/DKIM/DMARC записи (по моему гайду).

**Исполнитель:** проверка SSH, тест DNS-резолва, набросок Caddyfile.

### 5.2 Поднять Supabase docker stack (1–2 дня)

**Что:**

1. SSH на VPS, базовые шаги hardening:
   - Создать non-root пользователя.
   - Firewall: открыть 22, 80, 443; закрыть всё остальное.
   - Установить fail2ban (защита от brute-force SSH).
2. Установить Docker + docker-compose.
3. Клонировать репо `supabase/supabase` → взять оттуда `docker/docker-compose.yml`.
4. Подготовить `.env`:
   - Сгенерировать JWT secret (32-байт случайная строка).
   - Сгенерировать ANON и SERVICE_ROLE JWT по этому secret (есть скрипт в supabase/docker).
   - Задать `SITE_URL`, `API_EXTERNAL_URL`, `ADDITIONAL_REDIRECT_URLS`.
   - SMTP credentials.
   - Postgres password.
5. Отключить ненужные сервисы в `docker-compose.yml`:
   - `realtime`, `storage-api`, `imgproxy`, `pgsodium` (для Storage), `studio` (можно оставить для админки), `meta`, `functions`, `analytics`, `vector`.
   - Оставить: `db` (Postgres), `kong` (API gateway), `auth` (gotrue), `rest` (PostgREST).
6. `docker-compose up -d`, дождаться healthcheck.
7. Поднять Caddy в отдельном compose или системно:
   - `api.ege-trainer.ru` → `localhost:8000` (Kong).
   - Let's Encrypt SSL автоматически.
8. Тесты:
   - `curl https://api.ege-trainer.ru/auth/v1/health` → `200 {"name":"GoTrue",...}`.
   - `curl https://api.ege-trainer.ru/rest/v1/` → `200 {...openapi...}`.

**DoD пункта:** stack поднят, health-endpoints отвечают, HTTPS работает.

**Подводные камни:**
- На 2 ГБ RAM Supabase тормозит — нужно 4 ГБ минимум.
- gotrue с собственным SMTP может потребовать переменные `GOTRUE_SMTP_*` явно.
- Caddy предпочтительнее nginx — меньше конфига, автоматический SSL без certbot.

### 5.3 Перенести БД (4–8 ч)

**Что:**

1. На Supabase Cloud Dashboard → Settings → Database → получить connection string (с паролем).
2. На VPS:
   ```bash
   pg_dump -Fc -d "<cloud-connection-string>" -f /tmp/cloud-dump.fc
   ```
   Это **полный** дамп: schema, data, RLS, RPC, indexes, sequences.
3. Восстановить в локальный Postgres:
   ```bash
   pg_restore -d postgresql://postgres:<pwd>@localhost:5432/postgres /tmp/cloud-dump.fc
   ```
   Возможны конфликты с системными схемами `auth.*`, `storage.*`, `realtime.*` — игнорируем (selfhosted уже их создал).
4. Открыть Supabase Studio (`https://api.ege-trainer.ru/studio` или localhost-proxy через SSH-tunnel) — проверить:
   - Все наши таблицы (`catalog_*`, `homeworks`, `homework_links`, `profiles`, `attempts`, ...).
   - RLS policies включены и совпадают с прод.
   - RPC functions (`catalog_tree_v1`, `get_homework_by_token`, `submit_homework_attempt_v2`, `write_answer_events_v1`, etc.) видны.
5. Smoke через curl:
   ```bash
   curl -H "apikey: $ANON" "https://api.ege-trainer.ru/rest/v1/catalog_theme_dim?select=*&limit=1"
   curl -H "apikey: $ANON" "https://api.ege-trainer.ru/rest/v1/rpc/get_homework_by_token" \
        -H "Content-Type: application/json" -d '{"p_token": "<known-good-token>"}'
   ```

**DoD пункта:** структура и данные полностью перенесены, smoke-запросы возвращают те же данные, что и cloud.

**Подводные камни:**
- `auth.users` — критическая таблица. Хэши паролей (bcrypt) переезжают как есть, пользователи смогут войти со старыми паролями.
- `auth.identities` (связки с OAuth-провайдерами) — тоже мигрирует, но требует, чтобы Google Client ID в новом gotrue совпадал со старым.
- Sequences (auto-increment) — pg_dump их переносит, проверить отдельно.

### 5.4 Настроить Auth (Google OAuth + Email) (1 день)

**Что:**

1. В `.env` gotrue прописать SMTP:
   ```
   GOTRUE_SMTP_HOST=smtp.yandex.ru
   GOTRUE_SMTP_PORT=465
   GOTRUE_SMTP_USER=noreply@ege-trainer.ru
   GOTRUE_SMTP_PASS=<app-password>
   GOTRUE_SMTP_ADMIN_EMAIL=noreply@ege-trainer.ru
   ```
2. В DNS reg.ru добавить SPF, DKIM, DMARC записи (по гайду Yandex/Mailgun) — иначе письма в спам.
3. В `.env` gotrue прописать Google OAuth:
   ```
   GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
   GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=184385844405-1h45oqjmvju2oeb255r4r1n64udvjk21.apps.googleusercontent.com
   GOTRUE_EXTERNAL_GOOGLE_SECRET=<из-Supabase-Cloud-Provider-settings>
   GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://api.ege-trainer.ru/auth/v1/callback
   ```
4. В Google Cloud Console → OAuth Client → Authorized redirect URIs **добавить** `https://api.ege-trainer.ru/auth/v1/callback`. Старые URI (supabase.co и workers.dev) оставить — для отката.
5. В gotrue `.env` прописать Site URL и Redirect URLs (как сейчас в Supabase Dashboard, тот же список из 11+ URL).
6. `docker-compose restart auth`.
7. Тесты:
   - Email signup на тестовом аккаунте → пришло письмо → ссылка работает → залогинились.
   - Password reset → пришло письмо → новая страница принимает токен → новый пароль работает.
   - Google login → редирект → возврат на ege-trainer.ru с сессией.

**DoD пункта:** оба auth flow работают end-to-end.

**Подводные камни:**
- **SMTP — самая капризная часть.** Yandex требует app-password (не обычный пароль), включить SMTP в настройках почты, проверить SPF.
- Если письма в спам — добавить DKIM (нужно сгенерить ключ и положить в DNS reg.ru).
- Google OAuth client_secret — он есть в Supabase Cloud, оператор его копирует.

### 5.5 Frontend cutover (2–4 ч)

**Что:**

1. В `app/config.js:5` поменять URL:
   ```diff
   - url: 'https://ege-supabase-proxy.erantokha.workers.dev',
   + url: 'https://api.ege-trainer.ru',
   ```
2. Во всех HTML (~32 файла) в CSP `connect-src` **добавить** `https://api.ege-trainer.ru` (старые URLs `supabase.co` и `workers.dev` **оставить** — для отката). Через sed, как делали в W7-stage-0.
3. В `tasks/diag_network.html`: добавить `api.ege-trainer.ru` в `PROXY_URL` или сделать массив проверяемых endpoint'ов.
4. В `app/diag_bootstrap.js`: `isSupabaseUrl()` расширить — добавить `api.ege-trainer.ru`.
5. `node tools/bump_build.mjs` → новая версия билда → автоматическая cache-busting.
6. Smoke-test локально (не РФ): email login + Google login + catalog + homework + stats.
7. Commit + push.

**DoD пункта:** тренажёр на ege-trainer.ru функционирует, в DevTools Network видно запросы на `api.ege-trainer.ru`, никаких `supabase.co`/`workers.dev`.

### 5.6 Backup + monitoring (4–8 ч)

**Что:**

1. **Backup**:
   - `selfhost/backup.sh`: каждую ночь делает `pg_dump -Fc | gzip | aws s3 cp - s3://<bucket>/dumps/$(date +%Y-%m-%d).sql.gz` (через `aws-cli` с конфигурацией Selectel/VK Cloud S3-endpoint).
   - Cron: `0 3 * * * /opt/selfhost/backup.sh >> /var/log/backup.log 2>&1`.
   - Retention: храним 30 дней (старше — удаляются автоматически через S3 lifecycle policy).
   - **Тест восстановления**: на staging-БД восстановить вчерашний дамп, проверить целостность. Делать минимум **раз в квартал**.

2. **Monitoring**:
   - UptimeRobot (бесплатно) — ping `https://api.ege-trainer.ru/auth/v1/health` каждые 5 минут. Email при падении.
   - Sentry уже подключён в тренажёр — будет ловить клиентские ошибки.
   - Опционально: simple `htop`/`netdata` для отслеживания RAM/CPU/disk на VPS.

3. **Логи**:
   - Docker logs gotrue/postgrest/postgres → rotation через `logrotate` (по умолчанию docker логи не ротейтятся, могут забить диск).
   - Длительное хранение не нужно, 7–14 дней достаточно.

**DoD пункта:** бэкап скрипт работает (запустить вручную, проверить S3), UptimeRobot настроен (проверить отправку test alert), логи ротейтятся.

### 5.7 Production cutover + observation (1 день + 1 неделя)

**Что:**

1. **Pre-cutover checklist**:
   - Все §5.1–§5.6 завершены.
   - Smoke-тесты на staging пройдены.
   - Бэкап cloud Supabase **сделан и проверен** (на случай форс-мажора).
   - Информирование учеников: «вечером возможна короткая недоступность тренажёра».

2. **Cutover** (поздний вечер по Москве, в нерабочее время):
   - Финальный `pg_dump` cloud → restore на VPS (последняя синхронизация).
   - Push merge с обновлённым `app/config.js`.
   - GitHub Pages пересобрался (~1–2 мин).
   - Smoke: открыть ege-trainer.ru в новом приватном окне, проверить login → catalog → homework.

3. **48 часов наблюдения**:
   - Sentry: следить за всплеском ошибок.
   - UptimeRobot: следить за статусом.
   - Обратная связь от 2–3 ключевых учеников в РФ (без VPN): «работает / не работает».

4. **Rollback план** (если что-то ломается):
   - Одна строка в `app/config.js`: URL обратно на `workers.dev` или `supabase.co`. Push.
   - CSP уже разрешает оба, никаких других правок не нужно.
   - Через 2 минуты GitHub Pages пересобрал — тренажёр снова работает на старом стеке.
   - Cloud Supabase оставлять активным **минимум 2 недели** после cutover для возможности отката.

**DoD пункта:** 48 часов без критических ошибок, ≥2 ученика в РФ без VPN подтвердили работу, никаких новых строк в Sentry с network errors на `api.ege-trainer.ru`.

---

## 6. Данные / контракты / миграции

### Schema

Точная копия cloud-schema через `pg_dump -Fc`. Перенос включает:
- Все таблицы из публичных схем (`public`, любые custom).
- `auth.users`, `auth.identities`, `auth.sessions`, `auth.refresh_tokens` — внутренние таблицы gotrue.
- RLS policies (атомарно с таблицами).
- RPC functions (см. `docs/supabase/*.sql` — должны совпасть один-в-один).
- Indexes, sequences, triggers.

### JWT signing keys

- **Новый JWT secret** на selfhosted — генерируется заново (не используем cloud-овский, чтобы не путать).
- **ANON и SERVICE_ROLE keys** — пересоздаются от нового secret.
- **Существующие user-sessions на cloud** — становятся невалидными после cutover. Пользователям придётся залогиниться заново. Это **ожидаемое поведение**, не баг.
- `app/config.js`: новый `anonKey` нужно прописать одновременно с URL.

### OAuth

- **Google Client ID и Secret** — те же. Просто добавляются в новый gotrue.
- **Authorized redirect URIs** в Google Cloud Console — добавить новый `api.ege-trainer.ru/auth/v1/callback`. Старые не удалять (откат).

### Email confirmation tokens

Существующие unverified-пользователи в auth.users могли иметь pending confirmation tokens — они переедут вместе с данными и продолжат работать.

---

## 7. Риски и stop-ask точки

### Stop-ask: оператор должен вмешаться

1. **VPS-провайдер требует нестандартные документы.** Российские облака — Yandex Cloud точно требует ИНН для бизнеса, физлица могут зарегиться через карту. Если у оператора возникнут вопросы compliance — stop-ask, обсудить.
2. **pg_dump падает с ошибкой / corrupted.** Stop-ask, нельзя проводить cutover на повреждённой базе. Альтернативы: ручной перенос через SQL Editor, миграция таблица за таблицей.
3. **SMTP не работает.** Письма не приходят или массово в спам. Stop-ask, нельзя cutover без рабочего email confirmation. Возможные альтернативы: смена SMTP-провайдера, поднятие свой SMTP (postfix), временно отключить email confirmation.
4. **Стоимость > 3000 ₽/мес.** Если выбранный VPS-провайдер по факту дороже расчётов — stop-ask, обсудить tradeoff (можно ли уменьшить RAM, может ли быть дешевле).

### Риски умеренные

- **Расширение scope.** Очень соблазнительно по дороге начать переписывать что-то в `app/providers/*`. **Нельзя.** Только URL и CSP. Если в коде вылезают баги совместимости — stop-ask, скорее всего gotrue/PostgREST на чуть другой версии, разбираемся отдельно.
- **Latency для южных регионов.** VPS в Москве может быть медленным для пользователей за Уралом (~150–250ms). Допустимо для тренажёра, но фиксируем в отчёте.
- **Docker images Supabase из РФ.** Docker Hub в РФ работает (на 2026-05-18). Если в момент работы будет блокировка — нужен mirror. Но это покрывается обычными VPN/proxy решениями.

### Риски долгосрочные (за пределами W7, но фиксируем)

- **Восстановление из бэкапа никогда не тестировалось.** Если бэкап не работает, мы это не узнаем до катастрофы. **Mandatory: тест восстановления в §5.6 + раз в квартал.**
- **Один VPS = single point of failure.** Если упадёт — простой. Для текущего объёма (≤20 учеников) приемлемо. Для запуска осенью — отдельная волна W8 (HA или failover proxy).
- **Security updates.** Postgres/gotrue имеют CVE; нужно их обновлять. Если оператор не следит — риск.

---

## 8. Критерии приёмки (DoD)

W7 закрыта, когда **все** пункты выполнены:

1. ✅ VPS работает, SSH доступен, firewall настроен, fail2ban активен.
2. ✅ `https://api.ege-trainer.ru` отвечает на:
   - `GET /auth/v1/health` → 200, JSON GoTrue.
   - `GET /rest/v1/` → 200, OpenAPI.
   - `POST /rest/v1/rpc/get_homework_by_token` с известным токеном → 200, ожидаемые данные.
3. ✅ Все таблицы, RLS, RPC из cloud перенесены — sanity-check через Supabase Studio (3–5 случайных проверок).
4. ✅ Email signup: новый аккаунт получает письмо → подтверждает → может войти.
5. ✅ Email login существующего аккаунта (после миграции): пароль работает, сессия создаётся.
6. ✅ Google OAuth: full flow проходит, сессия создаётся.
7. ✅ Password reset: email приходит, ссылка работает, новый пароль работает.
8. ✅ Frontend ege-trainer.ru использует **только** `api.ege-trainer.ru`. В DevTools Network ни одного запроса на `supabase.co` или `workers.dev`.
9. ✅ Все ключевые страницы открываются и работают: главная, login, catalog, homework (создание + выполнение по ссылке), stats.
10. ✅ Backup cron работает: `aws s3 ls s3://<bucket>/dumps/` показывает дамп за последние 24 часа.
11. ✅ Тест восстановления бэкапа на staging-БД: pg_restore проходит без ошибок, данные совпадают с production.
12. ✅ UptimeRobot настроен и шлёт alert на email при искусственном падении (`docker stop kong` → alert через 5–10 минут).
13. ✅ Sentry не получает новых критических ошибок 48 часов после cutover.
14. ✅ 2–3 ученика в РФ **без VPN** запустили `tasks/diag_network.html` и подтвердили: `api.ege-trainer.ru` доступен (новый тест в диагностике), Auth и REST через него работают.
15. ✅ Документация: `selfhost/README.md` написан и проверен (исполнитель деплоит с нуля по своему же README — должно получиться).
16. ✅ `cloudflare-worker/DEPRECATED.md` создан, объясняет что и почему deprecated.

---

## 9. План проверки

### Staging-фаза (до production cutover)

Пока api.ege-trainer.ru ещё **не** прописан в `app/config.js`:

1. **Curl-тесты** (см. §8 пункт 2).
2. **Локальный override** через `window.__CONFIG__` в DevTools на ege-trainer.ru:
   ```js
   window.__CONFIG__ = { supabase: { url: 'https://api.ege-trainer.ru', anonKey: '<new-anon-key>' } };
   ```
   И открыть страницу — она теперь ходит на selfhosted. Проверить login, catalog, etc.
3. **Diagnostics**: расширить `tasks/diag_network.html` тестами на api.ege-trainer.ru. Запустить вручную.
4. **Тестовые аккаунты**: создать 2–3 тестовых аккаунта на selfhosted, прогнать end-to-end сценарии.

### Production cutover

См. §5.7.

### Post-cutover

- 48 часов: ежедневная проверка Sentry, UptimeRobot, обратной связи.
- 1 неделя: проверить cron backup, посмотреть размер дампов, протестировать восстановление.
- 2 недели: финальный обзор, удалить cloudflare-worker (если всё стабильно), отключить cloud Supabase project (опционально, можно оставить за $0 как «навсегда не использовать»).

---

## 10. Отчётный артефакт

`reports/w7_selfhost_supabase_report.md` со следующими секциями:

1. **Метаданные** — даты, время по фазам, версии (Supabase, Postgres, gotrue), VPS-провайдер, регион, ресурсы.
2. **Чек-лист §8** — что подтверждено, с evidence.
3. **Архитектурная диаграмма** — ASCII или описание: что куда ходит.
4. **Конфигурация secrets** — какие переменные где живут (без значений).
5. **Migration journal** — что переносили, в каком порядке, что упало по дороге, как чинили.
6. **SMTP setup** — что было выбрано, как настраивали SPF/DKIM/DMARC.
7. **OAuth setup** — что добавили в Google Cloud Console, что в gotrue env.
8. **Backup и monitoring** — настройки cron, UptimeRobot, лимиты Object Storage.
9. **Метрики** — latency `api.ege-trainer.ru` из разных регионов РФ (по diagnostics от учеников), uptime за первые 2 недели, размер БД, RAM/CPU использование.
10. **Стоимость** — фактические затраты в месяц (VPS + Object Storage + SMTP).
11. **Отзывы учеников** — 5–10 цитат от первых учеников после cutover.
12. **Известные проблемы и обходы** — что не получилось идеально.
13. **Рекомендации для W8 и далее** — что улучшать, что мониторить, на что смотреть осенью.
14. **Evidence log** — командная история, скриншоты ключевых моментов, JSON-отчёты диагностики.

---

## 11. Синхронизация документов после закрытия W7

В соответствии с CURATOR.md §5:

1. **PROJECT_STATUS.md** — обновить дату, новый baseline (api.ege-trainer.ru), убрать из рисков «блокировка supabase.co/workers.dev».
2. **GLOBAL_PLAN.md** — перевести W7 в `✅`, обновить критический путь.
3. **`docs/navigation/architecture_contract_4layer.md`** — обновить упоминание Supabase Cloud, если есть.
4. **`docs/supabase/runtime_rpc_registry.md`** — заголовок: указать, что это selfhosted Supabase, а не Cloud.
5. **`memory/project_ru_access.md`** — финальная запись «закрыто, selfhosted Supabase запущен».
6. **`CLAUDE.md`** — не трогать (selfhost — не процессный инвариант, просто новый источник истины по hosting).
7. **`tools/bump_build.mjs`** — прогнать на финальном merge для cache-busting (это будет автоматически, как сейчас).

---

## 12. Открытые вопросы (нужно решить ДО старта)

1. **Российский VPS или европейский (Hetzner)?** Российский = нет блокировок, но возможны санкционные риски в обратную сторону (что Supabase docker не запустится). Европейский = риск что РКН заблочит наш IP. **Рекомендация: российский (Selectel или Yandex Cloud).**
2. **Bare VPS или managed Postgres + Docker host?** Yandex Cloud предлагает Managed Postgres ($20/мес) + Compute. Можно вынести БД на managed (бэкапы, мониторинг включены) и запускать только gotrue/PostgREST на VPS. **Trade-off: дороже на ~$15/мес, надёжнее.**
3. **api.ege-trainer.ru или другой поддомен?** Альтернативы: `api`, `backend`, `db`, `s` (короткий). Решение оператора — это видимый домен.
4. **Subdomain или domain root?** Альтернативное решение: завести **отдельный домен** (например, `ege-api.ru`) — не связанный с основным `ege-trainer.ru`. Если основной домен попадёт под блокировку РКН, API на отдельном домене останется работать. **Рекомендация: subdomain ege-trainer.ru** для простоты на первой итерации.
5. **Cloudflare Worker не удалять или удалить?** Если есть малые группы учеников, у кого `api.ege-trainer.ru` не работает (low probability на российском хостинге, но возможно), Worker может оставаться как fallback в режиме `window.__CONFIG__` override. **Решение принимаем по итогам §5.7.**

---

## 13. Журнал изменений плана

| Дата | Изменение | Кто |
|---|---|---|
| 2026-05-18 | Первоначальная редакция | Claude (по диалогу с оператором) |

---
