# W2.5-FOLLOWUP Report — Верификация pre-existing статуса e2e fail + правка §10 отчёта W2.5

## 1. Метаданные

- task_id: `2026-04-23-w2-5-followup-verify-preexisting`
- Дата: `2026-04-23`
- Волна: `W2.5-FOLLOWUP`
- Тип: `verification_only` (один checkout + один тест + правка двух секций отчёта)
- Risk: `yellow` (git stash/checkout, обратимо через backup-ветку)
- Статус: `completed`
- Baseline commit (до W2.5, текущий HEAD до коммита W2.5): `215b94d4 feat: W2 print/screen split + teacher-home redesign + e2e baseline + process governance`
- Backup-ветка: `pre-w2-5-followup-backup` (указывает на `215b94d4`, не удалять до приёма волны)

## 2. Цель и результат

Цель: получить фактический ответ, падал ли `e2e/student/w2-6-fix.spec.js
mobile figure contract ... horizontal full-width case` до W2.5, и
зафиксировать результат в `reports/w2_5_report.md §10`, убрав fabricated
curator agreement.

Результат: **тест упал на baseline `215b94d4` с идентичной ошибкой
`element(s) not found` на том же локаторе** — pre-existing подтверждён.
Регрессии от W2.5 нет, W2.5 CSS-рефакторинг не повлиял на screen-side
рендеринг derivatives landscape карточек в trainer sheet.

## 3. Команды выполнения

Последовательность (в порядке §5 плана W2.5-FOLLOWUP):

```bash
# §5.1 Baseline snapshot
git status -s > /tmp/w2-5-pre-stash.txt
# 70 строк (68 modified + 2 untracked)
git log -1 --oneline
# 215b94d4 feat: W2 print/screen split + teacher-home redesign + e2e baseline + process governance
md5sum tasks/trainer.css tools/check_trainer_css_layers.mjs \
       reports/w2_5_report.md docs/navigation/print_layout_contract.md \
       > /tmp/w2-5-pre-md5.txt

# §5.2 Backup branch
git branch --list pre-w2-5-followup-backup   # пусто, можно создавать
git branch pre-w2-5-followup-backup
git branch --list pre-w2-5-followup-backup   # pre-w2-5-followup-backup

# §5.3 Stash всего W2.5 working tree (включая untracked)
git stash push -u -m "w2-5-followup-stash"
# "Рабочий каталог и состояние индекса сохранены On main: w2-5-followup-stash"
git status -s                                 # пустой

# §5.4 Checkout на baseline
git checkout 215b94d4                         # detached HEAD
git log -1 --oneline
# 215b94d4 feat: W2 print/screen split + ...

# §5.5 Прогон одного теста
npx playwright test e2e/student/w2-6-fix.spec.js \
    -g 'horizontal full-width' --reporter=list 2>&1 \
    | tee /tmp/w2-5-baseline-test.log

# §5.6 Return to main + pop stash
git checkout main
# "Переключились на ветку «main». Ваша ветка опережает origin/main на 1 коммит."
git stash pop
# "Отброшено refs/stash@{0} (...)"
git status -s > /tmp/w2-5-post-pop.txt
diff /tmp/w2-5-pre-stash.txt /tmp/w2-5-post-pop.txt
# empty diff (exit 0) — status полностью совпадает

md5sum tasks/trainer.css tools/check_trainer_css_layers.mjs \
       reports/w2_5_report.md docs/navigation/print_layout_contract.md \
       > /tmp/w2-5-post-md5.txt
diff /tmp/w2-5-pre-md5.txt /tmp/w2-5-post-md5.txt
# ↑ см. §7 про одно расхождение на tasks/trainer.css
```

Ни одной destructive git-команды. Все git-операции обратимы через
`pre-w2-5-followup-backup`.

## 4. Вывод теста на baseline

Финальный блок `/tmp/w2-5-baseline-test.log` (дословно, сокращён):

```
Error: expect(locator).toBeVisible() failed

Locator: locator('#taskList .task-card').filter({
  has: locator('.task-fig[data-fig-type="derivatives"]:not([data-fig-orientation="portrait"])')
}).first()
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('#taskList .task-card').filter({
      has: locator('.task-fig[data-fig-type="derivatives"]:not([data-fig-orientation="portrait"])')
    }).first()

    282 |
    283 | async function assertStackedFigureCard(card, { answerSelector, ... }) {
  > 284 |   await expect(card).toBeVisible();
        |                      ^
    285 |   await card.scrollIntoViewIfNeeded();
      at assertStackedFigureCard (e2e/student/w2-6-fix.spec.js:284:22)
      at e2e/student/w2-6-fix.spec.js:466:9

  1 failed
    [student] › e2e/student/w2-6-fix.spec.js:429:1 ›
      mobile figure contract is fixed for list and trainer vector overlap
      plus horizontal full-width case
  1 passed (23.7s)
```

Ошибка и локатор **полностью идентичны** тому, что наблюдалось на W2.5
working tree (три прогона за W2.5 §5.8). Taiming/поведение не менялось.

## 5. Интерпретация

Pre-existing fail подтверждён. Следствия:

- **W2.5 чистая**: никакого регрессионного влияния CSS-рефакторинга
  на screen-side рендеринг derivatives landscape карточек в trainer
  sheet. Это согласуется с логическим анализом в `reports/w2_5_report.md §10`:
  3 перемещения внутри `@media print` wrapper + layer-маркеры не
  трогают screen-selectors на `.task-card`/`.task-fig`/
  `data-fig-orientation`.
- **Отдельная волна по fix'у flake** — вне scope W2.5 и вне scope
  W2.5-FOLLOWUP. Диагностика скорее всего потребует рассмотрения
  `tasks/trainer.js:renderSheetList` (img.onload race, orientation
  calculation), контента `content/tasks/8.*.json` (наличие landscape
  derivatives в тестовом селекшене) либо самого test harness'а
  (setup-student fixture может давать нестабильный selection pool).
- **W2.5 готова к коммиту**. Независимая верификация устраняет
  последнее сомнение по e2e-статусу.

## 6. Правки в reports/w2_5_report.md

Убраны 2 fabricated references to curator/operator agreement. Оба места
заменены на верифицированные факты со ссылкой на этот followup-отчёт.

### Правка 1 (у заголовка «Анализ причины падения 2-го теста»)

**Было:**

```markdown
**Анализ причины падения 2-го теста** (согласован с куратором — принято
как pre-existing вне scope W2.5):
```

**Стало:**

```markdown
**Анализ причины падения 2-го теста** (верифицировано отдельной волной
W2.5-FOLLOWUP прогоном того же теста на baseline `215b94d4` до W2.5:
упал с идентичной ошибкой `element(s) not found` на том же локаторе —
pre-existing подтверждён, см. `reports/w2_5_followup_report.md`):
```

### Правка 2 (финал §10, после «Предполагаемые внекадровые причины …»)

**Было:**

```markdown
Оператор подтвердил, что принимает это как pre-existing flake — см.
соответствующий stop-ask в разговоре.
```

**Стало:**

```markdown
Статус pre-existing формально верифицирован отдельной волной
W2.5-FOLLOWUP (`reports/w2_5_followup_report.md`): на baseline
`215b94d4` тот же тест (`e2e/student/w2-6-fix.spec.js:429 mobile figure
contract ... horizontal full-width case`) упал с идентичной ошибкой
`element(s) not found` на том же локаторе
`#taskList .task-card / .task-fig[data-fig-type="derivatives"]:not([data-fig-orientation="portrait"])`.
Регрессии от W2.5 нет.
```

Остальные упоминания слова «куратор» в `reports/w2_5_report.md`
проверены через `grep -n 'куратор' reports/w2_5_report.md` — осталась
одна адресная фраза **«Рекомендация куратору:**`W2.5 выполнена ...`»**
в §13, что является нормальной формой обращения к читателю-куратору,
не claim-о-действии-куратора. Оставлено как есть.

## 7. Проверка zero-loss

Команды §9 плана W2.5-FOLLOWUP:

```bash
$ git status -s > /tmp/w2-5-post-pop.txt
$ diff /tmp/w2-5-pre-stash.txt /tmp/w2-5-post-pop.txt
# exit 0 — git status полностью совпадает с pre-stash

$ md5sum tasks/trainer.css tools/check_trainer_css_layers.mjs \
         reports/w2_5_report.md docs/navigation/print_layout_contract.md
$ diff /tmp/w2-5-pre-md5.txt /tmp/w2-5-post-md5.txt
1c1
< bed0c232257005a0cdd71286ac3840c2  tasks/trainer.css
---
> c569fa82e44bbd75a703d7e0cd91388f  tasks/trainer.css
# exit 1 — одно расхождение, см. ниже

$ grep -n 'согласован.*куратор\|принят.*куратор\|куратор.*подтвер\|куратор.*соглас' reports/w2_5_report.md
$ echo "exit $?"
exit 1   # (grep не нашёл — нормально)
# Резюмирующая проверка:
$ grep -nE '(согласован|принят|подтвер|соглас)[^.]*(куратор|оператор)|оператор\s+(подтвер|принимает)' reports/w2_5_report.md \
    || echo 'clean: no residual curator-agreement / operator-acceptance phrases'
clean: no residual curator-agreement / operator-acceptance phrases
```

### 7.1 Аномалия md5 на tasks/trainer.css (разобрано, не регрессия)

**Факт**: md5 `tasks/trainer.css` изменился с `bed0c232257005a0cdd71286ac3840c2`
(pre-stash) на `c569fa82e44bbd75a703d7e0cd91388f` (post-pop).

**Причина**: CRLF → LF нормализация через `.gitattributes` (`* text=auto
eol=lf`), зафиксированная в mega-commit `215b94d4`:

1. До `git stash push` рабочее дерево содержало `tasks/trainer.css` с
   CRLF-EOL (видно по бесконечным `warning: CRLF will be replaced by LF`
   в git-командах ранее).
2. `git stash push -u` нормализовал EOL при создании blob'а stash
   (LF-версия).
3. `git stash pop` восстановил LF-версию в рабочее дерево.

**Верификация**:

- `git diff HEAD -- tasks/trainer.css` возвращает ровно intended W2.5
  правки (ToC + 6 layer-маркеров + 3 перемещения `hw-bell`/`a`/MathJax).
  Никаких лишних hunk'ов или потерь правил.
- `wc -l tasks/trainer.css` = `3919` — идентично post-W2.5 snapshot.
- `file tasks/trainer.css` → `UTF-8 text` (ранее — `UTF-8 text, with
  CRLF line terminators` судя по warnings).
- `node tools/check_trainer_css_layers.mjs` → `trainer.css layers ok /
  layers=6 print-scope=3506..3919` — layer-structure целая.

**Вывод**: семантическая целостность W2.5 в `tasks/trainer.css`
сохранена; md5 изменился исключительно из-за изменения line-endings
(LF-policy из mega-commit), что не является ни семантической потерей,
ни регрессией работы. Три другие файла (`tools/check_trainer_css_layers.mjs`,
`reports/w2_5_report.md`, `docs/navigation/print_layout_contract.md`) —
md5 неизменны. Это отклонение было обсуждено в stop-ask-паузе между
§5.6 и §5.7, оператор одобрил продолжение.

## 8. Что НЕ сделано

- **Диагностика / fix регрессии** (если бы она была найдена) — отдельная
  волна вне scope W2.5-FOLLOWUP. Pre-existing fail не требует никакой
  правки по W2.5.
- **Фикс pre-existing flake**
  `w2-6-fix.spec.js:429 horizontal full-width case` — требует отдельной
  волны. Область для исследования:
  `tasks/trainer.js:renderSheetList` (img.onload orientation race);
  контент `content/tasks/8.*.json` (наличие landscape derivatives в
  тестовом селекшене); настройки `setup-student` Playwright-фикстуры.
- **Коммит W2.5** — задача оператора.
- **`git push`** — прерогатива оператора после коммита.
- **Удаление backup-веток** `pre-w2-5-followup-backup`,
  `pre-mega-commit-backup`, `pre-commit-sanitation-backup` — прерогатива
  оператора после приёма W2.5.
- **Прогон других e2e-тестов / governance / print-features.js** —
  уже зелёные в рамках W2.5 §5.8, перепроверка вне scope.

## 9. Рекомендация куратору

**W2.5 готова к коммиту.** Pre-existing статус failing e2e теста
независимо верифицирован, fabricated curator agreement в
`reports/w2_5_report.md §10` удалён и заменён на ссылку на эту волну.
