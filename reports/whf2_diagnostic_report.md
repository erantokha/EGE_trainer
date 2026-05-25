# WHF2 — Диагностика «Войти бесконечно входит» из ДЗ-ссылки — отчёт

Дата: 2026-05-25 · Тип: research-only (продуктовый код не правился) · Связано: WHF1, WS.1, W7-stage-0

> ⚠️ **Этот research выполнен в автоматизированной среде (Claude Code на macOS).** Доступны
> были: desktop Chromium + desktop WebKit (Playwright), curl к production, чтение кода. **Физический
> iPhone, iOS Safari и Telegram WebView недоступны** — а именно эти среды дают симптом. Поэтому
> подтверждение гипотез A/B/E на устройстве осталось за оператором (см. §9 Open questions и
> финальный stop-ask). То, что можно было установить без устройства — установлено и доказано
> артефактами.

---

## 1. Резюме

Симптом «нажал Войти из ДЗ-ссылки → вход не завершается» **не воспроизводится ни в desktop
Chromium, ни в desktop WebKit** (оба доводят логин до конца за 3.5–5.4 с) — что подтверждает:
баг **специфичен для iOS-сред** (Safari ITP / private, Telegram in-app WebView), где сломан/недоступен
storage-lock и localStorage supabase-js.

Гипотезы **C (нестабильность `api.ege-trainer.ru`)** и **D (cache-check reload loop)** —
**опровергнуты** (артефакты §5, §6). Гипотезы **A / B / E** остаются структурно живыми, но
**не подтверждены repro на десктопе** (среды-носители недоступны). Среди них **B — самая
подкреплённая кодом**: и по структуре (`safeEmailExists` без timeout на критическом пути логина),
и потому что **сам кодбейс уже документирует ровно этот класс отказа** (см. `supabase.js:451-455`,
`updatePassword` обходит supabase-js直 fetch'ем именно из-за «200 OK, но промис не резолвится из-за
синхронизации сессии в storage»).

Дополнительно найден **новый, единственный воспроизведённый на десктопе механизм F**: до завершения
`loadDeps()` (динамический `import` supabase-js **с jsdelivr**) форма логина не имеет JS-обработчика
и не задизейблена → клик «Войти» делает **нативный GET-сабмит формы = тихий no-op**. На медленном/
блокируемом jsdelivr (РФ, мобильный) окно этого бага велико.

И ещё одна находка-усилитель: RPC `auth_email_exists` **возвращает `401 permission denied (42501)`
всем** (роль anon не имеет EXECUTE). То есть `safeEmailExists` в проде **всегда** возвращает null —
это мёртвый pre-check, который добавляет ~1.2 с к каждому логину, шумит в console и при этом является
**главной поверхностью зависания B** (лишний supabase-js `.rpc()` через auth-клиент прямо перед логином,
без timeout).

**Рекомендация (детали §7):** WHF2-fix лидирует пунктом **B** — убрать/обернуть в timeout
`safeEmailExists` (строго полезно даже при неопределённости: убирает бесполезный 401-вызов И снимает
prime-suspect зависания), плюс закрыть **F** (дизейблить сабмит/показывать «загрузка…» до
`data-auth-ready`). Фикс под **A/E** (storage-adapter / polling сессии) рекомендуется **только после**
подтверждения на реальном iOS-устройстве, т.к. это red-zone `app/providers/supabase.js`.

---

## 2. Среды воспроизведения

| # | Устройство / OS | Browser / engine | Сеть | Дата | Repro симптома |
|---|---|---|---|---|---|
| 1 | macOS (этот хост) | **Chromium** (Playwright 1.59) | домашний WiFi | 2026-05-25 | **NO** — логин завершается ~5.4с |
| 2 | macOS (этот хост) | **WebKit** (Playwright, Safari engine) | домашний WiFi | 2026-05-25 | **NO** — логин завершается ~3.5с |
| 3 | iPhone Safari (private) | — | — | — | **НЕДОСТУПНО** (нет физ. устройства) |
| 4 | iPhone Telegram WebView | — | — | — | **НЕДОСТУПНО** (нет физ. устройства + Mac Web Inspector к телефону) |

> DoD §8.1 требует 3 среды. Доступны 2 движка (Chromium, WebKit) — оба десктопные и **не являются
> носителями симптома**. iOS-среды (3, 4) технически недоступны в этой исполнительной среде —
> зафиксировано здесь и эскалировано оператору (stop-ask trigger 10c). Косвенная проверка через
> desktop WebKit (Safari engine) выполнена, но desktop WebKit ≠ iOS Safari ITP и ≠ Telegram WebView
> (другая модель storage/lock), поэтому даёт лишь слабый сигнал «на нормальном Safari-движке логин
> работает».

---

## 3. Baseline сценарий

В каждом прогоне (`reports/whf2_artifacts/repro.cjs`):

1. Свежий anon-контекст (пустой storageState), запись HAR.
2. `goto https://ege-trainer.ru/tasks/auth.html?next=<encoded hw.html?token=…>` (repro) либо
   `…?next=/` (control).
3. Дождаться `#loginForm`, затем **`body[data-auth-ready="1"]`** (важно — см. §6.F), снять snapshot
   localStorage.
4. Ввести `E2E_STUDENT_EMAIL` / `E2E_STUDENT_PASSWORD` (тестовая e2e-учётка, не реальный ученик),
   кликнуть submit.
5. 35 с наблюдения: URL, `#loginStatus`, localStorage на чекпоинтах 3/8/15/25/34 с, сеть по
   подозреваемым эндпоинтам.

Скриншоты финального состояния: `desktop_chromium_repro.png`, `desktop_chromium_control.png`,
`desktop_webkit_repro.png` (все — успешный редирект на целевую страницу).

### Ключевые тайминги (chromium repro, `desktop_chromium_repro.log.txt`)

```
+1.24s  data-auth-ready=true (loadDeps вкл. jsdelivr ~0.61s)
+1.35s  submit login
+1.41s  POST /rest/v1/rpc/auth_email_exists
+2.61s  401 permission denied (42501) auth_email_exists (1.20s)  ← safeEmailExists ловит, продолжает
+2.61s  POST /auth/v1/token?grant_type=password
+4.84s  200 /auth/v1/token (2.23s)
+5.42s  NAV → /tasks/hw.html?token=…  (LOGIN COMPLETED)
```

### Первый (преждевременный) сабмит — **воспроизведённый F**

В первом прогоне submit был выполнен на **+0.95с**, до `data-auth-ready`. Результат:
`#loginStatus=""` (даже не «Входим…»), **ни одного** запроса к `auth_email_exists`/`token`,
URL получил `?#` → это **нативный GET-сабмит формы** (обработчик ещё не навешан). Страница
«моргнула» и ничего не произошло — точное совпадение с симптомом «нажал Войти, ничего не случилось».

---

## 4. Сводная таблица гипотез (§5.5)

| Гипотеза | Среда repro | Симптомное свидетельство | Опровергающее свидетельство | Статус |
|---|---|---|---|---|
| **A.** Telegram WebView без localStorage | iPhone Telegram (нет) | — (не проверено на устройстве) | в Chromium/WebKit localStorage работает, сессия пишется, редирект проходит | **НЕ ПРОВЕРЕНА** (среда недоступна); структурно жива |
| **B.** `safeEmailExists` hang | любая (носитель — iOS) | `safeEmailExists` (`auth.js:284`) **без timeout** на критпути; кодбейс документирует тот же отказ supabase-js (`supabase.js:451-455`); RPC всегда 401 → лишний хрупкий `.rpc()` перед логином | в Chromium/WebKit RPC резолвится за 1.2–1.3с (с 401) — на десктопе не висит | **НЕ ПОДТВЕРЖДЕНА repro, но СИЛЬНО подкреплена кодом**; носитель — iOS |
| **C.** `api.ege-trainer.ru` нестабильность | — | — | 30/30 `__proxy_health`=200, p50 0.21с/p95 0.23с; wrong-pw → 400 за 0.93с; signIn 200 за 0.9–2.2с; нет 5xx/timeout | **ОПРОВЕРГНУТА** (с этой сети; caveat: не из РФ-ISP/мобильной) |
| **D.** cache-check reload loop | — | — | блок отрабатывает на **load**, не на submit; reload только при **mismatch** build; version.json совпал → `__cacheCheckAttempts` снят, reload'ов нет; есть и на `/` (рабочий control) | **ОПРОВЕРГНУТА** (механизм + наблюдение) |
| **E.** signIn persistence race | iPhone Safari/WebView (нет) | — (не проверено на устройстве) | в Chromium/WebKit `sb-*-auth-token` появляется, редирект на next проходит — гонки нет | **НЕ ПРОВЕРЕНА** (среда недоступна); структурно жива на ITP/WebView |
| **F.** (новая) Pre-readiness нативный сабмит формы | **Chromium (воспроизведено)** | до `data-auth-ready` форма без JS-обработчика и без disabled → клик = нативный GET, no-op; зависит от латентности `import` supabase-js с **jsdelivr** | если jsdelivr быстр (десктоп) — окно мало, человек не успевает | **ВОСПРОИЗВЕДЕНА** (единственная на десктопе); условие — медленный/блокируемый jsdelivr |

> Статус DoD §8.4: ни одна из A–E **не подтверждена repro-артефактом** (носители недоступны), C/D
> опровергнуты, B сильно подкреплена кодом, и появилась воспроизведённая F. Это явно соответствует
> валидному исходу плана: «ни одна A–E не подтверждается repro, гипотеза F: …» → **stop-ask trigger 10b**
> (см. финал отчёта).

---

## 5. Стабильность `api.ege-trainer.ru` (§5.4)

Артефакты: `proxy_health_run.txt`, `auth_endpoint_probes.txt`.

- **`__proxy_health` ×30**: **30/30 = 100% http=200**. latency **p50 0.207с, p95 0.234с,
  min 0.200с, max 0.286с**. Ни одного timeout/5xx.
- **`POST /auth/v1/token` (заведомо неверный пароль)**: **400 `invalid_credentials` за 0.93с** —
  быстрый и корректный.
- **`POST /rest/v1/rpc/auth_email_exists` ×5** (server-side, изолирует серверную часть от
  client-lock): **401 за 0.62–1.01с** каждый (anon не имеет EXECUTE — см. §6.B).

**Вывод:** сервер/proxy быстры и здоровы с этой сети. Любое зависание в проде — **client-side**
(storage-lock supabase-js), не сеть/сервер. → **C опровергнута** с этого vantage. Caveat: замер
не из РФ-ISP и не с мобильной сети, где W7-stage-0 теоретически может деградировать; для полного
закрытия C нужен curl-замер с реальной проблемной сети (оператор).

---

## 6. Detailed findings

### B (lead по коду) — `safeEmailExists` + мёртвый 401-RPC

- `tasks/auth.js:272-307` (submit логина): `setStatus('Входим...')` → **`await safeEmailExists(email)`**
  (строка 284, блокирующий, **без timeout**) → `await signInWithPassword(...)` → `location.replace(next)`.
- `tasks/auth.js:208-217` (`safeEmailExists`): try/catch ловит **throw**, но **не зависание** —
  если промис не резолвится, UI навсегда застревает на «Входим…», **console пуст** (warning из catch
  не сработает). Это в точности описанный оператором симптом.
- `app/providers/supabase.js:443-449` (`authEmailExists`): идёт через `supabase.rpc(...)` — тот же
  supabase-js-клиент, что и `signInWithPassword`. **Сам кодбейс уже знает про класс отказа**:
  `updatePassword` (`supabase.js:451-455`) специально обходит supabase-js прямым `fetch`'ем с
  комментарием: *«На практике 200 OK, но промис supabase.auth.updateUser() может не резолвиться
  вовремя из-за синхронизации сессии в storage»*. `authEmailExists` и `signInWithPassword` такой
  защиты **не имеют**.
- **Наблюдение из repro**: `auth_email_exists` отдаёт **`401 permission denied (code 42501)`**
  любому (роль anon без EXECUTE). Значит `safeEmailExists` в проде **всегда** → null: бесполезный
  pre-check, +~1.2с к каждому логину, console-шум, и при этом — лишний хрупкий `.rpc()` через
  auth-клиент прямо перед логином (prime hang surface B).

### C — опровергнута (см. §5).

### D — опровергнута

`tools/inject_cache_check.mjs`: инлайн-блок в `<head>` отрабатывает **на load**, не на submit;
`location.reload()` только при `j.build !== localBuild`; loop-guard `__cacheCheckAttempts` (max 2);
инжектится во **все** prod-страницы, включая `index.html` (рабочий control). В repro `version.json`
совпал с meta → ключ снят, reload'ов не было. Механизм не совпадает с симптомом «submit висит».

### E — не проверена (носитель — iOS ITP/WebView)

`auth.js:293-294`: `await signInWithPassword(...)` → сразу `location.replace(next)`, без ожидания
появления сессии в storage. На ITP/WebView (асинхронная/блокируемая запись localStorage) новая
страница `hw.html` может загрузиться без сессии → WHF1-гейт (`getSession()→null`) → редирект назад
на `auth.html` → визуально «вход не сработал». В Chromium/WebKit гонки нет (сессия пишется
синхронно, редирект проходит).

### A — не проверена (носитель — Telegram iOS WebView)

`supabase.js:21-32`: клиент создаётся с `persistSession: true, flowType: 'pkce'` и **дефолтным
storage (localStorage)** — кастомного адаптера нет. В Telegram iOS WebView localStorage может быть
ограничен/бросать → сессия не персистится → следующий `getSession()` (`supabase.js:154`,
`supabase.auth.getSession()`) вернёт null. Симптом как у E.

### F — воспроизведена (pre-readiness нативный сабмит)

См. §3. Обработчик submit (`auth.js:272`) и `data-auth-ready` (`auth.js:446`) навешиваются только
**после** `await loadDeps()` (`auth.js:221`), а `loadDeps` делает `import` supabase-js **с jsdelivr**.
До этого форма без обработчика и **без disabled-состояния** → клик «Войти» = нативный GET-сабмит
(no-op, «моргание»). На медленном/блокируемом jsdelivr (РФ/мобильный) окно велико. Воспроизведено
напрямую (первый прогон). jsdelivr с этой сети быстр (~0.6с), поэтому условие здесь не «выстрелило»
при нормальном ожидании, но на проблемной сети это реальный no-op-баг.

---

## 7. Рекомендация по WHF2-fix

Лид-рекомендация (делается даже при неопределённости по A/B/E, т.к. строго полезна):

| Приоритет | Что | Целевой файл | Объём | Red-zone | Ориентир DoD |
|---|---|---|---|---|---|
| **1 (B)** | Убрать `safeEmailExists` из критпути логина **или** обернуть в `Promise.race` с timeout ~2.5с (при timeout/ошибке → null, сразу `signInWithPassword`). Учесть: RPC всё равно всегда 401 → проще удалить вызов целиком | `tasks/auth.js:284` (+`208-217`) | 5–15 строк | **ДА** (auth-flow) | e2e на логин без pre-check; ручной iOS smoke |
| **2 (F)** | До `data-auth-ready`: задизейблить кнопку «Войти» / показать «Загрузка…», либо навесить «голый» preventDefault-обработчик сразу (до `loadDeps`), чтобы клик не делал нативный сабмит | `tasks/auth.js` (DOMContentLoaded, до `await loadDeps`) | 10–20 строк | **ДА** (auth-flow) | e2e: ранний клик не делает нативный сабмит |
| 3 (E, **после** iOS-репро) | Перед `location.replace(next)` дождаться `getSession()` (с timeout) **или** `onAuthStateChange('SIGNED_IN')` | `tasks/auth.js:293-294` | 20–30 строк | **ДА** | iOS smoke обязателен |
| 4 (A, **после** iOS-репро) | Custom storage adapter для supabase client: `localStorage → cookie → sessionStorage → in-memory` fallback | `app/providers/supabase.js:21-32` | 50–100 строк | **ДА** (auth-core) | iOS Telegram smoke вручную (e2e не покрывает) |
| — (C) | Не код-волна. Если симптом подтвердится с РФ-сети при стабильном `__proxy_health` отсюда — эскалация в W7 (failover на `workers.dev`, тюнинг nginx) | — | — | — | infra |

> **Все четыре код-пункта — red-zone `tasks/auth.js` / `app/providers/supabase.js`.** Поэтому WHF2-fix
> требует отдельного `WHF2_fix_PLAN.md` с расширенными stop-ask и **обязательным browser smoke на
> реальном iPhone Telegram** (план §«Что после WHF2»). Пункты 1–2 можно делать без iOS-репро (они
> строго полезны и проверяемы e2e/десктопом); пункты 3–4 — только после подтверждения A/E на устройстве.

---

## 8. Что не подтвердилось (чтобы не возвращаться без нового сигнала)

- **C** — `api.ege-trainer.ru` стабилен и быстр с этой сети (100% 200, p95 0.23с, fast 400/200 на auth).
  Возвращаться только при доказательстве деградации с конкретной РФ/мобильной сети.
- **D** — cache-check не может давать «submit висит»: отрабатывает на load, только при mismatch,
  loop-guarded, есть и на рабочем `/`.

## 9. Open questions

1. **iOS-репро не выполнено** (нет физ. устройства/Mac Web Inspector к телефону в этой среде).
   A/B/E подтверждаются/опровергаются только там. Нужен оператор с iPhone (Safari private + Telegram
   in-app) + Mac Web Inspector, по сценарию §3 этого отчёта.
2. **Точная сигнатура на iOS**: при репро критично снять — (а) появляется ли в Network запрос
   `auth_email_exists` вообще (если нет — промис висит на storage-lock ДО fetch → B); (б) пуста ли
   console (нет 401-warning → B); (в) есть ли `sb-*-auth-token` в localStorage через 5/15/30с после
   200 на `/token` (нет → A/E).
3. **C из РФ**: `__proxy_health` ×30 + одиночные fetch до auth с реальной проблемной сети — чтобы
   закрыть C окончательно (отсюда стабильно).

## 10. Артефакты (`reports/whf2_artifacts/`)

| Файл | Что |
|---|---|
| `proxy_health_run.txt` | 30× `__proxy_health`: 30/30 200, p50/p95/min/max |
| `auth_endpoint_probes.txt` | wrong-pw 400 (0.93с) + `auth_email_exists` ×5 (401, 0.6–1.0с) |
| `desktop_chromium_repro.{har,log.txt,png}` | Chromium, сценарий из ДЗ-ссылки → логин завершён ~5.4с |
| `desktop_chromium_control.{har,log.txt,png}` | Chromium, control (next=/) → логин завершён ~5с |
| `desktop_webkit_repro.{har,log.txt,png}` | WebKit (Safari engine) → логин завершён ~3.5с |
| `repro.cjs` | Playwright-харнесс repro (engine/mode параметры) |
| `sanitize.cjs` | Санитайзер HAR/логов (§9.4) |

**Sanitization (DoD §8.6):** все HAR/логи прогнаны `sanitize.cjs`: 0 остаточных JWT, нет
plaintext-пароля, нет access/refresh-token, нет non-`@example.com` email; Authorization/apikey/cookie
заголовки → `***REDACTED***`; base64-тела (jsdelivr JS) проверены — 0 декодированных JWT.

**Git (DoD §8.7):** WHF2 **не изменил ни одного tracked-файла** — все выходы WHF2 в untracked
`reports/whf2_artifacts/` + этот отчёт. (Существующий tracked-diff в рабочем дереве — это **WHF1**
ещё-не-закоммиченные правки + операторские правки `GLOBAL_PLAN.md`/`PROJECT_STATUS.md`/`WHF2_PLAN.md`,
вне scope WHF2.) Governance (`check_runtime_rpc_registry`, `check_runtime_catalog_reads`,
`check_no_eval`, `check_trainer_css_layers`) — все зелёные.

> ⚠️ Размер HAR: ~1.0–3.5 МБ каждый (embed-контент, включая jsdelivr JS). Перед коммитом куратору
> решить — коммитить ли HAR'ы целиком или хранить вне git / урезать тела.
