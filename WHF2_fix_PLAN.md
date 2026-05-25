# WHF2-fix-1 — Снос мёртвой проверки email + защита сабмита до готовности страницы

Дата создания: 2026-05-25
Тип волны: **red-zone code-fix** (`tasks/auth.js`)
Триггер: ACCEPT-with-followups по WHF2 research; пункты B и F из `reports/whf2_diagnostic_report.md §7`.
Связанные волны: WHF1 (закрыта), WHF2 (research, закрыта), W7-stage-0 (proxy на свой VPS — задаёт фон обращений на /auth/v1/token).
Возможная follow-up: **WHF2-fix-2** (A/E, на паузе до iOS-репро от оператора; см. `GLOBAL_PLAN.md §6.3`).

---

## §1. Цель

Два независимо-полезных, deterministic-доказанных фикса в `tasks/auth.js`, оба тестируемых без iOS:

- **B.** Убрать `auth_email_exists`-pre-check с критического пути логина. RPC в проде отдаёт `401 permission denied` (`code 42501`) всем (роль `anon` без `EXECUTE`) → `safeEmailExists` ВСЕГДА возвращает `null` за ~1.2 с, шумит в console и является главной подозреваемой поверхностью зависания supabase-js на iOS (см. WHF2 §4 / §6.B).
- **F.** Защитить сабмит форм авторизации (`loginForm`/`signupForm`/`resetForm`) от клика **до** срабатывания `markAuthReady()` (то есть до завершения `await loadDeps()`, который тянет supabase-js с jsdelivr). Без защиты клик «Войти» делает нативный GET-сабмит формы — no-op, «моргнуло и ничего», воспроизведено в WHF2 §3.

После релиза каждый юзер на логине: −~1.2 с (B), −console-шум 401 (B), невозможен silent no-op-сабмит на медленной jsdelivr (F).

## §2. Контекст и мотивация

**Из `reports/whf2_diagnostic_report.md`:**

- §3 (Ключевые тайминги chromium repro):
  ```
  +1.41s POST /rest/v1/rpc/auth_email_exists
  +2.61s 401 permission denied (42501) auth_email_exists (1.20s)  ← safeEmailExists ловит, продолжает
  ```
  Один лишний RPC на каждый submit, всегда 401, всегда +~1.2 с.
- §3 (Первый преждевременный сабмит — воспроизведённый F):
  ```
  В первом прогоне submit был выполнен на +0.95с, до data-auth-ready.
  Результат: #loginStatus="", ни одного запроса к auth_email_exists/token,
  URL получил ?# → это нативный GET-сабмит формы.
  ```
  Точное совпадение с симптомом оператора «нажал Войти — ничего не случилось».
- §6.B: кодбейс УЖЕ документирует тот же класс отказа supabase-js — `app/providers/supabase.js:451-455` (`updatePassword`) специально обходит supabase-js прямым `fetch`-ем именно из-за «200 OK, но промис не резолвится из-за синхронизации сессии в storage». `safeEmailExists` такой защиты не имеет.

Гипотезы A/E из WHF2 не закрываются этим планом — нуждаются в iOS-репро. Если симптом сохранится на iPhone после релиза WHF2-fix-1, оператор предоставит iOS-репро по сценарию WHF2 §3 → откроется отдельная волна WHF2-fix-2.

## §3. Out of scope

- **`app/providers/supabase.js` не правится.** Ни custom storage adapter (A), ни обход supabase-js для `signInWithPassword` (E) — это WHF2-fix-2. В частности, `authEmailExists` export (`app/providers/supabase.js:443-449`) остаётся, становится orphan-ом — это допустимо. Не удалять.
- **`tasks/auth_callback.js`, `tasks/auth_reset.js`** не правятся (другие auth-страницы, не имели F-репро).
- **HTML `tasks/auth.html`** не правится (только JS-логика).
- **SQL: не выдавать `GRANT EXECUTE on auth_email_exists to anon`** «чтобы починить RPC» — это меняет threat model auth-flow (anon мог бы перебирать email'ы) и противоречит цели волны (мы убираем pre-check, а не чиним RPC). Stop-ask на любую попытку правки `docs/supabase/*` в этой волне.
- **Не править `loadDeps`** (например, не перетаскивать импорт supabase-js на статический в HTML «чтобы убрать F-окно по корню») — это самостоятельный архитектурный шаг, не дешевле текущего плана и трогает все auth-страницы.
- **Не править `startAutoRedirectWhenSessionAppears`** (`tasks/auth.js:45-94`) — гипотеза E, отложено.
- **Не править ранний `getSession()`-чек в `DOMContentLoaded`** (`tasks/auth.js:235-241`) — отдельный код-путь, не на критпути сабмита.
- **Google-кнопка (`#googleBtn`)** имеет `type="button"`, нативного сабмита не делает. Защищать её аналогично кнопкам форм можно как nice-to-have в рамках F-фикса (§5.3 опционально), но это **не gate** — если получится в одну строчку рядом, ОК; иначе не делать.

## §4. Затрагиваемые файлы

- **`tasks/auth.js`** — единственный продуктовый файл волны.
  - **B**: `safeEmailExists` (`tasks/auth.js:208-217`) — гут тела до `return null` без сетевого вызова. Зоны использования (трогать НЕ нужно, они корректно обрабатывают `null`): login submit (~`:284`), signup submit (~`:354`), reset submit (~`:428`).
  - **F**: добавить раннюю защиту сабмита в самом начале `DOMContentLoaded` (`tasks/auth.js:219`), синхронно, **до** `await loadDeps()`. Снимать защиту в/после `markAuthReady()` (`tasks/auth.js:139-141` / `:446`) — либо механически в `markAuthReady`, либо естественно через `disabled` атрибут на кнопках (см. §5.2).
- **`tasks/auth.html`** — bump `?v=...` (через `tools/bump_build.mjs`, не вручную).
- Файлы от `node tools/bump_build.mjs`: `app/build.js`, `version.json`, синхронные `?v=` в `app/**` и `tasks/**`.

**Никаких других продуктовых файлов.**

## §5. Пошаговый план

> **Task-tracking (обязательно для исполнителя):** в начале работы создай TaskList через `TaskCreate` с пунктами §5.1–§5.6. По мере выполнения обновляй статусы через `TaskUpdate`: `in_progress` при старте, `completed` при завершении. Это red-zone-волна — оператору особенно важно видеть прогресс по шагам.

### §5.1 Пункт B — гут `safeEmailExists`

В `tasks/auth.js` функция `safeEmailExists` (`:208-217`):

```js
// БЫЛО:
async function safeEmailExists(email) {
  try {
    const res = await authEmailExists(email);
    if (typeof res === 'boolean') return res;
    return null;
  } catch (e) {
    console.warn('authEmailExists check failed:', e);
    return null;
  }
}

// СТАЛО (псевдокод, точная форма на усмотрение исполнителя):
async function safeEmailExists(/* email */) {
  // WHF2-fix-1 (B): RPC `auth_email_exists` отдаёт 401 permission denied (42501)
  // всем (anon без EXECUTE) → pre-check в проде всегда null. До WHF2 этот вызов
  // дёргал supabase-js .rpc() прямо перед signInWithPassword (+~1.2с на каждый
  // логин, console-шум 401, prime hang surface). Гутаем тело без сетевого вызова.
  // См. reports/whf2_diagnostic_report.md §6.B.
  return null;
}
```

Поведение в 3 call-site'ах (`tasks/auth.js:284`, `:354`, `:428`) при `null` уже корректно (показывается обычное сообщение об ошибке от `signInWithPassword`/`signUpWithPassword`/`sendPasswordReset`).

**НЕ трогать**:
- импорт-обёртку `authEmailExists = sbMod?.authEmailExists || (async () => null)` (`tasks/auth.js:38`) — обёртка становится orphan, не вредит.
- `authEmailExists` в `app/providers/supabase.js:443-449` — orphan export, не вредит, удаление этого файла — out of scope §3.

### §5.2 Пункт F — ранняя защита сабмита (синхронно, до `await loadDeps`)

В начале `DOMContentLoaded`-обработчика (`tasks/auth.js:219`), **синхронно перед `try { await loadDeps() ... }`**:

1. Найти `#loginSubmit`, `#signupSubmit`, `#resetSubmit` (опц. `#googleBtn`, см. §5.3).
2. Выставить им `disabled = true`. **Это ключевая защита** — disabled-сабмит-кнопка вообще не отправляет форму нативно.
3. Дополнительно (defense in depth): навесить на `#loginForm`/`#signupForm`/`#resetForm` ранний `submit`-listener-guard, вызывающий `e.preventDefault()`. Это защита от случая, когда кто-то нажмёт `Enter` в поле формы (в некоторых браузерах это триггерит submit даже при disabled-кнопке) или если разметка изменится.
4. В существующем `#loginStatus` (или общий слот) показать короткое нейтральное сообщение «Загрузка...» — чтобы юзер видел, что страница не зависла.

После того, как `await loadDeps()` успешен и далее по флоу — в `markAuthReady()` (`tasks/auth.js:139-141`):
1. Снять `disabled` с `#loginSubmit`/`#signupSubmit`/`#resetSubmit` (и `#googleBtn`, если защищали).
2. Очистить «Загрузка...» в `#loginStatus` (только если статус не был перезаписан другим сообщением — `if (status.textContent === 'Загрузка...') status.textContent = '';`).
3. Снять ранний submit-guard (либо оставить — он безвреден, потому что preventDefault не блокирует другие listener'ы, а реальные `submit`-handler'ы навешиваются ПОСЛЕ него).

Если `loadDeps` упал (`catch` в `tasks/auth.js:222-227`): кнопки **остаются disabled** (юзер не должен пытаться логиниться при сломанном модуле). Текущий код в catch уже ставит сообщение «Ошибка загрузки авторизации. Обновите страницу (Ctrl+F5).» — не трогать.

### §5.3 (опц.) Google-кнопка — то же лечение

`#googleBtn` имеет `type="button"`, нативного сабмита не делает. Но клик до `loadDeps` тоже тихо ничего не делает (handler ещё не привязан). Если в §5.2 готовится массив элементов-кнопок — добавить `#googleBtn` в тот же массив (одна строка). Если получается без переусложнения — ОК, иначе не делать. **Не gate.**

### §5.4 Не трогать остальное в `auth.js`

Особенно не трогать (это всё WHF2-fix-2 или out of scope):
- `startAutoRedirectWhenSessionAppears`
- ранний `getSession()`-чек на `:235-241`
- сами handler'ы submit на login/signup/reset (после `safeEmailExists`-вызова код тот же)
- `loadDeps`-импорты

### §5.5 Bump build

`node tools/bump_build.mjs`. Без этого браузеры подтянут старую `auth.js` из кеша (инвариант `?v=` cache-busting из `CLAUDE.md` + WHF1-precedent).

### §5.6 E2E + регресс + ручной smoke

См. §9.

## §6. Данные / контракты / миграции

Никаких. SQL не правится. `docs/supabase/runtime_rpc_registry.md` не меняется (`auth_email_exists` остаётся зарегистрирован, остаётся orphan callable из supabase.js, но снаружи никто его не дёргает). Backend dev/prod-данные не модифицируются.

## §7. Риски и stop-ask точки

### Это red-zone волна

`tasks/auth.js` — в списке red-zone §6.2 `CURATOR.md`. Применяется усиленный режим:
- scope lock обязателен (см. §3 и §4 — никаких других файлов).
- stop-ask на любую попытку шагнуть в `app/providers/supabase.js`, `app/providers/supabase-rest.js`, `tasks/auth_callback.js`, `tasks/auth_reset.js`, `docs/supabase/*.sql`.
- plan проверки обязан содержать e2e + ручной smoke (см. §9).
- скриншоты ручного smoke обязательны.

### Конкретные риски

1. **B: потеря UX-сигнала «пользователь не найден» перед сабмитом.** В исходной задумке `safeEmailExists` показывал «Пользователь с таким email не найден. Зарегистрируйтесь.» (`tasks/auth.js:285-289`) до того, как идти в `signInWithPassword`. После B этот ранний сигнал пропадает. Но: в проде он и так не работал (RPC 401 → null → ветка не срабатывала). Сейчас юзеру при неверном email показывается обычное «Неверный пароль (или email).» от `signInWithPassword`. UX-деградации НЕТ (только зафиксировали реальность).
2. **F: defense-in-depth submit-guard может конфликтовать с реальными submit-handler'ами.** Не должен — `preventDefault` не блокирует другие listener'ы. Но проверить e2e: успешный логин ПОСЛЕ ready работает как раньше.
3. **F: на медленных устройствах disabled-кнопка может выглядеть как «зависла».** Mitigation — «Загрузка...» в статусе (§5.2.4), плюс типовое время `loadDeps` 0.5–1.5 с (приемлемо).
4. **F: race между `markAuthReady` и реальным submit-handler.** Submit handler регистрируется в DOMContentLoaded **после** `loadDeps` и **до** `markAuthReady` (см. `tasks/auth.js:272 → :446`). Значит когда `markAuthReady` снимает disabled — handler уже зарегистрирован. OK.
5. **Bump build пропущен.** Mitigation — обязательный §5.5.

### Stop-ask точки (проектные дополнения к §6.3)

- Попытка изменить файл вне `tasks/auth.js` + bump-набор — stop-ask.
- Попытка тронуть `app/providers/supabase.js`, `app/providers/supabase-rest.js`, `app/providers/homework.js`, `tasks/auth_callback.js`, `tasks/auth_reset.js` — stop-ask (out of scope §3).
- Попытка тронуть `docs/supabase/*.sql` (в том числе «выдать grant'нуть EXECUTE для anon чтобы починить RPC») — stop-ask (изменение auth threat model).
- Попытка «заодно убрать orphan `authEmailExists` в supabase.js» — stop-ask (scope creep в red-zone-провайдер).
- Попытка «заодно убрать orphan import в `tasks/auth.js:38`» — это пограничный случай. Можно убрать как локальную чистку (всё в `tasks/auth.js`, не expansion), но если возникает unsure — лучше оставить и stop-ask. Безопаснее оставить ради минимальности diff.
- E2E запуск показывает регресс в `ws1-session-link.spec.js` или `whf1-hw-anon-redirect.spec.js` — stop-ask (значит тронули общий auth-механизм неожиданно).
- В проде `auth_email_exists` начал отвечать НЕ 401 (например, оператор тем временем сделал GRANT) — stop-ask: план опирается на «всегда 401»; если RPC заработала, удаление вызова всё равно правильно (B остаётся валидной), но нужно убедиться с оператором, что pre-check-UX действительно не нужен.

> **Режим работы: автономный.** Не останавливайся за подтверждением на каждом шаге, не проси промежуточного ревью между B и F, не делай отдельный merge для каждого. Доведи работу до DoD и верни отчёт (`reports/whf2_fix_1_report.md` + completion summary). Куратор принимает работу целиком.
>
> **Останавливайся (stop-ask) только в следующих экстренных случаях:**
>
> 1. Попытка изменить файл вне §4 «Затрагиваемые файлы».
> 2. Попытка зайти в Out of scope §3 или red-zone §6.2 `CURATOR.md` вне явно разрешённого `tasks/auth.js`.
> 3. План противоречит реальности кода: `safeEmailExists` сместился по строкам и нет в `tasks/auth.js`; `markAuthReady` переписан и больше не центральная точка ready-сигнала; ID кнопок (`#loginSubmit`/`#signupSubmit`/`#resetSubmit`) изменились в `auth.html`; `auth_email_exists` в проде вдруг отдаёт 200.
> 4. DoD объективно недостижим без выхода за scope.
> 5. Governance-скрипт упал (`node tools/check_*.mjs`) и причина не очевидна.
> 6. Уязвимость / утечка креденшлов (в HAR/логах e2e).
> 7. Задача распалась на две независимых.
> 8. Один и тот же тест/сценарий упал 2+ раз подряд после починки, причина неясна.
> 9. Архитектурное решение, повлияющее на модули вне §4 (например, потребовалось бы тронуть `tasks/auth_callback.js`).
> 10. **Проектная специфика WHF2-fix-1:**
>     - (a) e2e показывает, что после B где-то в проде ломается сценарий, который мы не предусмотрели (например, существующий smoke на signup expects pre-check signal) — stop-ask с описанием.
>     - (b) F-guard ломает любую существующую submit-функциональность (signup/reset форм) в e2e — stop-ask.
>     - (c) В проде `auth_email_exists` отдаёт НЕ 401 (200 / другой код) — stop-ask, верификация с оператором перед удалением.
>     - (d) В коде обнаружен другой ранний-сабмит-vector (например, `<button form="...">` в другом месте) — stop-ask с описанием.
>
> **Не экстренные случаи** (работай сам):
> - выбор имени переменной для массива кнопок / handler-функции;
> - порядок: B сначала или F сначала (DoD не страдает);
> - текст сообщения «Загрузка...» (можно «Подождите…», «Готовим вход…» — на твой вкус, главное короткое и нейтральное);
> - чистить или оставить orphan `authEmailExists` import-обёртку в `tasks/auth.js:38` — выбирай минимальный diff;
> - использовать `disabled` атрибут или disabled-class — disabled-атрибут предпочтительнее (нативная защита);
> - порядок шагов §5.5–§5.6.
>
> **Формат stop-ask:** короткое сообщение — какой пункт сработал, что обнаружено, варианты, рекомендация. Жди решения, работу не продолжай.

## §8. Критерии приёмки (DoD)

1. **B confirmed**: в e2e-сценарии логина в Network НЕТ запроса `POST /rest/v1/rpc/auth_email_exists`. Проверка: e2e (§9.2) фиксирует `page.on('request')` filter.
2. **B latency win**: при сравнении того же сценария до/после WHF2-fix-1 в той же среде, login-flow время «клик submit → navigation на next URL» сокращается на ~1–1.3 с (медиана). Не строгий DoD по числу, но качественный — записать наблюдение в отчёт.
3. **F deterministic guard**: ранний клик submit (до `markAuthReady`) НЕ приводит к нативному GET-сабмиту формы — URL не получает `?email=...&password=...&#`. Проверка: e2e (§9.2) симулирует click до ready.
4. **F UX**: кнопки `#loginSubmit`/`#signupSubmit`/`#resetSubmit` имеют `disabled=true` сразу после `DOMContentLoaded`-fire и до `markAuthReady`. После — `disabled=false`.
5. **Регресс zero**: `e2e/student/whf1-hw-anon-redirect.spec.js` и `e2e/student/ws1-session-link.spec.js` остаются зелёными.
6. **Ручной smoke (3 скрина)**: десктоп Chrome incognito —
   (a) cold load → видна «Загрузка...» в `#loginStatus` / кнопка `disabled` (если успеть);
   (b) после ready → можно логиниться, успешный логин редиректит на next;
   (c) полный успешный логин-флоу без `auth_email_exists` в Network (открыть DevTools Network, проверить).
   Скрины в `reports/whf2_fix_1_smoke/`.
7. **`node tools/bump_build.mjs` прогнан**: `meta name="app-build"` в `tasks/auth.html` синхронен с `?v=...` в импортах `tasks/auth.js` и с `version.json`.
8. **Governance зелёные**: `check_runtime_rpc_registry.mjs`, `check_runtime_catalog_reads.mjs`, `check_no_eval.mjs`, `check_trainer_css_layers.mjs` — все exit 0.
9. **`git diff --stat` узкий**: изменения логики только в `tasks/auth.js`, остальное — мехбамп `bump_build.mjs` + новые файлы (e2e spec, отчёт, smoke).
10. **`reports/whf2_fix_1_report.md` создан и заполнен по факту**.
11. **Опциональный stretch (не gate)**: при успешном репро F на десктопе с симуляцией медленной jsdelivr (Playwright `route.continue({ delay: ... })`) — после фикса клик до ready не делает no-op, а получает «Загрузка...» статус. Запись в отчёт.

## §9. План проверки

### §9.1 Governance (до e2e)

```bash
node tools/check_runtime_rpc_registry.mjs
node tools/check_runtime_catalog_reads.mjs
node tools/check_no_eval.mjs
node tools/check_trainer_css_layers.mjs
```

Все exit 0.

### §9.2 E2E новый spec

Создать `e2e/student/whf2-fix-1-auth-guards.spec.js`, минимум 3 теста:

- **B.no-precheck**: открыть `auth.html?next=/`, дождаться ready, заполнить login форму, submit, дождаться navigation. Через `page.on('request')` собрать список URL — **assert: ноль обращений к `/rest/v1/rpc/auth_email_exists`**.
- **F.early-click-noop-guard**: открыть `auth.html?next=/`, **сразу** (до `body[data-auth-ready=1]`) попробовать `page.click('#loginSubmit')` или симулировать `form.submit()`. Assert: (а) URL НЕ получил query-params от формы; (б) `#loginSubmit` имеет `disabled` атрибут; (в) после `body[data-auth-ready=1]` `#loginSubmit` больше не disabled.
- **F.disabled-during-load**: проверить, что в момент сразу после `DOMContentLoaded` (но до `data-auth-ready`) все 3 submit-кнопки (`#loginSubmit`, `#signupSubmit`, `#resetSubmit`) имеют `disabled=true`. После ready — `disabled=false`.

Опциональный 4-й тест (B.latency-observation): измерить медиану на 3 прогонах «клик submit → URL стал `/`» — записать в лог, не assert'ить число (зависит от сети).

### §9.3 Регресс existing e2e

```bash
npm run e2e
# Особое внимание:
#   e2e/student/whf1-hw-anon-redirect.spec.js (A1, A2)
#   e2e/student/ws1-session-link.spec.js (A1, A2, A3)
#   все остальные student/teacher spec'и
```

### §9.4 Ручной smoke (скриншоты в `reports/whf2_fix_1_smoke/`)

Локальный сервер `python3 -m http.server 8000`, **Chrome incognito**, DevTools Network открыт.

1. Открыть `http://localhost:8000/tasks/auth.html?next=/`, **сразу** сделать скрин — кнопка «Войти» disabled, в `#loginStatus` видна «Загрузка...» (если успели до ready). Назвать `1-pre-ready-disabled.png`.
2. После ready — заполнить тестовую учётку, submit, дождаться navigation на `/`. Скрин Network panel **без** запроса `auth_email_exists`. Назвать `2-no-precheck-on-login.png`.
3. (Опционально) сравнение latency: timer на «клик submit → location change» до/после. Запись в `reports/whf2_fix_1_smoke/latency.txt` либо в отчёт §10.

### §9.5 Cache-busting проверка

После `bump_build.mjs`:
```bash
grep app-build tasks/auth.html       # должен быть один build id
head -30 tasks/auth.js               # все ?v= = тому же build id (если они есть)
cat version.json                     # тот же build id
```

### §9.6 Sanity-проверка B на проде (после релиза, оператор)

После push'а — оператор открывает прод `https://ege-trainer.ru/tasks/auth.html`, DevTools Network, делает один логин, **assert глазами**: ни одного `auth_email_exists` в Network, время до редиректа сократилось субъективно. Это не часть DoD исполнителя, но fix считается «закрепившимся» только после этого подтверждения.

## §10. Отчётный артефакт

`reports/whf2_fix_1_report.md`:

1. **Резюме** (2–3 предложения): что закрыто (B + F), на каком билде, текущий коммит. Краткий итог по latency (если измеряли).
2. **DoD trace** — каждый пункт §8 с доказательством (`git diff` snippet, e2e log line, скриншот path, Network observation).
3. **Diff stats** — `git diff --stat` (узкий: `tasks/auth.js`, `tasks/auth.html`, bump-набор; новые: e2e spec, smoke-папка, отчёт).
4. **Логический diff `tasks/auth.js`** — два блока: B (гут `safeEmailExists`) и F (ранние disabled + guard + cleanup в `markAuthReady`).
5. **E2E прогон** — лог нового spec WHF2-fix-1 + `whf1-*.spec.js` + `ws1-*.spec.js` (proof of no regression).
6. **Скриншоты ручного smoke** (2–3 шт, §9.4) с путями.
7. **Latency observation** (опц.) — медианные числа до/после, если успели измерить.
8. **Открытые follow-up**:
   - **WHF2-fix-2** на паузе. Перенос в активные ТОЛЬКО если оператор после релиза получит iOS-репро (iPhone Safari private + Telegram in-app WebView, через Mac Web Inspector, по сценарию `reports/whf2_diagnostic_report.md §3`) И симптом сохранится. Иначе WHF2-fix-2 закрывается как ✅ unnecessary.
   - (опц.) **WHF2-cleanup** — мелкая гигиена: удалить orphan `authEmailExists` из `app/providers/supabase.js` и orphan import в `tasks/auth.js:38`, обновить `runtime_rpc_registry.md` (или зарегистрировать exception). Не red-zone после WHF2-fix-1 (никто не пользуется). Открывать по запросу, не сейчас.
