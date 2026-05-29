# WTC7 — Корневой фикс: ключ сессии не выводится для proxy-URL

**Дата:** 2026-05-29
**Ветка:** `wtc7-session-key`
**Worktree:** `/Users/anton/Projects/EGE_trainer/.claude/worktrees/agent-a173b0a8d558ef58f`
**Build-id:** `2026-05-29-9` → `2026-05-29-10`
**Зона:** RED-ZONE (auth-ядро), узкий scope — только слой ЧТЕНИЯ ключа.

---

## 1. Корень (подтверждён)

`__getAuthStorageKey()` (`app/providers/supabase.js`) и `supabaseRefFromUrl()`
(`tasks/picker_common.js`) выводили storage-key сессии Supabase ТОЛЬКО из
паттерна `*.supabase.co` (регэксп `/https?:\/\/([a-z0-9-]+)\.supabase\.co/i`).

После VPS-миграции `CONFIG.supabase.url = https://api.ege-trainer.ru` (proxy).
Регэксп не матчил → `__getAuthStorageKey()` → `null`, `supabaseRefFromUrl()` → `''`.
Кастомный session-слой (`__readStoredSession` / `peekStoredSession` /
`hasStoredSession` + `readSessionFallback` в picker.js) становился слеп, ХОТЯ
живая сессия лежит в localStorage под ключом `sb-api-auth-token` (supabase-js
выводит ключ как `sb-${new URL(url).hostname.split('.')[0]}-auth-token`).

**Эталон уже был в репо:** `app/providers/supabase.js` (logout-wipe, ~стр.509)
уже использует правильный шаблон `new URL(host).hostname.split('.')[0]`.
Фикс = привести две багованные функции к этому же шаблону.

---

## 2. Аудит (read-only) — результаты

`grep -rn` по `app/` и `tasks/` на `\.supabase\.co`, `sb-\${`, `auth-token`.

| Место | Что | Вердикт |
|---|---|---|
| `app/providers/supabase.js:67` `__getAuthStorageKey()` | деривация ключа из `.supabase.co`-регэкспа | **БАГ → пофикшено (Target 1)** |
| `tasks/picker_common.js:187` `supabaseRefFromUrl()` | деривация ref из `.supabase.co`-регэкспа | **БАГ → пофикшено (Target 2)** |
| `app/providers/supabase.js:~509` logout-wipe | `new URL(host).hostname.split('.')[0]` | КОРРЕКТНЫЙ эталон — не трогали |
| `tasks/picker.js:1012` `readSessionFallback()` | `sb-${ref}-auth-token`, где `ref = supabaseRefFromUrl(...)` | downstream-консьюмер Target 2 — чинится автоматически, прямой правки не требует |
| `tasks/home_router.js:278` | `Object.keys(localStorage).filter(k => k.endsWith('-auth-token'))` | уже proxy-safe (diag-only), не трогали |
| `app/diag_bootstrap.js:101` `isSupabaseUrl()` | классификация URL (НЕ деривация ключа), уже знает `api.ege-trainer.ru` | вне scope, не трогали |
| `app/config.js:8`, `*.html` CSP | строки/комментарии/CSP-allowlist | не деривация ключа |

**Итог:** багованных мест ровно ДВА (как в постановке) + один корректный эталон.
Других слепых деривация ключа из `.supabase.co` НЕ найдено. Stop-ask не потребовался.

---

## 3. Что изменено (до/после)

### Target 1 — `app/providers/supabase.js:67-76` `__getAuthStorageKey()`

ДО:
```js
const url = String(CONFIG?.supabase?.url || '').trim();
const m = url.match(/https?:\/\/([a-z0-9-]+)\.supabase\.co/i);
const ref = m ? m[1] : null;
return ref ? `sb-${ref}-auth-token` : null;
```
ПОСЛЕ:
```js
const url = String(CONFIG?.supabase?.url || '').trim();
if (!url) return null;
const ref = new URL(url).hostname.split('.')[0] || '';
return ref ? `sb-${ref}-auth-token` : null;
```

### Target 2 — `tasks/picker_common.js:187-195` `supabaseRefFromUrl()`

ДО:
```js
const u = String(url || '').trim();
const m = u.match(/^https?:\/\/([a-z0-9-]+)\.supabase\.co\b/i);
return m ? m[1] : '';
```
ПОСЛЕ:
```js
try {
  const u = String(url || '').trim();
  if (!u) return '';
  return new URL(u).hostname.split('.')[0] || '';
} catch (_) {
  return '';
}
```

Сигнатуры/имена сохранены, вызывающие не тронуты.

### Поведение деривации (после фикса)

| URL | `__getAuthStorageKey()` | `supabaseRefFromUrl()` |
|---|---|---|
| `https://api.ege-trainer.ru` | `sb-api-auth-token` | `api` |
| `https://knhozdhvjhcovyjbjfji.supabase.co` | `sb-knhozdhvjhcovyjbjfji-auth-token` | `knhozdhvjhcovyjbjfji` |
| `https://ege-supabase-proxy.erantokha.workers.dev` | `sb-ege-supabase-proxy-auth-token` | `ege-supabase-proxy` |
| `` / мусор | `null` | `''` |

Для `.supabase.co` поведение **идентично прежнему** (`hostname.split('.')[0]`
== первый сегмент == прежний `m[1]`).

---

## 4. OUT OF SCOPE — соблюдено

- `storageKey` в `createClient` НЕ пинился (вариант B → разлогин). Тронут ТОЛЬКО слой
  чтения. → **без разлогина**.
- Прочее auth-ядро (refresh, таймауты, `onAuthStateChange`, createClient-конфиг),
  `config.js` (логика), backend/SQL/RPC — НЕ трогали.
- Орфан-ключи НЕ чистились.

---

## 5. Регресс-тест

Создан `e2e/teacher/wtc7-session-key.spec.js` (project `teacher`, storageState).
На залогиненной teacher-странице (`/home_teacher.html`) динамически импортирует
`app/providers/supabase.js` ТОЧНО как `loadProviders()` в `home_router.js`
(build-id из `<meta name="app-build">`, путь с `?v=`, `rel = inTasks ? '../' : './'`),
вызывает `hasStoredSession()` / `peekStoredSession()`.

Логика: ДО фикса вернулось бы `false` (ключ = `null`), ПОСЛЕ — `true`.
БЕЗОПАСНОСТЬ: токены НЕ логируются и НЕ возвращаются из `page.evaluate` — только
имена ключей, booleans и `expires_at` (число).

---

## 6. Проверки — что прогнано

**Governance (все GREEN):**
- `node tools/check_runtime_rpc_registry.mjs` → ok (rows=32, missing=0)
- `node tools/check_no_eval.mjs` → ok
- `node tools/check_runtime_catalog_reads.mjs` → ok
- `node tools/check_build.mjs` → ok (build=2026-05-29-10, v=…, content.version=… — синхронны)

**e2e (прогнаны против реального proxy-бэкенда `api.ege-trainer.ru`, GREEN):**
> Worktree не имел своего `node_modules`/`.env.local`. Для прогона временно:
> скопирован `.env.local` из основного checkout + symlink на `node_modules` основного
> checkout. После прогона оба временных артефакта удалены (в коммит НЕ попали).

- `setup-teacher` (auth.teacher.setup) → ✓ (логин против реального бэкенда → storageState)
- `e2e/teacher/wtc7-session-key.spec.js` → ✓ PASS
  Диаг (без токенов): `supabaseUrl=https://api.ege-trainer.ru`,
  `expectedKey=sb-api-auth-token`, `authTokenKeys=["sb-api-auth-token"]`,
  `expectedKeyPresent=true`, `hasStoredSession=true`, `peekHasAccessToken=true`,
  `storedExpiresAt=<число>`.
- `e2e/teacher/picker-stats-charnet.spec.js` → ✓ (golden snapshot matched, без регресса)
- `e2e/student/picker-stats-charnet.spec.js` → ✓ (golden snapshot matched, без регресса)

Разлогина в ходе прогона не было — сессии оставались живыми.

**Что НЕ прогнано:** полный `npm run e2e` (вся сетка) — прогнаны только релевантные
специи (новая WTC7 + обе charnet). Достаточно для покрытия фикса и регресса по
session/stats-контуру.

---

## 7. git diff --stat

74 файла изменено (механический bump `?v=` по всему репо через `bump_build.mjs`
+ две функции) + 1 новый файл (спека). Не-`?v=` логические изменения ровно в двух
файлах: `app/providers/supabase.js` (одна функция) и `tasks/picker_common.js`
(одна функция). `app/config.js` содержит дополнительно bump `content.version`
(часть механики `bump_build`, верифицировано `check_build.mjs`). Новые файлы:
`e2e/teacher/wtc7-session-key.spec.js`, `reports/wtc7_session_storage_key_report.md`.

---

## 8. DoD

| # | Критерий | Статус |
|---|---|---|
| 1 | `__getAuthStorageKey()` → `sb-api-auth-token` (proxy) / `sb-<ref>-auth-token` (`.supabase.co`); больше ничего в supabase.js | ✅ |
| 2 | `supabaseRefFromUrl()` → `api` (proxy) / прежнее для `.supabase.co` | ✅ |
| 3 | Регресс-спека написана и прогнана (инфра доступна) | ✅ |
| 4 | createClient/storageKey НЕ менялись → без разлогина | ✅ |
| 5 | governance GREEN; bump_build прогнан; diff чистый (2 функции + `?v=` + новые файлы) | ✅ |
| 6 | Отчёт создан | ✅ (этот файл) |
| 7 | Коммит на ветке `wtc7-session-key` | ✅ (см. финальный рапорт) |

**Stop-ask:** не потребовался. Реальность совпала с постановкой (эталон стр.509
подтверждает `hostname.split('.')[0]`; supabase-js хранит живую сессию под
`sb-api-auth-token`).
