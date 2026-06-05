# WD.1 — Редизайн экрана входа (`tasks/auth.html`) через Claude Design

Дата: 2026-06-05
Зона: RED-ZONE (auth-flow). Чистый фронт (HTML/CSS + governance-карта), без SQL/JS-логики.
Источник дизайна: handoff-бандл Claude Design (`api.anthropic.com/v1/design/h/m7sVcNVlUaHCOIfoapMeRw`,
файл `Auth Screen.html`).

## Сделано

- **NEW `tasks/trainer/pages/auth.css`** — весь CSS дизайна (карточка по центру, segmented-табы,
  Google-кнопка, role-chips, поля, состояния кнопки, статус). Per-page файл (грузится только
  из `auth.html`). Недостающие токены (`--surface #f8fafc`, `--surface2 #f1f5f9`,
  `--accent-light #dbeafe`, `--font-sans`, `--font-landing` — landing-extensions из
  `colors_and_type.css` бандла) определены **локально** в этом файле (скоуп `body.auth-page`).
  Глобальный `tokens.css` НЕ тронут (кросс-каттинг).
- **`tasks/auth.html`** — новая разметка дизайна. **Сохранено:** вся head-инфраструктура
  (CSP, cache-check, Sentry, `tokens.css`/`base.css`, `theme.js`), `auth.js` (module),
  и **все DOM-хуки `auth.js`** (`tabLogin/Signup/Reset`, `panelLogin/Signup/Reset`,
  `loginForm/loginEmail/loginPass/loginSubmit/loginStatus`, `googleBtn`, весь `signup*`,
  `studentFields/teacherFields`, `signupRole`, `resendBtn`, `reset*`). Демо-скрипт дизайна
  убран — логику ведёт реальный `auth.js`. Добавлен крошечный inline-апдейтер заголовка
  карточки по активному табу (косметика, без auth-логики). Google-логотип → `./img/google.png`.
- **Убрано (по дизайну):** старая 2-колоночная вёрстка, верхний app-хедер с переключателем темы.
- **`tools/check_trainer_css_layers.mjs`** — `FILE_PAGES['auth']=['auth']` + import-discipline
  `tasks/auth.html → [tokens, base, pages/auth]` (регистрация нового page-файла).

## Проверки (на localhost, рабочее дерево)

- **Реальный вход** тестовым учеником через новую `auth.html`: кнопка разблокировалась
  (pre-readiness guard снят), сессия персистнулась, редирект на `home_student.html` → **LOGIN OK**.
- **Привязка `auth.js`** (Playwright): табы переключают панели, роль «Учитель» показывает
  учительские поля, показать/скрыть пароль, заголовок меняется под таб — всё работает, 0 page-errors.
- **Рендер** = дизайну Claude Design (вход/регистрация/сброс), скриншоты сняты.
- governance 4/4 зелёные (`check_trainer_css_layers` ok после правки карт).
- build bump для cache-bust.

## Открытые решения (на оператора)

- Верхний app-хедер + переключатель темы на входе убраны (дизайн — чистый экран). Вернуть?
- Лейбл таба «Сброс пароля» (было «Сменить пароль»).
- Заголовок per-tab сделан inline-скриптом; альтернатива — внести в `auth.js` (red-zone JS).

## Следующее

`auth_callback.html` / `auth_reset.html` / `google_complete.html` дизайн не покрывает —
остаются на старой вёрстке (отдельный заход, если нужно). Затем — главная ученика (WD.2).
