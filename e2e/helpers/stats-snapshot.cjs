// e2e/helpers/stats-snapshot.cjs
// W2 · Шаг 0 — детерминированный сериализатор stats-DOM picker.js.
//
// Назначение: снять нормализованный fingerprint домашней статистики
// (аккордеон секций/подтем + бейджи + score-forecast + teacher-термометр)
// так, чтобы он пинил ЛОГИКУ отображения (data→DOM), терпя дрейф конкретных
// чисел/дат на живом backend'е.
//
// Что пинится verbatim (это дискретизированный сигнал data→DOM, его обязан
// воспроизвести любой будущий рефактор picker_common.js / picker_stats.js):
//   - набор узлов аккордеона (тип section/topic + id), отсортированный по id;
//   - наличие каждого бейджа (last10 / coverage);
//   - ЦВЕТ-КЛАСС бейджа (gray/red/yellow/lime/green) — выход badgeClassByPct;
//   - наличие/имя цвет-класса термометра (reverse-map из COLOR_MAP picker.js);
//   - recommendation-классы на заголовке (stat-chip / stat-red|yellow|lime);
//   - hidden-флаг score-forecast note, visible-флаг термометра;
//   - текст заголовков узлов (это статичный catalog-контент, не per-attempt).
//
// Что маскируется (волатильно — живые числа/даты):
//   - тексты бейджей <b>/.small (`87%`, `4/5`) и data-tip-тултипы;
//   - значения forecast (`5,42`, `27`, note) и термометра (`5 перв.`);
//   - даты последней попытки (fmtDateTimeRu → `dd.mm.yyyy, hh:mm`).
// Цифры → `<N>`, даты → `<DATE>`. Маскирование дат идёт ДО цифр.
//
// Функция возвращает { fingerprint, raw }:
//   - fingerprint — pretty-JSON-строка (маскированная, отсортированная) для toMatchSnapshot;
//   - raw — немаскированная структура (реальные числа/даты) ДЛЯ ГЛАЗ в отчёте, НЕ для golden.

const BADGE_COLOR_CLASSES = ['gray', 'red', 'yellow', 'lime', 'green'];
const STAT_TITLE_CLASSES = ['stat-chip', 'stat-red', 'stat-yellow', 'stat-lime', 'stat-green', 'stat-gray'];

// Обратная карта rgba → имя цвета термометра. Значения скопированы из COLOR_MAP
// в updateScoreThermo (tasks/picker.js). Inline custom-property хранится as-authored,
// поэтому сравнение по точной строке надёжно. Если picker.js поменяет rgba —
// fingerprint флипнется (это желаемо: характеризация поймает смену логики цвета).
const THERMO_COLOR_BY_RGBA = {
  'rgba(148,163,184,.20)': 'gray',
  'rgba(239,68,68,.28)': 'red',
  'rgba(245,158,11,.32)': 'yellow',
  'rgba(132,204,22,.28)': 'lime',
  'rgba(16,185,129,.26)': 'green',
};

function maskDates(input) {
  return String(input)
    // ru date-time: dd.mm.yyyy[, hh:mm[:ss]]
    .replace(/\d{1,2}\.\d{1,2}\.\d{2,4}(?:,?\s*\d{1,2}:\d{2}(?::\d{2})?)?/g, '<DATE>')
    // ISO date[-time]
    .replace(/\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?/g, '<DATE>');
}

function maskNumbers(input) {
  // Любая последовательность цифр с возможными десятичными разделителями → <N>.
  return String(input).replace(/\d+(?:[.,]\d+)*/g, '<N>');
}

// tpl: применяется к волатильным текстовым полям (даты → числа, именно в этом порядке).
function tpl(value) {
  if (value === null || value === undefined) return null;
  return maskNumbers(maskDates(String(value).trim()));
}

// Натуральная (numeric-aware) сортировка id: "2" < "10", "1.2" < "1.10".
function byId(a, b) {
  return String(a.id).localeCompare(String(b.id), undefined, { numeric: true, sensitivity: 'base' });
}

function thermoColorName(rgba) {
  if (!rgba) return null;
  const key = String(rgba).trim();
  return THERMO_COLOR_BY_RGBA[key] || `other:${key}`;
}

function normalizeBadge(badge) {
  if (!badge) return null;
  return {
    color: badge.color,
    value: tpl(badge.value),
    small: tpl(badge.small),
    tip: tpl(badge.tip),
  };
}

function normalizeNode(node) {
  return {
    id: node.id,
    titleText: node.title ? node.title.text : null,
    titleStat: node.title ? node.title.statClasses : [],
    last10: normalizeBadge(node.last10),
    ...(Object.prototype.hasOwnProperty.call(node, 'coverage')
      ? { coverage: normalizeBadge(node.coverage) }
      : {}),
  };
}

function normalize(raw) {
  const sections = (raw.sections || []).slice().sort(byId).map(normalizeNode);
  const topics = (raw.topics || []).slice().sort(byId).map(normalizeNode);

  const forecast = raw.forecast
    ? {
        present: raw.forecast.present,
        primary: tpl(raw.forecast.primary),
        secondary: tpl(raw.forecast.secondary),
        noteHidden: raw.forecast.noteHidden,
        note: tpl(raw.forecast.note),
      }
    : null;

  const thermo = raw.thermo && raw.thermo.present
    ? {
        present: true,
        scoreVisible: raw.thermo.scoreVisible,
        comboHasScore: raw.thermo.comboHasScore,
        primary: tpl(raw.thermo.primary),
        secondary: tpl(raw.thermo.secondary),
        fillColor: thermoColorName(raw.thermo.fillColor),
        fillPct: tpl(raw.thermo.fillPct),
      }
    : { present: false };

  return {
    counts: { sections: sections.length, topics: topics.length },
    sections,
    topics,
    forecast,
    thermo,
  };
}

// Извлечение сырого stats-DOM (без маскирования) в браузере.
async function extractRaw(page) {
  return page.evaluate((args) => {
    const { colorClasses, statClasses } = args;

    const colorOf = (el) => {
      if (!el) return null;
      for (const c of colorClasses) {
        if (el.classList.contains(c)) return c;
      }
      return null;
    };
    const statOf = (el) => {
      if (!el) return [];
      return statClasses.filter((c) => el.classList.contains(c));
    };
    const txt = (el) => (el ? String(el.textContent || '').trim() : null);
    const tipOf = (el) => {
      if (!el) return null;
      const dt = el.getAttribute('data-tip');
      if (dt !== null) return dt;
      return el.getAttribute('title');
    };
    const badgeOf = (el) => {
      if (!el) return null;
      return {
        color: colorOf(el),
        value: txt(el.querySelector('b')),
        small: txt(el.querySelector('.small')),
        tip: tipOf(el),
      };
    };

    const sections = Array.from(document.querySelectorAll('#accordion .node.section')).map((node) => {
      const title = node.querySelector('.section-title');
      return {
        id: String(node.dataset.id || '').trim(),
        title: { text: txt(title), statClasses: statOf(title) },
        last10: badgeOf(node.querySelector('.home-last10-badge')),
        coverage: badgeOf(node.querySelector('.home-coverage-badge')),
      };
    });

    const topics = Array.from(document.querySelectorAll('#accordion .node.topic')).map((node) => {
      const title = node.querySelector('.title');
      return {
        id: String(node.dataset.id || '').trim(),
        title: { text: txt(title), statClasses: statOf(title) },
        last10: badgeOf(node.querySelector('.home-last10-badge')),
      };
    });

    const sf = document.getElementById('scoreForecast');
    const sfNote = document.getElementById('sfNote');
    const forecast = {
      present: !!sf,
      primary: txt(document.getElementById('sfPrimaryExact')),
      secondary: txt(document.getElementById('sfSecondary')),
      noteHidden: sfNote ? !!sfNote.hidden : null,
      note: txt(sfNote),
    };

    const comboInput = document.getElementById('studentComboInput');
    const comboScore = document.getElementById('studentComboScore');
    const combo = document.getElementById('studentCombo');
    const thermo = comboInput
      ? {
          present: true,
          scoreVisible: comboScore ? comboScore.classList.contains('is-visible') : false,
          comboHasScore: combo ? combo.classList.contains('has-score') : false,
          primary: txt(document.getElementById('comboScorePrimary')),
          secondary: txt(document.getElementById('comboScoreSecondary')),
          fillColor: (comboInput.style.getPropertyValue('--combo-fill-color') || '').trim() || null,
          fillPct: (comboInput.style.getPropertyValue('--combo-fill-pct') || '').trim() || null,
        }
      : { present: false };

    return { sections, topics, forecast, thermo };
  }, { colorClasses: BADGE_COLOR_CLASSES, statClasses: STAT_TITLE_CLASSES });
}

/**
 * Снимает детерминированный fingerprint stats-DOM.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ fingerprint: string, raw: object }>}
 */
async function snapshotStatsDom(page) {
  const raw = await extractRaw(page);
  const normalized = normalize(raw);
  const fingerprint = JSON.stringify(normalized, null, 2);
  return { fingerprint, raw };
}

module.exports = {
  snapshotStatsDom,
  // экспортируем внутренности для возможных unit-проверок маскирования
  maskDates,
  maskNumbers,
  tpl,
  normalize,
  BADGE_COLOR_CLASSES,
  STAT_TITLE_CLASSES,
};
