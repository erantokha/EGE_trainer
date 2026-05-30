# WP2 · Фикс «Выбрать всё» при наложении: K× global_all (A) + инкрементальный предпросмотр (C) — отчёт

Дата: 2026-05-30
План: `WP2_section_resolve_path_fix_PLAN.md` (разведка: `reports/queue_overlap_recon_report.md`)
Режим: автономный. Код + замеры + отчёт до DoD. **Деплой (FE push) — куратор.**
Тип: **FE-only** (`tasks/picker.js`). Не red-zone, без SQL/RPC.
Worktree: `.claude/worktrees/wp2-section-resolve-fix`, ветка **`worktree-wp2-section-resolve-fix`** (от HEAD `4c2a7fee`, с WP1).
Build-id: **`2026-05-30-7`**.

---

## 1. Итог

Тесное наложение кликов «Выбрать всё» (≤300 мс, коалесятся в один синк с `delta=K≥2`) больше **не уходит
в обречённый 12-секционный `resolve_batch` complete** (statement_timeout → HTTP 500 → 12-серийный фоллбэк
≈ 25 с). Для uniform-случая (все секции, одинаковая delta K) идёт **K× `global_all`** — быстрый путь без 500.
Открытая модалка-предпросмотр **наполняется инкрементально** по мере добора.

## 2. Замеры до/после (Playwright, Анна Алданькова, 2 клика @120мс → uniform K=2)

| Метрика | BEFORE (HEAD `4c2a7fee`) | AFTER (WP2) |
|---|---|---|
| **путь resolve** | `resolve_batch[section×12]` → **500** + 12× `screen_v2:section` | **2× `screen_v2:global_all`** |
| вызовов RPC | **13** | **2** |
| HTTP 5xx | **да** (`resolve_batch=500` за 8747 мс — `57014 statement timeout`) | **нет** |
| wall-time (последний клик → networkidle) | **25.2 с** | **9.4 с** (~2.7×) |
| добор задач | 24 | **24** (2×12, эквивалентно) |

Сырые resolve-вызовы:
- **BEFORE:** `resolve_batch:batch[section×12]=500(8747ms)`, далее `screen_v2:section=200` ×12 (0.8–2.3 с каждый) — серийный фоллбэк.
- **AFTER:** `screen_v2:global_all=200(4317ms)`, `screen_v2:global_all=200(4255ms)` — два раунда, оба 200.

DoD §8.1 выполнен: **ноль 500, ноль 12-серийного фоллбэка, идёт K× global_all; ~27 с → ~9 с.**

## 3. Что изменено (`file:line`, только `tasks/picker.js`)

В `syncAddedTasksToSelection`, section-блок `if (sid)`:
- **(A)** Бывшая ветка `canUseGlobalAll` (один `global_all` только при delta=1) **заменена** унифицированным циклом
  `uniformK` (`:3858`): если ВСЕ секции (`size === SECTIONS.length`) имеют ОДИНАКОВУЮ delta `K`, то **K раундов**
  `pickQuestionsViaTeacherScreenResolve({ scope_kind:'global_all', n:1 })` (`:3864-3890`), каждый раунд со **свежим
  `getExcludeSet()`** (растёт через `append→incIdCount` → раунды дают РАЗНЫЕ задачи), `seq`-abort внутри цикла,
  затем `remaining.clear()` (`:3890`) — section-batch (500-prone) для uniform **не вызывается**.
  Покрывает K=1 (бывшее одиночное поведение) и K≥2 (фикс).
- **(C)** После каждого раунда — инкрементальный перерендер открытой модалки (`:3881-3888`): `if (ADDED_TASKS_MODAL_OPEN) refreshAddedTasksModalView(...)` → предпросмотр наполняется по мере добора, а не рывком в конце синка.
- **Non-uniform путь не тронут:** блок `if (remaining.size > 0)` (section-batch + фоллбэк) сохранён — для редкого ручного микса разных delta (см. §5).
- WP1-контроллер (in-flight-гард, debounce 300 мс), proto/topic-добор, non-sid (анон) ветка, `excludeSet2` — **не тронуты**.

`git diff --stat tasks/picker.js`: +50/−30 (логика) + bump `?v=` по файлам.

## 4. Эквивалентность подбора (DoD §2/§7)

- Count/scope сохранены: BEFORE и AFTER добавили **24** задачи (2 на каждую из 12 секций).
- Уже добавленные задачи сохраняются (incremental-дельта `need−have`, растущий exclude между раундами).
- **Конкретные `question_id` отличаются** от section-batch (even-distribution раскладывает иначе, чем K× global_all с растущим exclude) — **допустимо** по §7: count/distinct/scope/фильтр верны, resolve детерминирован по сиду.
- charnet **4/4 зелёные** (added-tasks вне stats-fingerprint → id-сдвиг не задел; перебаза не нужна).

## 5. Покрытие non-uniform

Non-uniform случай (секции с РАЗНЫМИ delta — редкий ручной микс) **оставлен на прежнем пути** (section-batch + фоллбэк),
как разрешает план §3/§7. `uniformK` срабатывает только при одинаковой delta у ВСЕХ 12 секций (основной сценарий
«Выбрать всё»). При неравных delta — старое поведение (теоретически тоже может упереться в section-batch-таймаут,
но это редкий ручной случай; лечится в (B)).

## 6. Что осталось на (B) — серверный фикс (red-zone, отдельная волна)

Базовая стоимость **одного** `global_all` ≈ **4.3 с** (в замере; на данных Анны — 183 covered протипа). K раундов
**последовательны по необходимости** (раунд N+1 исключает задачи раунда N через растущий exclude — параллелить нельзя,
иначе дубли) → для K=2 ≈ 8.6 с. Это **базовая стоимость resolve** (полный пересчёт состояния ученика в SQL) — её WP2
не трогает. **(B)** — серверный фикс 12-секционного complete-батча (чтобы он не упирался в statement_timeout) и/или
материализация состояния ученика, что позволит за один вызов отдать K× и снять K-кратность. Грубая оценка остаточного
времени после (B): ~один базовый resolve (~4 с) вместо K раундов.

## 7. Проверки

| | |
|---|---|
| `node --check tasks/picker.js` | ✅ OK |
| governance trio (`check_runtime_rpc_registry`/`no_eval`/`catalog_reads`) | ✅ зелёные (rows=33) |
| `bump_build` + `check_build` | ✅ `2026-05-30-7` |
| charnet teacher + student | ✅ **4/4 passed** (перебаза golden не нужна) |
| Замер BEFORE/AFTER (§2) | ✅ 13→2 вызовов, 500→нет, 25.2с→9.4с, 24=24 |

## 8. Чек-лист куратору

1. Ревью ветки `worktree-wp2-section-resolve-fix` (коммит в worktree, НЕ в main — §6.3).
2. Merge/push → GitHub Pages (build `2026-05-30-7`). SQL/деплой БД — **не требуется** (FE-only).
3. Ручной чек: «Выбрать всё» вдогонку ×2 (тесно) с учеником → в Network 2× `global_all` (не `resolve_batch`/500), быстро (~9 с), 24 задачи, без мигания.
4. **(B)** запланировать отдельно (серверный statement_timeout батча) — базовая стоимость resolve там.
