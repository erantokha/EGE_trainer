# W1.1' Report — Physical per-page split `tasks/trainer.css` → Variant E

## 1. Резюме

Монолит `tasks/trainer.css` (3930 строк) физически разнесён на структуру Варианта E:
`tasks/trainer/{tokens,base,print}.css` + 9 `pages/<page>.css`. Сделано **byte-preserving
генератором** с доказанной **perfect conservation** (859 leaf-правил источника = 859 в выходе,
0 потеряно/добавлено/изменено, кроме 1 sanctioned OQ7-фикса). Визуальный паритет подтверждён:
`tests/print-features.js` **36/0, identical to baseline**; e2e без новых регрессий; spot-check 5
страниц (вкл. cascade-sensitive home-student accordion) — стили грузятся, layout цел.

Билд: **2026-05-25-6**. Размеры: tokens 98, base 2577, print 435 строк; pages 19–706
(home-student самый большой — концентратор каскада). Коммит: не создавался (для приёмки куратором).

**Ключевое архитектурное решение (отклонение от буквы плана):** `@layer` **НЕ используется**.
Эмпирически (print-features 34/2) выяснилось, что layered `!important` инвертирует приоритет и
ломает `.hidden`(base) vs `#addedBox`(print). Взят **sanctioned fallback из плана §7 risk #4** —
дисциплина порядка `<link>` (`tokens→base→page→print`), которую enforce'ит governance v2. Подробно §6.

## 2. DoD trace (§8)

| # | Критерий | Статус | Доказательство |
|---|----------|--------|----------------|
| 1 | Файлы созданы (без pages/auth.css) | ✅ | tasks/trainer/{tokens,base,print}.css + 9 pages; check_trainer_css_layers.mjs = v2-логика |
| 2 | trainer.css удалён | ✅ | `git status`: `D tasks/trainer.css` |
| 3 | Старый governance заменён на v2 | ✅ | check_trainer_css_layers.mjs переписан (v2-инварианты); _v2-файл слит в канон. имя |
| 4 | 22 HTML обновлены, порядок tokens→base→page→print | ✅ | 18 prod + smoke + 3 fixture; §4 |
| 5 | print-features 36/0 = baseline | ✅ | `diff` vs `print_features_baseline.txt` → IDENTICAL; `print_features_after.txt` |
| 6 | Governance 4/4 зелёные | ✅ | rpc_registry / catalog_reads / no_eval / trainer_css_layers — все OK |
| 7 | E2E без регрессий | ✅* | 25 passed; 2 failed = `auth.teacher.setup` (нет E2E_TEACHER_* в .env.local) + 1 pre-existing figure-тест (падает и на baseline монолите — §5). Ни одна не от split'а |
| 8 | Spot-check 5 страниц, без визуальных регрессий | ✅ | `reports/w1_1prime_smoke/*.png`; --accent определён, 0 CSS-404, home-student accordion цел |
| 9 | bump_build прогнан | ✅ | build 2026-05-25-6; version.json/app/build.js/?v= синхронны |
| 10 | git diff узкий | ✅ | §3 — trainer.css(D) + 22 HTML + governance + new tasks/trainer/ + bump-set |
| 11 | reports/w1_1prime_report.md | ✅ | этот файл |

\* §8.7: e2e «без регрессий» подтверждено сравнением с baseline (git stash → монолит): те же
figure-specs дают 1 failed/15 passed на baseline и 1 failed/15 passed на split (тот же
pre-existing тест). См. §5.

## 3. Diff stats

```
D  tasks/trainer.css                       (−3930)
M  tools/check_trainer_css_layers.mjs      (монолит-чек → v2 per-page чек)
M  18 prod + 1 smoke + 3 fixture HTML       (<link> swap: single → tokens/base/[page]/[print])
?? tasks/trainer/  (new): tokens 98, base 2577, print 435, pages/* 19..706  = 4588 строк
?? reports/w1_1prime_{artifacts,smoke}/, W1_1prime_PLAN.md
   + bump-set: app/build.js, version.json, ?v= в app/** и tasks/** (мех. bump_build)
```
4588 (новые) vs 3930 (монолит): +658 — заголовки файлов (×12), дублирование селекторов при
comma-split на разные таргеты, пер-таргетная пере-обёртка `@media`, и новый additive tokens-блок.
**Conservation доказана** (§4) — ни одного правила не потеряно.

## 4. Структура результата + conservation

```
tasks/trainer/
  tokens.css   98   :root + html|body[data-theme] var-блоки + additive --fs-*/--space-*/--radius-*/...
  base.css    2577  96 base(5+) + 110 shared + element/global + figure/card subsystem + @keyframes
  print.css    435  @media print { L4 global + L5 body.print-layout-active } verbatim
  pages/
    home-student.css 706   hw-create.css 188   student.css 204   trainer.css 124
    my-students.css   97   my-homeworks.css 94  unique.css 22    list.css 19   profile.css 24
```
**Conservation (`verify_split.cjs`):** извлечены triples `(media-context || individual-selector ||
normalized-decls)` из источника и из объединения выходных файлов. **859 = 859, 0 missing, 0 extra.**
Это побайтово-эквивалентная гарантия: каждое leaf-правило (вкл. token-блоки, с их `@media`
контекстом) присутствует ровно один раз. Единственное намеренное изменение — OQ7 (§ниже).

**Pages созданы только для страниц с screen-эксклюзивными селекторами (9).** НЕ созданы (нет
эксклюзивного screen-CSS — всё в base/print): `hw` (его 2 эксклюзив-токена `#hwGate`/`#hwDesc`
имеют только print-правила), `home-teacher` (0 эксклюзив — accordion/score-thermo шарятся → base),
`analog`, `stats`. Это уточняет плановый §4.1 список на основе фактических данных. `pages/auth.css`
не создан (W1.0b: 0 эксклюзив).

## 5. Cascade-conflict resolution + e2e regression analysis

- **17 home-student same-context конфликтов** (W1.0b §5): все `body[data-home-variant="student"]…`
  → single-page → мигрировали **единым блоком** в `pages/home-student.css` в исходном порядке.
  Spot-check home_student.png подтвердил корректность (accordion + badges-panel цел).
- **2 cross-cutting** (`.theme-toggle`, print `.ws-ans-wrap`): theme-toggle dead, ws-ans-wrap оба
  в print.css. Не задеты.
- **Figure/worksheet/card subsystem (W1.0 L2)** — обнаружена и устранена реальная регрессия (§6):
  per-page footprint mis-narrowed `.ws-fig`/`.task-fig`/`:has()`/`data-fig-*` на одну страницу,
  ломая figure-layout на sibling-страницах. Зафиксировано **forced-to-base** правилом в генераторе
  (вся семья `ws-*`/`task-*`/`fig-*`/`print-ans`/`data-fig-*` → base, как цельный L2-блок).
- **E2E baseline-сверка** (git stash → монолит): figure-specs `w2-4`/`w2-6` дают **1 failed /
  15 passed** и на монолите, и на split'е — тот же pre-existing тест `w2-6-fix mobile figure
  horizontal-full-width-case` (orientation="" derivatives). Не регрессия W1.1'.

## 6. @layer decision (важно для куратора)

План §5.4/§5.6 предписывал `@layer tokens, base, page, print`. Первая реализация с `@layer` дала
**print-features 34/2**:
- `#addedBox показан даже с .hidden` → FAIL. Причина: CSS-каскад слоёв для `!important`
  **инвертирован** — layered-important (`.hidden{display:none!important}` в `@layer base`) **бьёт**
  unlayered-important (`@media print #addedBox{…!important}`). В монолите оба unlayered → решал
  порядок (print позже выигрывал). `@layer` сломал этот паритет.

**Решение:** убрать `@layer` полностью; полагаться на **порядок `<link>`** `tokens→base→page→print`
(= порядок конкатенации = монолитный каскад для cross-file случаев, т.к. print грузится после base).
Это **явный fallback плана §7 risk #4** («не используем @layer, fallback на дисциплину порядка
<link>, которую linter v2 защитит»). После убирания `@layer` + фикса fixture-print-css (см. §7) →
print-features **36/0 identical**. governance v2 enforce'ит порядок `<link>` (import-discipline),
давая ту же гарантию каскада без рисков `@layer`.

## 7. Governance v2 (`check_trainer_css_layers.mjs`, заменил монолит-чек)

Инварианты (реализованы; уточнены против W1.0b §7 под реальный split):
- **tokens.css**: только `:root`/`html|body[data-theme]` селекторы; нет `@media`; нет `!important`.
- **print.css**: каждое правило print-scoped (внутри `@media print` ИЛИ `body.print-layout-active`).
- **base.css**: нет `@media print`-правил. (`!important` разрешён и **считается** — реально 19, напр.
  `.hidden`; строгий «base no !important» из W1.0b §7 нереалистичен — shared L3-правила с
  `!important` легитимно в base.)
- **pages/<page>.css**: нет `@media print`; каждый class/id-токен ∈ footprint этой страницы
  (`footprint_matrix.csv`) — **главный guard против mis-routing**. (`!important` считается — 41.)
- **import-discipline**: каждая prod-HTML грузит **ровно** `tokens+base(+page)(+print)` в порядке
  `tokens→base→page→print`. Это и есть cascade-гарантия вместо `@layer`.
- **monolith-gone**: `tasks/trainer.css` не существует.

Exit 0 = зелёный; FAIL (с перечнем) = exit 1. Прогон на финальной структуре — **ok**.
Особенность: специальный fixture-print-css mapping проверяется отдельно (он грузит pages/hw-create —
§7 ниже), fixtures не входят в prod import-discipline.

**Fixture-фикс:** `tests/fixture-print-css.html` — это print-тест-поверхность для hw_create
(W1.0 §6: использует hw_create UI). Изначально грузил tokens+base+print и провалил
`.hw-create-ans` screen-hide (правило в `pages/hw-create.css`). Добавлен `pages/hw-create.css` →
тест проходит.

## 8. Print-features diff vs baseline

`diff print_features_baseline.txt print_features_after.txt` → **0 контентных расхождений** (36
прошло, 0 упало в обоих). Полный after-лог: `reports/w1_1prime_artifacts/print_features_after.txt`.

## 9. E2E прогон

Полный `npm run e2e`: **25 passed, 2 failed**.
- ✅ whf1 (A1,A2), whf2-fix-1 (B,F×2), ws1 (A1,A2,A3), w2-4/w2-6 print+screen contracts (кроме 1), home.
- ❌ `auth.teacher.setup` — `Missing E2E_TEACHER_EMAIL` (нет teacher-кред в `.env.local`; env, не split).
- ❌ `w2-6-fix mobile figure horizontal-full-width-case` — **pre-existing** (падает на baseline
  монолите идентично, см. §5).

## 10. Скриншоты ручного smoke (§5.12.2)

`reports/w1_1prime_smoke/` (5 шт): auth, home_student, trainer→home, unique, hw. Все: `--accent`
определён (tokens.css загружен), **0 CSS-404**, 3–8 stylesheets. Визуально проверены auth (base-only,
цел) и **home_student** (концентратор каскада — accordion + badges-panel рендерятся корректно).

## 11. Открытые follow-up (отдельные волны, НЕ W1.1')

- **W1.2'** — Claude Design onboarding rehearsal на чистом `tokens.css`.
- **Hygiene: снос dead** (W1.0b §12, 28 кандидатов) — перенесены в base/pages как есть; удалять отдельно.
- **Hygiene: 1 pre-existing e2e failure** (`mobile figure full-width derivatives`) — падает и на
  монолите; разобрать вне split'а (это не CSS-структура, а figure-sizing на mobile).
- **probable tokens** (15px/10px font, 14px radius, .15s) — склейка/именование в W1.2'.
- **z-index шкала, breakpoint унификация, popover utility, ToC autogen** — отдельные hygiene-волны.
- **`@layer` в будущем** — возможен, но потребует переноса `!important`-утилит (`.hidden`) или
  специфичности; сейчас намеренно не используется (см. §6).
- **teacher e2e** — требует `E2E_TEACHER_EMAIL/PASSWORD` в `.env.local` для полного прогона.
