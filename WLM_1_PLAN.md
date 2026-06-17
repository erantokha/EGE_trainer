# WLM.1 — Режим занятия + Конспект-PDF (v1)

Трек: **WLM — Режим занятия (Lesson mode)** · продуктовый, параллельный, не сдвигает критический путь W2.
Волна: **WLM.1** · Статус: ⏭ готов к запуску · Приоритет: P2-product
Дата плана: 2026-06-17 · Источник видения: `PRODUCT_VISION.md` (§1 Занятие, §2 Конспект, «Приоритеты» п.1)

> **RED-ZONE.** Волна вводит новые таблицы, RLS, runtime-RPC, Storage-политики и
> правит общий header-меню. Применяется усиленный режим §6.2: scope lock,
> явные stop-ask, обязательный browser-smoke + скриншоты. См. §7.

> **Граница деплоя (согласовано с оператором).** Исполнитель пишет фронт + SQL-исходники +
> верификацию. **Backend в Supabase (SQL + Storage-bucket с политиками) применяет оператор сам.**
> Коммит/пуш в GitHub — по подтверждению оператора. Поэтому DoD двухуровневый (§8):
> «код+исходники готовы и локально проверены» сейчас, «живая приёмка» — после применения бэкенда.

---

## §1. Цель

Дать учителю на странице списка задач (`tasks/list.html`) **режим занятия** (тумблер сверху):
по ходу занятия учитель добавляет разобранные карточки в **конспект**, в конце собирает их в
**PDF**, который сохраняется и появляется у ученика в кабинете отдельным разделом «Конспекты».
Без флагов, без тегов навыков, без самостоятельной работы — только захват → PDF → кабинет.

## §2. Контекст и мотивация

- Сейчас учитель формирует конспект занятия вручную: делает скриншоты карточек с пометками и
  шлёт по одному в мессенджер. Это костыль; артефакт не сохраняется и не привязан к ученику.
- В `PRODUCT_VISION.md` это приоритет №1 (вместе с флагами); флаги по решению оператора вынесены
  из v1 — остаётся самый дешёвый видимый результат и устранение живой боли.
- Технически почти всё уже есть: на `tasks/list.html` встроена рисовалка `app/ui/draw_overlay.js`
  с захватом через `dom-to-image-more` (см. `draw_overlay.js:362-405`). Не хватает: контейнера
  «конспект», выгрузки снимков в хранилище, сборки PDF и экрана у ученика.
- `tasks/list.html` — учительская рабочая поверхность (ответы видны), в отличие от
  `tasks/trainer.html` (ученический, ответы скрыты). Поэтому режим занятия — именно на листе.

## §3. Out of scope

Явно НЕ делаем в этой волне:
- **Флаги** (`✅/💡/⚠️/❌`), теги навыков, авто-таймер карточки. Это WLM.2+.
- **Режим B** (самостоятельная работа на занятии = ДЗ с меткой). Отдельная волна.
- **Полноценный «Мой кабинет»** с консолидацией ДЗ. Сейчас — только новый пункт меню «Конспекты»
  (отдельная страница). Консолидация — отдельная IA-волна.
- **Отчёт родителю**, вторая часть, атомы, умное ДЗ — другие треки.
- **Редактирование/переупорядочивание** снимков внутри конспекта после добавления (v1 — append-only;
  можно удалить черновик целиком и собрать заново).
- Любые правки `tasks/trainer.html` / `tasks/trainer.css` каркаса, auth-flow, picker-движка.

## §4. Затрагиваемые файлы

**Backend (исходники, применяет оператор):**
- `docs/supabase/konspekts.sql` — **новый**: таблицы `konspekts`, `konspekt_snapshots`, RLS,
  RPC (§6), Storage-bucket + политики, GRANT/REVOKE.
- `docs/supabase/runtime_rpc_registry.md` — регистрация новых RPC.

**Frontend:**
- `tasks/list.html` — разметка тумблера «Режим занятия» и панели занятия сверху; подключение нового модуля.
- `tasks/list.js` — логика режима занятия: student-контекст (из подбора / дропдаун), кнопка
  «Добавить в конспект», «Собрать конспект».
- `app/ui/draw_overlay.js` — **shared, scope-lock**: добавить экспортируемую функцию захвата
  региона карточки в PNG-blob (рефактор существующего захвата `:362-405`, чтобы он отдавал blob,
  а не только писал в clipboard). Только аддитивно, без изменения текущего поведения clipboard.
- `app/providers/konspekts.js` — **новый**: провайдер-домен (вызовы RPC, выгрузка снимков/PDF в Storage).
- `app/vendor/jspdf.*` (или CDN-ESM импорт по паттерну `draw_overlay.js:370`) — **новый**: вендоринг jsPDF.
- `tasks/konspekts.html` + `tasks/konspekts.js` — **новые**: ученическая страница «Конспекты» (список по датам).
- `tasks/student.html` + `tasks/student.js` — доступ учителя к конспектам конкретного ученика (раздел/ссылка).
- `app/ui/header.js` — **core-adjacent, scope-lock**: новый пункт меню «Конспекты» (только добавление пункта).
- `tasks/trainer.css` / `tasks/trainer/pages/*.css` — стили тумблера/панели/страницы конспектов в
  **per-page** файлах (после W1-split), не в общем каркасе.
- `app/config.js` — bump через `node tools/bump_build.mjs` (правятся модули с `?v=`).

**Storage (провиженит оператор):** приватный bucket `konspekts`.

## §5. Пошаговый план

> **Task-tracking (обязательно для исполнителя):** в начале работы создай TaskList через
> `TaskCreate` с пунктами §5.1–§5.8 этого плана. По мере выполнения обновляй статус через
> `TaskUpdate`: `in_progress` при старте шага, `completed` при завершении. Это нужно, чтобы
> оператор видел прогресс в реальном времени без чтения stdout.

**§5.1. Backend-исходники.** Написать `docs/supabase/konspekts.sql` (схема §6): таблицы, индексы,
RLS-политики, RPC (security definer), Storage-bucket + политики, GRANT authenticated / REVOKE anon.
Идемпотентно (`create ... if not exists` / `drop ... if exists` для RPC). Зарегистрировать RPC в
`docs/supabase/runtime_rpc_registry.md`. **Исполнитель не применяет SQL к проду** — только исходник.

**§5.2. Захват карточки → blob.** В `app/ui/draw_overlay.js` выделить из существующего захвата
(`:362-405`) функцию вида `captureCardBlob(cardEl) → Promise<Blob>` (PNG), композящую DOM карточки
через `dom-to-image-more` + слой рисовалки `cMain` над регионом карточки. Текущее поведение
«копировать окно в clipboard» сохранить нетронутым (аддитивный рефактор).

**§5.3. Провайдер конспектов.** `app/providers/konspekts.js`: обёртки RPC (`konspekt_start_v1`,
`konspekt_add_snapshot_v1`, `konspekt_publish_v1`, `konspekt_signed_url_v1`,
`student_konspekts_list_v1`, `teacher_konspekts_for_student_v1`) через `supabase-rest.js`; выгрузка
blob снимка и финального PDF в Storage по path-конвенции `{teacher_id}/{student_id}/{konspekt_id}/...`.

**§5.4. Режим занятия на листе.** `tasks/list.html` + `tasks/list.js`: тумблер «Режим занятия»
сверху. Student-контекст: при наличии выбранного ученика (приходит из подбора «начать», зеркало
ДЗ-плумбинга) — подтянуть автоматически; иначе дропдаун выбора ученика в панели. При включении —
`konspekt_start_v1(student)` создаёт/возвращает черновик на сегодня.

**§5.5. Добавление в конспект.** Кнопка «Добавить в конспект» на карточке: `captureCardBlob` →
выгрузка снимка в Storage → `konspekt_add_snapshot_v1`. **Персистенция сразу** (снимок не теряется
при перезагрузке вкладки). Лёгкий индикатор «N в конспекте».

**§5.6. Сборка PDF.** «Собрать конспект»: тянем снимки черновика → jsPDF (`addImage` по странице,
хедер с датой+учеником, разумное разрешение/сжатие) → `output('blob')` → выгрузка PDF в Storage →
`konspekt_publish_v1`. После публикации конспект доступен ученику.

**§5.7. Страница «Конспекты» у ученика + пункт меню.** `tasks/konspekts.html` + `tasks/konspekts.js`:
список опубликованных конспектов авторизованного ученика (`student_konspekts_list_v1`) по датам,
смотреть/скачать через подписанный URL. Добавить пункт «Конспекты» в `app/ui/header.js`
(только новый пункт, навигация остальной части не трогается).

**§5.8. Доступ учителя + bump + governance.** В `tasks/student.html`/`tasks/student.js` — раздел
«Конспекты ученика» (`teacher_konspekts_for_student_v1`). Прогнать `node tools/bump_build.mjs`
(правятся `?v=`-модули). Прогнать governance (§9). Написать `reports/wlm_1_report.md`.

## §6. Данные / контракты / миграции

**Нужен ли backup:** нет (только новые таблицы/объекты, существующие не трогаются). **Runtime-контракты:**
добавляются новые RPC → обязательна регистрация в `runtime_rpc_registry.md` + `check_runtime_rpc_registry.mjs`.

**Схема (design-предложение, исполнитель уточняет по реальности):**

```sql
create table if not exists public.konspekts (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id),
  student_id uuid not null references auth.users(id),
  title text,
  lesson_date date not null default current_date,
  status text not null default 'draft' check (status in ('draft','published')),
  pdf_path text,
  created_at timestamptz not null default now(),
  published_at timestamptz
);
create table if not exists public.konspekt_snapshots (
  id uuid primary key default gen_random_uuid(),
  konspekt_id uuid not null references public.konspekts(id) on delete cascade,
  storage_path text not null,
  ordinal int not null default 0,
  question_id text,
  created_at timestamptz not null default now()
);
alter table public.konspekts enable row level security;
alter table public.konspekt_snapshots enable row level security;
```

**RLS-инварианты (ключевые, исполнитель пишет политики):**
- Учитель видит/правит конспект, только если `auth.uid() = teacher_id` **и** есть связь
  `teacher_students(teacher_id, student_id)` (consent). Создание — тоже под этой проверкой.
- Ученик: `SELECT` только свои `status = 'published'` (`auth.uid() = student_id`). Никакого доступа к чужим / черновикам.
- `konspekt_snapshots` наследует доступ через владение `konspekt_id`.

**RPC (layer-4, `security definer`, revoke anon / grant authenticated):**
- `konspekt_start_v1(p_student_id uuid) → konspekt` — создать/вернуть сегодняшний черновик для (teacher, student); гейт по consent.
- `konspekt_add_snapshot_v1(p_konspekt_id uuid, p_storage_path text, p_ordinal int, p_question_id text) → snapshot` — записать метаданные снимка.
- `konspekt_publish_v1(p_konspekt_id uuid, p_pdf_path text) → konspekt` — пометить published, выставить pdf_path/published_at.
- `konspekt_signed_url_v1(p_konspekt_id uuid) → text` — короткоживущий подписанный URL PDF; доступ: teacher-owner ИЛИ student при published.
- `student_konspekts_list_v1() → setof(...)` — опубликованные конспекты `auth.uid()`-ученика.
- `teacher_konspekts_for_student_v1(p_student_id uuid) → setof(...)` — конспекты учителя для ученика (под consent).

**Storage:** приватный bucket `konspekts`. Запись — только authenticated teacher под префиксом
`{teacher_id}/...`; чтение PDF — через подписанный URL из `konspekt_signed_url_v1` (storage-RLS не
усложняем, доступ гейтит RPC). Provisioning bucket + политик — **оператор**.

**Sync screen-spec:** опционально добавить `docs/navigation/konspekt_screen_v1_spec.md` (кратко). Не блокер DoD.

## §7. Риски и stop-ask точки

**RED-ZONE (явно):** новые RLS/ownership, новые runtime-RPC, Storage-доступ к данным ученика,
правка общего `app/ui/header.js`. Главный риск — **IDOR/утечка конспектов** (история security-аудита
2026-06-10). Поэтому:

- **Scope lock.** Разрешено править только файлы §4. Запрещено: трогать auth-flow
  (`app/providers/supabase.js`, `supabase-rest.js`, `tasks/auth*.js`), picker-движок, общий каркас
  `tasks/trainer.css` (только per-page файлы), `index.html`/`home_*.html`-роутинг, governance-скрипты,
  `.github/workflows/`, любые существующие RPC.
- **RLS обязателен на обе таблицы** до любого FE-теста против живого бэкенда; ученик не видит
  черновики и чужое; доступ к Storage — только через подписанный URL из RPC, не публичный bucket.
- **Stop-ask точки (сверх §6.3):**
  - попытка дать ученику доступ к черновику или к чужому конспекту (нарушение RLS-инварианта §6);
  - попытка сделать bucket публичным или раздать прямой Storage-URL без подписи;
  - правка `app/ui/header.js` за пределами добавления одного пункта меню;
  - правка `app/ui/draw_overlay.js`, меняющая существующее поведение clipboard-захвата;
  - расхождение реального API Supabase JS (Storage upload / signed URL) с допущениями §6.
- **Регрессии вёрстки:** стили — только per-page; прогнать `print-features` и приложить скриншоты
  тумблера/панели/страницы конспектов (§9).
- **`?v=`:** обязателен `node tools/bump_build.mjs` (правятся list.js, header.js, draw_overlay.js, новые модули).

## Режим работы: автономный

Не останавливайся за подтверждением на каждом шаге, не спрашивай «продолжать ли», не проси
промежуточного ревью. Доведи до DoD (§8) и верни `reports/wlm_1_report.md` + completion summary.
Куратор принимает работу целиком по факту.

**Останавливайся (stop-ask) только в экстренных случаях:**
1. Попытка изменить файл вне §4 «Затрагиваемые файлы».
2. Попытка зайти в зону §3 «Out of scope» или red-zone §6.2/§7 без explicit approval.
3. План противоречит реальности кода (файл/функция/RPC/сигнатура не та; реестр разошёлся).
4. DoD объективно недостижим без выхода за scope.
5. Governance-скрипт упал, причина не очевидна из diff волны.
6. Обнаружена уязвимость/утечка креденшлов.
7. Задача распадается на 2+ независимых.
8. Один тест/сценарий упал 2+ раза подряд после починок, причина неясна.
9. Архитектурное решение влияет на модули вне §4 (новый общий хелпер, смена формата хранения).
10. **Проектная специфика WLM.1:** (а) любой stop-ask из §7 (RLS/IDOR/Storage/header/draw_overlay);
    (б) реальный Supabase Storage API (upload/signedUrl) не совпал с допущениями §6 — остановись и
    предложи скорректированный контракт; (в) выяснилось, что `tasks/list.html` НЕ несёт student-контекст
    из подбора и его нельзя получить без правок picker-движка (вне scope) — остановись с вариантами.

**НЕ экстренное (работай сам):** мелкие развилки внутри scope; имена переменных/селекторов; порядок
шагов §5 при сохранном DoD; повторный прогон governance/smoke; желание показать промежуточный результат.

**Формат stop-ask:** короткое сообщение — какой пункт сработал, что обнаружено, варианты, рекомендация. Жди решения.

## §8. Критерии приёмки (DoD)

**Уровень A — готово исполнителем сейчас (без живого бэкенда):**
- A1. `docs/supabase/konspekts.sql` написан: таблицы + RLS (инварианты §6) + 6 RPC + Storage-политики,
  идемпотентен; RPC зарегистрированы в `runtime_rpc_registry.md`; `check_runtime_rpc_registry.mjs` зелёный.
- A2. `app/ui/draw_overlay.js`: добавлена `captureCardBlob`, существующее clipboard-поведение не изменено.
- A3. `tasks/list.html`/`list.js`: тумблер режима занятия, student-контекст (подбор+дропдаун), кнопки
  «Добавить в конспект»/«Собрать конспект» — UI и клиентская логика реализованы против контрактов §6.
- A4. `app/providers/konspekts.js`, jsPDF-вендоринг, `tasks/konspekts.html`/`.js`, пункт меню в
  `header.js`, раздел в `tasks/student.*` — реализованы.
- A5. jsPDF-сборка проверена изолированно (sample-картинки → корректный PDF-blob).
- A6. Все локальные governance зелёные; `print-features` без регрессий; `bump_build` прогнан;
  скриншоты тумблера/панели/страницы конспектов приложены.

**Уровень B — живая приёмка ПОСЛЕ применения бэкенда оператором (Storage bucket + SQL):**
- B1. Учитель в режиме занятия добавляет 2–3 карточки → «Собрать конспект» → PDF появляется у
  **этого** ученика в разделе «Конспекты», открывается/скачивается.
- B2. Другой ученик/аноним не видит этот конспект и не открывает его Storage-URL (RLS/подпись).
- B3. Черновик до публикации ученику не виден.
- B4. Учитель видит конспект в карточке ученика.
- B5. e2e teacher+student сценарий зелёный.

## §9. План проверки

Локально (исполнитель):
```bash
node tools/check_runtime_rpc_registry.mjs
node tools/check_runtime_catalog_reads.mjs
node tools/check_no_eval.mjs
node tools/check_trainer_css_layers.mjs
cd tests && node print-features.js
node tools/bump_build.mjs
python3 -m http.server 8000   # ручной smoke: тумблер на /tasks/list.html, jsPDF-сборка на sample
```
Браузер-smoke (обязателен, red-zone §6.2): скриншоты — (1) тумблер+панель занятия на листе,
(2) «N в конспекте» после добавления, (3) страница «Конспекты» у ученика. jsPDF-сборка
проверяется изолированным харнессом (массив sample-PNG → PDF открывается).

После применения бэкенда оператором — e2e: новый `e2e/teacher/wlm1-konspekt.spec.js`
(учитель собирает конспект) + `e2e/student/wlm1-konspekt.spec.js` (ученик видит свой, не видит чужой).
RLS-негатив (B2/B3) обязателен.

## §10. Отчётный артефакт

`reports/wlm_1_report.md` — фактический отчёт (не пересказ): что сделано пофайлово, итоговая схема/RPC
(финальные сигнатуры), доказательства уровня A (вывод governance, скриншоты, sample-PDF), список того,
что ждёт применения бэкенда оператором (уровень B), и точная инструкция оператору: какой SQL применить,
как создать bucket `konspekts` и его политики. Артефакты — в `reports/wlm_1/`.

---

### Pre-conditions перед стартом
- Оператор подтвердил скоуп (режим занятия + PDF, без флагов), surface = `list.html`, PDF = jsPDF,
  персистенция снимков сразу, меню = отдельный пункт «Конспекты» (без консолидации кабинета).
- Открытый вопрос к проверке на §5.4: несёт ли `tasks/list.html` student-контекст из подбора —
  если нет, сработает stop-ask 10(в).
