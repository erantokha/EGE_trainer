# Playwright Student Smoke Report

Дата: 2026-04-22  
Под-волна: `student smoke over Playwright baseline`  
Статус: green

## Цель под-волны

Довести живой `student`-контур нового Playwright baseline до устойчивого
минимального smoke-run:

- чтение student credentials из `.env.local`;
- зелёный `setup-student`;
- создание и использование `.auth/student.json`;
- зелёный основной `student` smoke;
- устранение ложного падения на строке `fail=0`.

## Что подтверждено

### 1. Secrets layer

Проверено без вывода секретов:

- `.env.local` присутствует;
- `E2E_STUDENT_EMAIL` заполнен;
- `E2E_STUDENT_PASSWORD` заполнен;
- `.auth/student.json` игнорируется через `.gitignore`.

Значения credentials в stdout, отчёт и код не выводились.

### 2. Причина предыдущего падения

Последний `error-context.md` подтвердил, что страница smoke фактически
отработала успешно:

- summary: `ok=12; warn=0; fail=0`;
- все строки результатов имели статус `OK`;
- падение было ложным из-за проверки `summaryText.not.toMatch(/FAIL/i)`.

Проблема была не в auth/session-capture и не в production runtime, а в
test-layer assertion: слово `fail` в счётчике `fail=0` ошибочно считалось
признаком провала.

## Что изменено

Изменён test-layer helper:

- `e2e/helpers/smoke.cjs`

Новая проверка:

- читает реальные `.status-pill` в таблице результатов;
- падает, если найден status pill со значением `FAIL`;
- явно парсит summary-счётчик `fail=<number>`;
- допускает `fail=0`;
- падает при `fail > 0` или если summary не содержит ожидаемый fail-счётчик.

Дублирующая проверка `summaryText.not.toMatch(/FAIL/i)` в
`e2e/student/home.spec.js` в текущем состоянии отсутствует; student spec
делегирует browser-smoke validation helper-у.

## Команды и результаты

1. Проверка secrets без печати значений:

```bash
if [ -f .env.local ]; then echo 'env_local=present'; else echo 'env_local=missing'; fi
node - <<'NODE'
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const envPath = path.resolve('.env.local');
if (!fs.existsSync(envPath)) {
  console.log('student_email=missing_file');
  console.log('student_password=missing_file');
  process.exit(0);
}
const parsed = dotenv.parse(fs.readFileSync(envPath));
const email = String(parsed.E2E_STUDENT_EMAIL || '').trim();
const password = String(parsed.E2E_STUDENT_PASSWORD || '').trim();
console.log(`student_email=${email ? 'present' : 'missing'}`);
console.log(`student_password=${password ? 'present' : 'missing'}`);
NODE
if [ -f .auth/student.json ]; then echo 'student_auth=present'; else echo 'student_auth=missing'; fi
```

Результат:

- `env_local=present`;
- `student_email=present`;
- `student_password=present`;
- перед reset-run `.auth/student.json` уже присутствовал.

2. Обязательный clean setup-run:

```bash
rm -f .auth/student.json && npx playwright test --project=setup-student --reporter=list
```

Результат:

- `1 passed`;
- `setup-student` прошёл;
- `.auth/student.json` создан заново.

3. Основной student smoke:

```bash
npx playwright test --project=student --reporter=list
```

Результат:

- `2 passed`;
- dependency `setup-student` прошёл повторно;
- `student can open student home and stats self smoke` прошёл;
- `tasks/stats_self_browser_smoke.html` завершился зелёным состоянием
  `ok=12; warn=0; fail=0` без строк `FAIL`.

Диагностический режим не запускался, потому что основной student smoke прошёл
зелёным.

## Артефакты

Новые failure-артефакты не создавались. После зелёного run в `test-results/`
остался только служебный файл Playwright:

- `test-results/.last-run.json`

`.auth/student.json` создан, используется Playwright project storage state и
не должен попадать в git.

## Изменённые файлы

- `e2e/helpers/smoke.cjs`
- `w_playwright_student_smoke_report.md`

## Текущий статус и остаточные риски

Student Playwright smoke сейчас зелёный и соответствует DoD этой под-волны.

Остаточные риски:

- контур всё ещё зависит от живых Supabase credentials и состояния тестового
  student-аккаунта;
- `student` project запускает `setup-student` как dependency, поэтому
  длительность smoke включает повторный login/setup;
- teacher smoke этой под-волной не проверялся.

После этого можно переходить к `teacher smoke`; дополнительный student
follow-up не требуется, пока не появится новый auth/runtime failure.
