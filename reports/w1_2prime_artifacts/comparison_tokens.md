# Gap-analysis — our `tokens.css` vs Claude Design extracted (W1.2' §5.3)

Source: handoff bundle `ege-trainer-design-system/project/colors_and_type.css` (fetched from
`api.anthropic.com/v1/design/h/qCZRU_…`, decompressed). Compared against `tasks/trainer/tokens.css`
(commit f819a625). **Built from the bundle directly — no OCR.**

## Token-by-token (наши ~25 токенов)

| Категория | Наш token | Значение | Claude Design извлёк | Совпадение | Комментарий |
|---|---|---|---|---|---|
| surface | `--bg` | #ffffff | verbatim (+annot. "page background") | ✓ green | — |
| surface | `--panel` | #ffffff | verbatim ("card body") | ✓ green | — |
| surface | `--panel-2` | #e5e7eb | verbatim ("slate-200") | ✓ green | — |
| surface | `--muted` | #ffffff | verbatim ("intentionally white in light") | ✓ green | понял намеренность |
| border | `--border` | #d1d5db | verbatim ("slate-300") | ✓ green | — |
| text | `--text` | #111827 | verbatim ("slate-900") | ✓ green | — |
| text | `--text-dim` | #6b7280 | verbatim ("slate-500") | ✓ green | — |
| accent | `--accent` | #2563eb | verbatim ("blue-600") | ✓ green | один --accent, как у нас |
| accent | `--accent-2` | #1d4ed8 | verbatim ("blue-700, hover") | ✓ green | — |
| semantic | `--success` | #059669 | verbatim ("emerald-600") | ✓ green | — |
| semantic | `--danger` | #dc2626 | verbatim ("red-600") | ✓ green | — |
| elevation | `--shadow` | 0 8px 20px rgba(15,23,42,.12) | verbatim | ✓ green | — |
| radius | `--radius` | 12px | verbatim | ✓ green | — |
| radius | `--radius-sm/md/lg/pill` | 10/12/16/999 | verbatim | ✓ green | — |
| type-scale | `--fs-2xs…--fs-2xl` | 11/12/13/14/16/18/20 | verbatim (+annot. "body default", "h2") | ✓ green | — |
| space | `--space-1…--space-6` | 2/4/6/8/10/12 | verbatim | ✓ green | — |
| duration | `--dur-fast` | 120ms | verbatim | ✓ green | — |
| duration | `--dur-base` | .2s | как `200ms` | ✓ green | нормализовал .2s→200ms (эквивалент) |
| focus | `--focus-ring` | rgba(59,130,246,.35) | verbatim ("blue-500 @ 35%") | ✓ green | — |
| misc | `--figure-h` | 300px | verbatim ("trainer figure box") | ✓ green | — |
| theme | `[data-theme=dark]` блок | (12 vars) | verbatim, помечен "opt-in", "latent/hidden" | ✓ green | сам нашёл мёртвый theme-toggle (= W1.0 OQ10) |

**Извлечение наших токенов: 100% verbatim, 0 пропусков, 0 искажений.**

## Что Claude Design ДОБАВИЛ (data-driven из base.css/landing.css; категория «yellow»/➕, не red)

| Категория | Добавленный token | Значение | Откуда | Оценка |
|---|---|---|---|---|
| badge-tints | `--tint-gray/green/lime/yellow/red` | rgba(...) | наши base.css tints (W1.0b §4) | ➕ корректно вытащил из base.css в tokens |
| elevation | `--shadow-md/lg/modal` | реальные box-shadow из base/landing | grep-footprint есть | ➕ probable-token (W1.0b отложил) |
| space | `--space-7/8/10/12` | 14/16/20/24px | реальные литералы (W1.0b spacing 14×8,16×7,20×4,24) | ➕ probable-token |
| type | `--fs-3xl` | 26px (h1) | реальный h1 литерал (W1.0b freq=1) | ➕ probable-token |
| type | `--fs-hero/display/section` | clamp refs | landing.css fluid hero | ➕ landing-specific |
| type | `--font-sans/landing/mono` | system stacks | base.css/landing body | ➕ корректно (system-only) |
| type | `--lh-*`, `--tracking-*` | line-heights/letter-spacing | base/landing | ➕ |
| landing | `--surface/surface2/accent-light/green/amber/text-muted` | slate-50/100 etc. | landing.css :root | ➕ landing extensions |
| helpers | `.ds-h1/.ds-h2/.ds-body/.ds-small/.ds-display/...` | namespaced classes | новые helper-классы для recreations | ➕ namespaced `ds-`, не коллидируют |

**Все добавления — data-driven (из реального кода), не выдуманы.** Это ровно «probable tokens»,
которые W1.0b §4 отложил. НЕ являются red-расхождениями (Claude Design не «не понял» — он обогатил).

## §5.4 Generated sample quality

Component preview cards в bundle (`preview/components-{buttons,task-card,...}.html`) **используют наши
токены**: `var(--accent)`, `var(--border)`, `var(--muted)`, `var(--text)`, `var(--success)`,
`var(--font-sans)`. То есть сгенерированные компоненты стилистически согласованы с нашей системой
(не хардкод-цвета). Качество генерации — **consistent**.

## Вывод

**GREEN.** Все наши tokens извлечены verbatim; sample-компоненты используют наши var(--*);
ни одного red-расхождения; «additions» — корректные data-driven обогащения (probable-tokens).
Проект **Claude Design-ready без правок `tokens.css`**.

Follow-up (необязательно, отдельная hygiene-волна): можно адоптировать в `tokens.css` найденные
data-driven probable-tokens (`--space-7/8/10/12`, `--fs-3xl`, `--shadow-md/lg`), т.к. у них реальный
footprint. НЕ требуется для Claude Design-готовности.
