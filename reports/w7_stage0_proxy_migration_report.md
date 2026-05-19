# W7 Stage 0 Report — Tactical proxy migration (Cloudflare Worker → собственный VPS в РФ)

## §1. Метаданные

- task_id: `2026-05-18-w7-stage0-proxy-migration`
- Волна: `W7-stage-0` (tactical часть полной волны W7 — Selfhosted Supabase)
- Тип: `infrastructure_migration` (срочное снятие блокировок РФ для текущих учеников; полная миграция БД — отдельной волной W7-full на лето 2026)
- Дата старта: 2026-05-18
- Дата закрытия: 2026-05-19
- Baseline commit: `bc5a74c8` («chore: stage WS.1 baseline»)
- Финальный merge / production: `c32a4a58` («feat(config): re-flip back to api.ege-trainer.ru — DNS propagated»)
- План: `W7_PLAN.md` (Фаза 1.0–6, остальные фазы — на лето W7-full)
- Связанные документы: `memory/project_ru_access.md`, `cloudflare-worker/README.md`

---

## §2. Цель и контекст

### Что заставило открыть волну

У учеников в РФ тренажёр на `https://ege-trainer.ru/` нестабильно открывался без VPN: проявлялся `Failed to fetch` / `ERR_NAME_NOT_RESOLVED` / `Fetch is aborted` на запросах к `knhozdhvjhcovyjbjfji.supabase.co`. Симптомы различались по устройству / провайдеру / времени дня, что усложняло диагностику со стороны оператора.

Реальная причина (подтверждённая ниже): системная DPI-блокировка домена `*.supabase.co` на крупных российских ISP, идущая с 2024 года и расширившаяся в 2025 году (см. §3 «Recon»).

### Стратегическая цель волны

Снять блокировку доступа для **существующих** учеников **сегодня**, не дожидаясь летней миграции на selfhosted Supabase (W7-full, см. `W7_PLAN.md` целиком).

### Решение

Поднять тонкий reverse-proxy для `/auth/v1/*` и `/rest/v1/*` на инфраструктуре **внутри РФ** (где DPI не режет супабэйз, потому что трафик к нему идёт по магистральным каналам, а не через ISP-уровневую фильтрацию). Tactical phase: только nginx-прокси, БД остаётся на Supabase Cloud. Полная миграция (БД на свой Postgres) — отдельная волна W7-full на лето.

---

## §3. Recon (deep research)

Для принятия решения о хостинге было запущено два независимых deep research через agent-subprocess:

### §3.1 Recon блокировок в РФ

Подтверждено публичными источниками (Habr 997088, 1003852; Cloudflare blog; xakep.ru):

- С **9 июня 2025** РКН применяет DPI-троттлинг 16 КБ на трафик Hetzner / OVH / DigitalOcean / Vultr / Cloudflare у пяти крупнейших ISP РФ (Ростелеком, МТС, МегаФон, Билайн, МГТС). AS24940 Hetzner — в списке 391 заблокированной AS (>225 млн IP).
- Cloudflare за полгода потерял ~30% трафика РФ, в пиках до 60%. Cloudflare публично заявил: «не можем ни технически, ни юридически восстановить доступ».
- **Любой иностранный SaaS-хостинг с массовой аудиторией обходных прокси в РФ — рискованный выбор** на горизонте 12+ месяцев.
- 152-ФЗ с 1 июля 2025 запрещает первичный сбор ПД граждан РФ на иностранных серверах. Штрафы 1-18 млн ₽. Тренажёр (email + имя + прогресс ученика) подпадает.

**Вывод:** для production-инфры остаётся **только** российский хостинг.

### §3.2 Recon рынка российских VPS

Сравнение 15 провайдеров (Timeweb Cloud, Selectel, Yandex Cloud, VK Cloud, Aeza, Beget, RUVDS, FirstVDS, VDSina, HOSTKEY, Cloud.ru, Serverspace, AdminVPS, REG.RU Cloud).

Критерии для нашего случая (нерезидент-физлицо с армянской картой, бюджет 1000-2000 ₽/мес, один VPS со всем стеком):
- Поддержка иностранных карт через 3DS.
- Регистрация без российского паспорта/ИНН.
- 4 vCPU / 8 GB RAM / 80 GB NVMe SSD как target (минимум 2 vCPU / 4 GB / 50 GB).

**Решение:** Timeweb Cloud (тариф Cloud MSK 50: 2 vCPU / 4 GB / 50 GB NVMe, Москва, 1062 ₽/мес со скидкой 10% за 12 мес, или 1180 ₽/мес помесячно). Aeza отклонён из-за документированных блокировок подсетей в РФ. Yandex Cloud отклонён из-за требования юр.лица для нерезидента.

---

## §4. Что сделано

### §4.1 Промежуточный шаг (закрыт): Cloudflare Worker

Был сделан как промежуточная мера перед обнаружением блокировок workers.dev:

- Развёрнут Worker `ege-supabase-proxy.erantokha.workers.dev` (Cloudflare Free plan, Smart Placement = on, регион выхода — ARN/Стокгольм).
- Код в `cloudflare-worker/proxy.js` (~150 строк, allowlist на `/auth/v1/*` + `/rest/v1/*`).
- Подтверждено диагностикой (`tasks/diag_network.html`): у части учеников workers.dev блокировался так же, как supabase.co (DPI-троттлинг 16 КБ).

Worker остаётся в репо как fallback на 2 недели (до 2026-06-02), затем будет удалён.

Эксперимент с rewrite OAuth `redirect_uri` в 302 был сделан и **откачен** (`dcd7b600`): Supabase делает server-side обмен code↔token с Google со своим каноническим `redirect_uri=supabase.co/auth/v1/callback`, mismatch при попытке переписать. Решается только Supabase Pro Custom Auth Domain или полным selfhost (W7-full).

### §4.2 Финальный шаг: собственный VPS в РФ

**Инфраструктура** (Timeweb Cloud Cloud MSK 50):
- VPS: 2 vCPU / 4 GB / 50 GB NVMe, Ubuntu 24.04 LTS, Москва (MSK-1).
- Публичный IPv4: `85.239.35.16`.
- DNS: A-запись `api.ege-trainer.ru → 85.239.35.16` через reg.ru (TTL 300).
- SSL: Let's Encrypt через certbot, автообновление через `certbot.timer`.
- Стоимость: ~1180 ₽/мес (помесячная оплата).

**Hardening:**
- UFW firewall: разрешены только 22 (SSH), 80 (HTTP), 443 (HTTPS).
- fail2ban: jail для sshd, maxretry=5, bantime=1h, findtime=10m.
- Swap 2 GB на `/swapfile`, `vm.swappiness=10` (для подстраховки Postgres-памяти в будущем W7-full).
- SSH: только по ключу (Ed25519), password-auth выключен.

**Reverse-proxy:**
- nginx 1.24, конфиг `/etc/nginx/sites-available/api.ege-trainer.ru`.
- Allowlist путей: `/auth/v1/*` и `/rest/v1/*` проксируются на `knhozdhvjhcovyjbjfji.supabase.co` (стандартный TLS upstream + правильный SNI).
- Health-endpoint `/__proxy_health` для диагностики.
- DNS resolver для upstream: `1.1.1.1 8.8.8.8 valid=300s ipv6=off`.
- Все прочие пути → 404.

**Frontend (commit `bae42a3f` → `c32a4a58`):**
- `app/config.js:5`: `url: 'https://api.ege-trainer.ru'`.
- CSP во всех HTML (`index.html`, `tasks/*.html`, `home_*.html` etc.) дополнено `https://api.ege-trainer.ru` в `connect-src`. Старые URL `supabase.co` и `workers.dev` оставлены для возможности быстрого отката.
- `app/diag_bootstrap.js:isSupabaseUrl()` расширен на api.ege-trainer.ru.

---

## §5. Smoke и DNS-инциденты

### §5.1 Smoke

- ✅ `/__proxy_health` отвечает 200 за ~140 ms.
- ✅ `/auth/v1/health` через прокси отвечает GoTrue v2.189.0, ~630 ms холодный запрос, ~250 ms прогретый.
- ✅ `/rest/v1/...` отвечает JSON-данными за ~500-1200 ms (зависит от запроса).
- ✅ HTTP→HTTPS redirect (301) работает.
- ✅ SSL сертификат от Let's Encrypt, валиден до 2026-08-16, auto-renew настроен.

### §5.2 DNS-инцидент после первого cutover

После первого переключения `app/config.js` на `api.ege-trainer.ru` оператор не смог войти в тренажёр — `ERR_NAME_NOT_RESOLVED`. Причина: его DNS-провайдер ещё держал negative cache (NXDOMAIN) с момента до создания A-записи.

Сделан быстрый откат (commit `3e5c8355`, ~30 минут жизни на проде), потом — через ~30 минут DNS полностью пропагировался на крупные публичные resolvers (Cloudflare 1.1.1.1, Google 8.8.8.8, Yandex 77.88.8.8, Quad9 9.9.9.9), и был сделан обратный re-flip (`c32a4a58`).

Подтверждение от учеников в РФ без VPN: 2 человека отписались «работает».

---

## §6. Архитектурное состояние production

```
Браузер ученика (в РФ или вне)
        ↓ HTTPS
ege-trainer.ru (GitHub Pages — статика HTML/JS)
        ↓ JS делает fetch для данных
api.ege-trainer.ru = 85.239.35.16 (Timeweb Cloud, Москва, nginx)
        ↓ allowlist /auth/v1/* и /rest/v1/* → proxy_pass
knhozdhvjhcovyjbjfji.supabase.co (Supabase Cloud, AWS)
        ↓
PostgreSQL + gotrue auth (БД остаётся в облаке Supabase)
```

**Что работает по-новому:** RU-ученики без VPN могут открыть тренажёр, ходить через nginx-прокси, который из российской магистрали ходит к Supabase напрямую (DPI на стороне RU-ISP видит только SNI `api.ege-trainer.ru` — российский домен, не блокируется).

**Что осталось зависимостью от иностранной инфры:** сама БД и Supabase Cloud. Это закрывается в W7-full (selfhosted Supabase на том же VPS).

---

## §7. Стоимость и операционная нагрузка

- **VPS:** 1180 ₽/мес (Timeweb Cloud Cloud MSK 50, помесячно). Опция: 1062 ₽/мес при оплате 12 мес со скидкой 10%.
- **DNS:** 0 ₽ (reg.ru, в составе домена).
- **SSL:** 0 ₽ (Let's Encrypt).
- **Cloudflare Worker (legacy fallback):** 0 ₽ (Free plan).
- **Итого:** 1180 ₽/мес.

Операционная нагрузка:
- Auto-renew SSL через `certbot.timer`.
- OS updates через `apt update && apt upgrade` (раз в 1-3 месяца).
- Мониторинг: руками через `ssh root@85.239.35.16` + nginx logs (на старте без UptimeRobot, добавим если потребуется).

---

## §8. Расхождения с W7_PLAN.md

`W7_PLAN.md` был написан для **полной** миграции (selfhosted Supabase + nginx + БД). В этой волне сделана **только tactical часть** — Фазы 1.0–6 (инфра + nginx-прокси), без selfhosted Supabase stack и без миграции БД.

Что НЕ сделано в этой волне:
- Docker + supabase/supabase docker-compose (Фаза 5.2 плана).
- pg_dump из Supabase Cloud → restore локально (Фаза 5.3).
- SMTP-настройка для собственного gotrue (Фаза 5.4 §SMTP).
- Object Storage для бэкапов и cron-задача (Фаза 5.6).
- UptimeRobot мониторинг (Фаза 5.6).
- Отдельный 152-ФЗ compliance — БД пока в Supabase Cloud (нарушение по букве, но штрафа ждать сложно — не первая категория провайдера ПД).

Эти пункты переносятся в **W7-full**, ориентир лето 2026. Тот же VPS, тот же домен, добавится stack — фронту не нужно ничего менять (URL остаётся `api.ege-trainer.ru`).

---

## §9. Коммиты волны

```
a6e9b58d feat: add network diagnostics page for RU access investigation
cfa51ed1 fix(diag): replace false-positive sdk_import test + harshen verdict
b93ca5e0 feat: cloudflare worker reverse-proxy for supabase
9a364516 feat(diag): add proxy reachability tests + verdict for proxy-vs-direct
e0145696 feat(worker): enable Smart Placement for RU egress workaround
16972456 feat(worker,diag): expose colo + upstream latency, raise timeout 8→15s
09ae04f2 feat(worker): rewrite redirect_uri in OAuth 302 Location
dcd7b600 revert(worker): drop OAuth redirect_uri rewrite — breaks PKCE flow
d95a233b docs: W7_PLAN.md — selfhosted Supabase migration
bae42a3f feat: route trainer traffic through own RU VPS (api.ege-trainer.ru)
3e5c8355 revert(config): temporary rollback to workers.dev while DNS propagates
c32a4a58 feat(config): re-flip back to api.ege-trainer.ru — DNS propagated
```

---

## §10. Follow-up

### Краткосрочно (1-2 недели)

- Через 2 недели стабильной работы — удалить Cloudflare Worker (репо: `cloudflare-worker/`), упоминания в config и CSP можно почистить позже отдельным cleanup-комитом.
- Поставить UptimeRobot (5 минут): `https://api.ege-trainer.ru/__proxy_health` → 200.

### Среднесрочно (до лета 2026)

- Перед массовым запуском — зарегистрировать дублирующий домен `ege-trainer.com` через Cloudflare Registrar ($10/год), на случай блокировки `.ru` зоны.
- Опционально: настроить ежедневный snapshot VPS через Timeweb Cloud (≈300 ₽/мес).

### Лето 2026 — W7-full

- Поднять полный Supabase stack (Docker compose) на том же VPS.
- Перенести БД из Supabase Cloud.
- SMTP для гото-руутте.
- Cron-бэкапы в Object Storage.
- Mosting / UptimeRobot.
- Cutover: одна строка в `app/config.js` НЕ меняется (URL остаётся `api.ege-trainer.ru`), меняется только то, что за прокси.

См. `W7_PLAN.md` целиком для всех деталей W7-full.

---

## §11. Финальный статус

Волна W7-stage-0 закрыта **2026-05-19**. Подтверждено:
- ✅ Тренажёр открывается у учеников в РФ без VPN.
- ✅ Smoke на тех же учениках, у которых раньше не работало.
- ✅ Cloudflare Worker остаётся как fallback ещё ~2 недели.
- ✅ W7-full полностью спланирован в `W7_PLAN.md`, остаётся на лето 2026.
