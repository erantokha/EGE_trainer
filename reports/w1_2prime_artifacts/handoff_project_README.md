# EGE-trainer · Design System

**EGE-trainer** (ЕГЭ‑тренажёр) — a Russian-language web app for practising
Russian state-exam (ЕГЭ) mathematics, hosted at **ege-trainer.ru**. Students
drill problems from the official **ФИПИ** (Federal Institute of Pedagogical
Measurements) open task bank; teachers assign homework, monitor a student's
weak prototypes, and create personalised drills in two clicks.

The product is a **static multi-page site** — plain HTML + vanilla JS + CSS,
no build step, deployed to GitHub Pages, with Supabase providing auth and
data. The UI is in Russian, clean and utilitarian: lots of white, hairline
borders, a single blue accent.

## Source

- **GitHub:** <https://github.com/erantokha/EGE_trainer>
  - `tasks/trainer/tokens.css` — source-of-truth design tokens
  - `tasks/trainer/base.css` — shared component CSS (60+ KB, one file)
  - `tasks/trainer/pages/*.css` — per-page overrides
  - `landing.css` — marketing site (parallel token set, `--accent`, `--surface`, `--text-muted`)
  - `home_student.html`, `home_teacher.html`, `index.html`, `student.html` — key surfaces
- No Figma, no brand assets, no logos shipped in the repo. The wordmark
  "EGE-trainer" is rendered inline as text.

**If you have repo access**, explore further:
- Trainer page styles: `tasks/trainer/pages/trainer.css`
- Homework creation: `tasks/trainer/pages/hw-create.css` and `tasks/hw_create.js`
- The big monolith `tasks/trainer/base.css` is the single best read for understanding interaction patterns.

---

## Index of this design system

| File | What |
|---|---|
| `colors_and_type.css` | All CSS custom properties — drop-in foundation |
| `tasks/trainer/tokens.css` | Original tokens (preserved verbatim) |
| `tasks/trainer/base.css` | Original component CSS (preserved verbatim) |
| `landing.css` | Original landing CSS (preserved verbatim) |
| `tasks/trainer/pages/*.css` | Per-page styles for reference |
| `assets/` | Icons, logos, favicon, sample PNGs |
| `preview/` | Design-system tab cards (colors, type, spacing, components) |
| `ui_kits/student/` | Student-side UI kit (home, trainer, summary) |
| `ui_kits/teacher/` | Teacher-side UI kit (students list, profile, hw_create) |
| `ui_kits/landing/` | Marketing landing UI kit |
| `SKILL.md` | Agent Skill manifest |

---

## Two products under one roof

| Surface | URL | What it is |
|---|---|---|
| **Landing** | `/` (unauthenticated) | Marketing site — sticky nav, hero, before/after, FAQ, dark CTA. Different visual register: gradients, soft shadows, pill CTAs. |
| **Student app** | `/home_student.html`, `/tasks/trainer.html`, `/tasks/hw.html` | Topic picker → run a session → answer field → result chip. Tight, utilitarian, no decoration. |
| **Teacher app** | `/home_teacher.html`, `/tasks/my_students.html`, `/tasks/student.html`, `/tasks/hw_create.html` | Students list, per-student dashboard, homework builder. Same component vocabulary as student, plus stats badges everywhere. |

Same tokens, but the **landing** ships a parallel `:root` block in
`landing.css` (using `--surface`, `--text-muted`, `--accent-light`) that
overlaps the trainer set. Both have been folded into `colors_and_type.css`.

---

## Content fundamentals

**Language: Russian, formal-but-warm.** The app talks to teachers as
professionals and to students as adults — never patronising, never gamified.
There is no "You earned a streak!", no badges, no celebratory copy.

**Address: "вы" (formal you), never "ты".** Direct: *«Выберите темы и
подтемы. Затем нажмите «Начать».»* No first-person. The product is
invisible — copy describes what the user does, not what the product is doing.

**Casing: sentence case.** Headings, buttons, menu items — all sentence
case. *«Создать ДЗ»*, *«Видео-решение»*, *«Решить аналог»*. ALL CAPS only
appears in the landing eyebrow chip ("СТАТИСТИКА ПО КАЖДОМУ ПРОТОТИПУ").

**Abbreviations are normal vocabulary** — readers know them:
- **ЕГЭ** — the exam itself
- **ФИПИ** — official task-bank source
- **ДЗ** — homework ("домашнее задание")
- **прот.** — prototype (a "class" of problems)
- Numerals shorthand: *«23 дня назад»*, *«12 дн.»*, *«5 мин»*

**Voice samples** (lifted from the live product):
- *«Ваш ученик хочет 70+ баллов? Узнайте, где именно он теряет баллы.»* — hero
- *«Платформа для учителей, которые хотят работать точнее — а не больше.»* — subhead
- *«Никакого лишнего контента. Каждая задача — из официального открытого банка ФИПИ.»* — feature
- *«5 минут: открыли профиль, увидели слабые места, выдали ДЗ»* — before/after
- Confirmation: short, dry. *«Готовность по первой части»*, *«Перемешать задачи»*.

**Tone vs. competitors:** zero hype. No "AI-powered", no "revolutionary",
no growth-hacking copy. Numbers carry the weight: *«4 000+ задач»*, *«100%
официальные»*, *«5 мин»*.

**Punctuation:**
- Em-dash (`—`) used liberally for clauses and as a list-item bullet.
- Russian guillemets `«…»` for quotation, never straight quotes.
- Middle dot `·` separates metadata: *«прот. 1.3.2 · точность 33% · 12 дн.»*

**Emoji:** very limited. The landing uses 📊⚡🎯 (one per feature card) and
the FAQ summary uses `+ / −` glyphs; the trainer itself uses Unicode `✓ ✗
⚠ →` instead of emoji. Treat product surfaces as **emoji-free** unless
mirroring the three landing icons.

---

## Visual foundations

### Palette discipline

**A single accent — `#2563eb` (blue-600).** Everything else is greys and
semantic colours used sparingly. Backgrounds default to plain white
(`--bg: #ffffff`); the only "decoration" colour on a normal screen is the
blue of `--accent` on links and the primary CTA.

- **Trainer surfaces** sit on `--bg: #ffffff`. Sections separate via 1-px
  hairline borders (`--border: #d1d5db`) and the universal `--shadow:
  0 8px 20px rgba(15,23,42,.12)` on `.panel`.
- **Landing** introduces a 50/100 slate band (`--surface: #f8fafc`,
  `--surface2: #f1f5f9`) and ONE 175deg blue gradient on the hero:
  `linear-gradient(175deg, #e0eaff 0%, #ffffff 60%)`. Stats section flips
  to solid `--accent` blue; final CTA flips to solid `--text` (slate-900).
- **Status colours** are translucent over the current background (rgba ×
  .10/.12/.14/.16) — gray → green → lime → yellow → red. This lets
  badges work in dark mode without recolouring.
- **No multi-stop gradients on product surfaces.** The only gradient is
  the primary button: `linear-gradient(135deg, #3b82f6 0%, #1a3fa8 100%)`.

### Backgrounds

- **Full-bleed images:** none. The product is text + tables + math figures.
- **Patterns / textures:** none.
- **Hero illustration:** none — a single soft blue→white linear gradient.
- **Demo mock** on the landing is a fake browser chrome (3 traffic-light
  dots, slate-100 titlebar) wrapping a screenshot-style "card view" built
  in CSS. **Never decorative imagery.**

### Type

System sans only — `system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu,
Cantarell, "Noto Sans", Arial`. **No web fonts are loaded.** The product
deliberately uses whatever the OS provides; the landing's `font-family`
swaps to `-apple-system, BlinkMacSystemFont` first (same family, different
order) — visually identical to most users.

Type uses **fluid clamp() sizes** for hero (34→64px) and section titles
(22→30px). Body is 14 / 1.45. Headings sit at 26 (h1) and 20 (h2). The
landing display weight is **900**, but everything inside the product caps
at **700**. Tabular numerics are enforced on stats: `font-variant-numeric:
tabular-nums`.

### Geometry

- **Radius scale:** 8 / 10 / 12 / 14 / 16 / 999. Default radius is **12**
  (`--radius-md`). Pills (999) are used everywhere for **status** and
  **toggles**, never for primary actions. Square corners only appear inside
  math-figure `.task-fig` (`border-radius:0`) so SVGs render crisply.
- **Borders:** `1px solid var(--border)`. The only **2px** border appears
  on `.task-num` chips and the "wrong" landing comparison card (`#f87171`,
  2px).
- **Cards:** white background, 1px hairline border, 12px radius, soft
  shadow. Inner padding is **16–18px**. No coloured left-border accents.
- **Inner shadows:** unused. Pressed state is `transform: translateY(1px)`
  on the countbox buttons; everything else is `filter: brightness(1.06)`.

### Layout rules

- **Max container width: 1080px**, centred, 16–24px gutters.
- **Two-column grid** on student home: accordion + score forecast (260px right
  rail). Collapses below 900px.
- **Sticky nav:** only on the landing (60px tall, white@50% with
  `backdrop-filter: blur(10px)`). The app uses an in-panel header inside
  `<header id="appHeader" class="page-head">`.
- **Mobile breakpoints:** 520 / 600 / 640 / 720 / 860 / 900 / 1024 / 1150 /
  1400. The code consistently re-grids at 640 and 1024.

### Motion

- **Durations:** `--dur-fast: 120ms`, `--dur-base: 200ms`. Both are tiny.
- **Easings:** plain `ease` or `ease-in-out`. No springs, no bouncy curves.
- **Effects on the system:**
  - `transition: 0.12s ease-in-out` on every button (hover lift).
  - `transition: width 220ms ease, background-color 220ms ease` on the
    score thermometer fill.
  - A single `@keyframes ht-shake` (280 ms) on a wrong answer — translateX
    ±5/4 px four steps.
  - A skeleton shimmer `@keyframes homeBadgeShimmer` (1.1 s) while stats load.
- **Reduced motion:** the system does not opt out anywhere — but since
  there's effectively no motion to begin with, this is fine.

### Interaction states

- **Hover:** `filter: brightness(1.06)` on every button. Surfaces lift via
  `background: rgba(148,163,184,.12)` in menus.
- **Active / pressed:** `transform: translateY(1px)` on countbox; nothing
  on most buttons.
- **Focus-visible:** universal — `outline: 2px solid rgba(59,130,246,.35);
  outline-offset: 2px`. Mouse focus is suppressed (`focus:not(:focus-visible)
  { outline: none }`).
- **Disabled:** `opacity: .55; cursor: not-allowed`.
- **Invalid answer:** `result.bad` chip (red tinted), input row shakes
  280 ms.

### Transparency & blur

- **Single blur in the system:** the landing's sticky nav `backdrop-filter:
  blur(10px)` over `rgba(255,255,255,0.5)`.
- **Overlays:** modal backdrops use `rgba(0,0,0,.35–.45)` plain. The loading
  overlay uses `rgba(15,23,42,.94)`.
- **Translucent fills:** badges, stat tints, and many panel-2 hover states
  use `rgba(148,163,184,.06–.18)`. This is the system's go-to "soft sunken"
  effect — never a solid grey, always a wash.

### Cards (recap)

The product has **one** card style:
```
background: var(--panel);            /* #fff on light */
border: 1px solid var(--border);     /* #d1d5db */
border-radius: var(--radius);        /* 12px */
box-shadow: var(--shadow);           /* soft, downward */
padding: 16px 18px;
```
Modal cards bump radius to 16, shadow to `0 20px 50px rgba(0,0,0,.22)`,
and use `--panel-2` for their header band. Demo-mock cards (landing)
add a 32-px shadow.

### Imagery vibe

- Cool. White and slate, with a single saturated blue.
- Mathematical figures are black-on-white SVG, rendered crisply with
  `border-radius: 0`. They are technical, not decorative.
- The product has **no photographic imagery** anywhere.

### Anti-patterns

Things the product **never** does — avoid these in new designs:
- Bluish-purple gradients.
- Coloured left-border accents on cards (the trainer is colour-tinted
  surfaces only).
- Emoji in production UI (landing feature cards are the lone exception).
- Hand-drawn / illustrative SVG decorations.
- Custom font loading.
- Dropshadows on text.
- Glassmorphism — the single blur is on the landing nav strip and that's it.

---

## Iconography

**The product is icon-light.** Most "icons" are Unicode glyphs, set in
text alongside copy:

| Glyph | Meaning | Where |
|---|---|---|
| `✓` | correct / done | trainer result, before/after |
| `✗` | wrong / missing | trainer result, landing "before" cards |
| `⚠` | stale (давно не решал) | mock dashboard, student card |
| `→` | "next" or call-to-action arrow | CTAs, before/after rows |
| `+ / −` | counter steppers, accordion open/close | countbox, FAQ |
| `«…»` | quotes around testimonials | landing tcard |
| `·` | metadata separator | *прот. 1.3.2 · точность 33%* |

**Bitmap PNG icons** (a handful, shipped in `tasks/img/`, copied to
`assets/` here):
- `home_nav.png` — house icon, used as the mobile "home" button (renders
  at 30–36 px, swap target for `.home-icon-btn` on `max-width: 1024px`).
- `hw_bell.png` — solid red bell, used as the "new homework" indicator
  next to the user-menu button. Always 16 px or smaller.
- `google.png` — Google "G" mark, used inside the Google OAuth button on
  `/tasks/auth.html`.
- `post.png` — generic illustration (a 260×195 raster), used inside a
  notification banner.

**Inline SVG** appears in only two places:
1. **Landing nav** — a tiny 14×14 role icon (student vs. teacher silhouette).
   Inline. No icon library.
2. **Unique-prototype button** — a 16×16 stroke-1.8 outline magnifier next
   to each accordion section. Stroked with `currentColor`, fills `none`.

**Emoji** — the three landing feature cards use 📊⚡🎯, single emoji each,
size 34 px. **Do not introduce emoji elsewhere.**

**No icon font, no Lucide / Heroicons / Material.** If you need an icon
not in this list, draw a minimal stroke-1.8 outline SVG (16/20 px,
`currentColor`, `stroke-linecap: round`, `stroke-linejoin: round`) — that
matches the existing `unique-btn` style and reads correctly inside the
product.

---

## Theme & dark mode

Default theme is **light**. A `[data-theme="dark"]` opt-in palette exists
in `tokens.css` but the toggle is **explicitly hidden in the live product**
(`.theme-toggle { display: none !important; }`). Treat dark mode as a
present-but-unused variant — design for light first.

---

## Caveats & substitutions

- **No web fonts** are shipped. If a design requires a typeface other than
  the host system stack, that is a deliberate departure from the brand.
- **No logo file.** "EGE-trainer" is a wordmark rendered inline as text —
  see `preview/brand-logo.html` for the canonical treatment.
- **No photography**, no illustrated mascots, no hero illustrations.
- The dark theme exists but is **not user-facing** today.
- Landing CSS variables overlap trainer ones (e.g. `--accent` is `#2563eb`
  in both; `--text-muted` only exists in landing). `colors_and_type.css`
  merges both sets.

---

See `SKILL.md` for the Claude Code Agent Skill manifest.
