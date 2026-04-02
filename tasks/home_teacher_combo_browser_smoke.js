/**
 * home_teacher_combo_browser_smoke.js
 *
 * Проверяет CSS/DOM-логику градиентного термометра в поле выбора ученика.
 * Сессия Supabase не нужна — тест чисто CSS/DOM.
 *
 * Что проверяем:
 *  1.  Все DOM-элементы фикстуры на месте
 *  2.  CSS загружен: .ht-combo имеет position:relative
 *  3.  Специфичность выиграна: background-color не transparent (trainer.css не перебил)
 *  4.  appearance:none на инпуте (нужен для градиента)
 *  5.  CSS-переменные устанавливаются и читаются обратно
 *  6.  background-image содержит gradient после установки переменных
 *  7.  background-image:none когда aria-expanded="true" (поиск)
 *  8.  .ht-combo-score скрыт по умолчанию (display:none)
 *  9.  .ht-combo-score виден после .is-visible (display:flex)
 * 10.  Opacity score = 0 когда dropdown открыт (aria-expanded="true")
 * 11.  padding-right инпута ≥ 100px когда .has-score на комбо
 * 12.  .ht-combo-clear не hidden → padding-right инпута ≥ 30px
 * 13.  Сброс: CSS-переменные удаляются, классы снимаются корректно
 */

// ── DOM-узлы UI смока ─────────────────────────────────────────────────────────
const runBtn      = document.getElementById('runBtn');
const summaryEl   = document.getElementById('summary');
const resultsBody = document.getElementById('resultsBody');
const traceLog    = document.getElementById('traceLog');

// ── DOM-узлы фикстуры ─────────────────────────────────────────────────────────
const combo   = document.getElementById('fixtureCombo');
const input   = document.getElementById('fixtureInput');
const clear   = document.getElementById('fixtureClear');
const score   = document.getElementById('fixtureScore');
const scoreS  = document.getElementById('fixtureScoreSecondary');
const scoreP  = document.getElementById('fixtureScorePrimary');

// ── helpers ───────────────────────────────────────────────────────────────────
function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function pill(status) {
  const cls =
    status === 'OK'   ? 'status-ok'   :
    status === 'FAIL' ? 'status-fail' :
    status === 'WARN' ? 'status-warn' : 'status-running';
  return `<span class="status-pill ${cls}">${esc(status)}</span>`;
}

function setSummary(text, status) {
  summaryEl.textContent = text;
  summaryEl.className = 'summary';
  if (status === 'ok')   summaryEl.classList.add('status-ok');
  if (status === 'fail') summaryEl.classList.add('status-fail');
  if (status === 'warn') summaryEl.classList.add('status-warn');
}

/** Сокращение для getComputedStyle */
function cs(el) { return window.getComputedStyle(el); }

// ── сброс фикстуры в базовое состояние ───────────────────────────────────────
function resetFixture() {
  combo.classList.remove('has-score');
  score.classList.remove('is-visible');
  input.setAttribute('aria-expanded', 'false');
  input.style.removeProperty('--combo-fill-pct');
  input.style.removeProperty('--combo-fill-color');
  clear.hidden = true;
}

// ── накопители результатов ───────────────────────────────────────────────────
const rows  = [];
const trace = [];

/**
 * Запускает одну проверку.
 * fn() должна вернуть:
 *   true              → OK
 *   { ok, details }   → OK/FAIL по флагу
 *   { warn, details } → WARN
 */
function check(id, name, fn) {
  let status  = 'FAIL';
  let details = '';
  try {
    const r = fn();
    if (r === true) {
      status = 'OK'; details = 'passed';
    } else if (r && typeof r === 'object') {
      if (r.warn)       { status = 'WARN'; details = r.details ?? ''; }
      else if (r.ok)    { status = 'OK';   details = r.details ?? ''; }
      else              { status = 'FAIL'; details = r.details ?? ''; }
    } else {
      status = 'FAIL'; details = String(r);
    }
  } catch (e) {
    status = 'FAIL'; details = String(e?.message || e);
  }
  rows.push({ id, name, status, details });
  trace.push(`[${status.padEnd(4)}] #${id} ${name} — ${details}`);
}

function renderResults() {
  resultsBody.innerHTML = rows.map(r =>
    `<tr>
       <td>${esc(r.id)}</td>
       <td>${esc(r.name)}</td>
       <td>${pill(r.status)}</td>
       <td>${esc(r.details)}</td>
     </tr>`
  ).join('');
  traceLog.textContent = trace.join('\n');

  const fails = rows.filter(r => r.status === 'FAIL').length;
  const warns = rows.filter(r => r.status === 'WARN').length;
  if (fails > 0)      setSummary(`${fails} FAIL, ${warns} WARN из ${rows.length}`, 'fail');
  else if (warns > 0) setSummary(`Все OK (${warns} WARN) из ${rows.length}`, 'warn');
  else                setSummary(`Все ${rows.length} OK`, 'ok');
}

// ── основной прогон ──────────────────────────────────────────────────────────
async function run() {
  runBtn.disabled = true;
  setSummary('Запуск…');
  rows.length  = 0;
  trace.length = 0;

  // Ждём один тик, чтобы CSS-файлы точно распарсились после вставки скрипта.
  await new Promise(r => setTimeout(r, 100));

  resetFixture();

  // ── 1. Все DOM-элементы фикстуры присутствуют ────────────────────────────
  check(1, 'fixture elements present', () => {
    const map = { combo, input, clear, score, scoreS, scoreP };
    const missing = Object.entries(map).filter(([, el]) => !el).map(([k]) => k);
    if (missing.length) return { ok: false, details: `missing: ${missing.join(', ')}` };
    return true;
  });

  // ── 2. CSS загружен: .ht-combo имеет position:relative ───────────────────
  check(2, 'CSS loaded — .ht-combo position:relative', () => {
    const pos = cs(combo).position;
    return pos === 'relative'
      ? { ok: true, details: 'position=relative' }
      : { ok: false, details: `position=${pos} — home_teacher.layout.css может не загружен` };
  });

  // ── 3. background-color не transparent (наша специфичность (0,2,1) > trainer.css (0,1,1)) ──
  check(3, 'specificity win — background-color not transparent', () => {
    const bg = cs(input).backgroundColor;
    const isTransparent = bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent';
    return isTransparent
      ? { ok: false, details: `backgroundColor=${bg} — trainer.css перебивает наш selector, gradient не будет работать` }
      : { ok: true,  details: `backgroundColor=${bg}` };
  });

  // ── 4. appearance:none (нужен чтобы браузер не рисовал native-стиль поверх градиента) ──
  check(4, 'input appearance:none', () => {
    const app = cs(input).webkitAppearance ?? cs(input).appearance ?? 'n/a';
    return app === 'none'
      ? { ok: true,  details: `appearance=${app}` }
      : { ok: false, details: `appearance=${app} — ожидается none, иначе gradient может быть скрыт на Windows/Chrome` };
  });

  // ── 5. CSS-переменные устанавливаются и читаются обратно ─────────────────
  check(5, 'CSS custom properties set & read back', () => {
    input.style.setProperty('--combo-fill-pct',   '50%');
    input.style.setProperty('--combo-fill-color',  'rgba(245,158,11,0.32)');
    const pct   = input.style.getPropertyValue('--combo-fill-pct').trim();
    const color = input.style.getPropertyValue('--combo-fill-color').trim();
    if (pct !== '50%')
      return { ok: false, details: `--combo-fill-pct: got "${pct}", expected "50%"` };
    if (!color.includes('245'))
      return { ok: false, details: `--combo-fill-color: got "${color}"` };
    return { ok: true, details: `pct=${pct}  color=${color}` };
  });

  // ── 6. background-image содержит gradient после установки переменных ──────
  // Переменные уже установлены в check 5.
  check(6, 'background-image contains gradient after vars set', () => {
    const bgi = cs(input).backgroundImage;
    // Браузеры либо разворачивают var() → computed gradient,
    // либо возвращают строку с 'var(', либо оставляют строку с 'linear-gradient'.
    // В любом случае если trainer.css не перебил — значение не будет просто 'none'.
    if (bgi === 'none' || bgi === '')
      return { ok: false, details: `backgroundImage="${bgi}" — gradient не применился (specificity bug или CSS не загружен)` };
    const hasGradient = bgi.includes('gradient') || bgi.includes('var(');
    return hasGradient
      ? { ok: true,  details: bgi.slice(0, 120) }
      : { ok: false, details: `неожиданное значение: ${bgi.slice(0, 120)}` };
  });

  // ── 7. background-image:none когда aria-expanded="true" (открытый дропдаун) ──
  check(7, 'background-image:none when aria-expanded=true', () => {
    input.setAttribute('aria-expanded', 'true');
    const bgi = cs(input).backgroundImage;
    input.setAttribute('aria-expanded', 'false');
    return bgi === 'none'
      ? { ok: true,  details: 'backgroundImage=none ✓' }
      : { ok: false, details: `backgroundImage="${bgi.slice(0, 80)}" — ожидается none при открытом дропдауне` };
  });

  resetFixture(); // сброс переменных перед проверками score

  // ── 8. Score скрыт по умолчанию ──────────────────────────────────────────
  check(8, '.ht-combo-score hidden by default (display:none)', () => {
    const d = cs(score).display;
    return d === 'none'
      ? { ok: true,  details: 'display=none ✓' }
      : { ok: false, details: `display=${d} — должен быть none без класса is-visible` };
  });

  // ── 9. Score виден после .is-visible ─────────────────────────────────────
  check(9, '.ht-combo-score visible after .is-visible (display:flex)', () => {
    score.classList.add('is-visible');
    const d = cs(score).display;
    score.classList.remove('is-visible');
    return d === 'flex'
      ? { ok: true,  details: 'display=flex ✓' }
      : { ok: false, details: `display=${d} — ожидается flex` };
  });

  // ── 10. Opacity score = 0 когда dropdown открыт ──────────────────────────
  // CSS-правило применяет transition:opacity 100ms.
  // Нужно: сначала триггерим переход → форсируем reflow → ждём 150ms → читаем.
  score.classList.add('is-visible');
  input.setAttribute('aria-expanded', 'true');
  void score.offsetWidth; // форсируем reflow — браузер фиксирует начало перехода
  await new Promise(r => setTimeout(r, 150)); // ждём окончания transition (100ms + запас)
  check(10, 'score opacity:0 when aria-expanded=true (after 150ms transition)', () => {
    const op = cs(score).opacity;
    score.classList.remove('is-visible');
    input.setAttribute('aria-expanded', 'false');
    return op === '0'
      ? { ok: true,  details: 'opacity=0 ✓ (после 150ms)' }
      : { ok: false, details: `opacity=${op} — ожидается 0 при aria-expanded=true` };
  });

  // ── 11. padding-right ≥ 100px когда .has-score на комбо ─────────────────
  check(11, 'padding-right ≥ 100px with .has-score (not expanded)', () => {
    const padBaseline = parseFloat(cs(input).paddingRight);
    combo.classList.add('has-score');
    score.classList.add('is-visible');
    // aria-expanded=false — условие в CSS :not([aria-expanded="true"])
    input.setAttribute('aria-expanded', 'false');
    const padWithScore = parseFloat(cs(input).paddingRight);
    combo.classList.remove('has-score');
    score.classList.remove('is-visible');
    return padWithScore >= 100
      ? { ok: true,  details: `paddingRight: ${padBaseline}px → ${padWithScore}px ✓` }
      : { ok: false, details: `paddingRight=${padWithScore}px < 100px (ожидается ≥100px с .has-score)` };
  });

  // ── 12. :has(> .ht-combo-clear:not([hidden])) → padding-right ≥ 30px ────
  // CSS :has() — Chrome 105+, Firefox 121+. Старые браузеры → WARN.
  check(12, 'clear visible → input padding-right ≥ 30px (:has rule)', () => {
    clear.hidden = false;
    const pad = parseFloat(cs(input).paddingRight);
    clear.hidden = true;
    if (pad >= 30)
      return { ok: true,  details: `paddingRight=${pad}px ✓` };
    if (pad <= 12)
      // Скорее всего браузер не поддерживает :has() → предупреждение, не падение
      return { warn: true, details: `:has() может не поддерживаться (paddingRight=${pad}px)` };
    return { ok: false, details: `paddingRight=${pad}px — ожидается ≥30px когда кнопка × видима` };
  });

  // ── 13. Сброс: переменные и классы удаляются корректно ───────────────────
  check(13, 'reset clears CSS vars and classes', () => {
    // Устанавливаем всё что можно
    input.style.setProperty('--combo-fill-pct',   '75%');
    input.style.setProperty('--combo-fill-color',  'rgba(16,185,129,.26)');
    combo.classList.add('has-score');
    score.classList.add('is-visible');
    input.setAttribute('aria-expanded', 'true');
    clear.hidden = false;

    // Сбрасываем (имитируем ту же логику что в blur-хендлере picker.js)
    resetFixture();

    const pct   = input.style.getPropertyValue('--combo-fill-pct');
    const color = input.style.getPropertyValue('--combo-fill-color');
    const hasScore    = combo.classList.contains('has-score');
    const isVisible   = score.classList.contains('is-visible');
    const expanded    = input.getAttribute('aria-expanded');
    const clearHidden = clear.hidden;

    const problems = [];
    if (pct)         problems.push(`--combo-fill-pct не удалена ("${pct}")`);
    if (color)       problems.push(`--combo-fill-color не удалена`);
    if (hasScore)    problems.push(`.has-score осталась на combo`);
    if (isVisible)   problems.push(`.is-visible осталась на score`);
    if (expanded !== 'false') problems.push(`aria-expanded="${expanded}" (ожидается false)`);
    if (!clearHidden) problems.push(`кнопка × не скрыта`);

    return problems.length === 0
      ? { ok: true, details: 'все состояния сброшены корректно' }
      : { ok: false, details: problems.join('; ') };
  });

  renderResults();
  runBtn.disabled = false;
}

runBtn.addEventListener('click', run);
