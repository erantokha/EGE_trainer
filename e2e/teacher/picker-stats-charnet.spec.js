// e2e/teacher/picker-stats-charnet.spec.js
// W2 · Шаг 0 — characterization режима «учитель смотрит ученика» (home_teacher.html).
//
// Пинит ТЕКУЩИЙ отрендеренный вывод домашней статистики в teacher-student-view
// через applyTeacherPickingHomeStats (picker.js). Это ОТДЕЛЬНЫЙ golden — он НЕ
// сравнивается со student-режимом (per-node DOM законно различается). См. план §5.4.
//
// Выбор ученика воспроизводит commit() из home_teacher.html: ставит value
// скрытому <select id="teacherStudentSelect"> и диспатчит 'change' →
// wireTeacherStudentSelect → applyTeacherStudentView → loadTeacherStudentStats
// → applyTeacherPickingHomeStats.
//
// Fallback (§5.4 / stop-ask 10a): если у E2E_TEACHER нет выбираемого ученика —
// спека падает с явным сообщением (нужно решение оператора: засидить ученика).
// Оператор подтвердил (2026-05-29), что аккаунт засижен → ожидается непустой снимок.

const { test, expect } = require('@playwright/test');
const { assertRoleHome } = require('../helpers/auth.cjs');
const { snapshotStatsDom } = require('../helpers/stats-snapshot.cjs');

// NB: data-auth-ready выставляет только tasks/auth.js (auth-страница); на home
// его нет. Готовность гейтим через assertRoleHome + signed-in render-сигналы ниже.

test.describe('W2.step0 — picker stats characterization (teacher viewing student)', () => {
  test('charnet: home_teacher stats DOM fingerprint (student selected)', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/home_teacher.html', { waitUntil: 'domcontentloaded' });
    await assertRoleHome(page, 'teacher');

    // Аккордеон отрисован → CATALOG загружен (иначе applyTeacherStudentView
    // отложит view до catalog-ready). Ждём перед выбором ученика.
    await expect(page.locator('#accordion .node.section').first()).toBeVisible({ timeout: 20_000 });

    // Ждём, пока refreshTeacherStudentSelect наполнит скрытый select реальным учеником.
    await page
      .waitForFunction(() => {
        const sel = document.getElementById('teacherStudentSelect');
        return !!sel && Array.from(sel.options).some((o) => o.value);
      }, null, { timeout: 25_000 })
      .catch(() => {});

    // Программно выбираем первого доступного ученика (повтор commit()).
    const selection = await page.evaluate(() => {
      const sel = document.getElementById('teacherStudentSelect');
      if (!sel) return null;
      const opt = Array.from(sel.options).find((o) => o.value);
      if (!opt) return null;
      sel.value = opt.value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return { value: opt.value, label: opt.text, optionCount: sel.options.length };
    });

    // Fallback / stop-ask 10a: нет выбираемого ученика.
    expect(
      selection,
      'STOP-ASK §5.4/10a: у E2E_TEACHER нет выбираемого ученика в #teacherStudentSelect. ' +
        'Нужно решение оператора — засидить ученика с попытками либо принять no-data baseline.',
    ).not.toBeNull();

    console.log(`CHARNET_TEACHER_SELECTED student=${selection.value} label="${selection.label}" options=${selection.optionCount}`);

    // Ждём teacher-student-view рендер: режим включён, скелетон снят,
    // signed-in вывод применён (forecast note раскрыт ИЛИ термометр виден).
    await page.waitForFunction(() => {
      const inView = document.body.classList.contains('teacher-student-view');
      const loading = document.body.classList.contains('home-stats-loading');
      const note = document.getElementById('sfNote');
      const noteReady = !!note && note.hidden === false;
      const score = document.getElementById('studentComboScore');
      const scoreVisible = !!score && score.classList.contains('is-visible');
      return inView && !loading && (noteReady || scoreVisible);
    }, null, { timeout: 30_000 });

    const { fingerprint, raw } = await snapshotStatsDom(page);

    // raw-дамп (немаскированный) — для глаз в отчёте, НЕ для golden.
    console.log('=== CHARNET_RAW_TEACHER_BEGIN ===');
    console.log(JSON.stringify(raw, null, 2));
    console.log('=== CHARNET_RAW_TEACHER_END ===');

    // Sanity: teacher-combo термометр присутствует, forecast-узел есть.
    expect(raw.thermo.present, 'thermo (teacher-combo) must exist on home_teacher').toBe(true);
    expect(raw.forecast.present, '#scoreForecast must exist on home_teacher').toBe(true);

    expect(fingerprint).toMatchSnapshot('picker-stats-teacher-viewing-student.txt');
  });
});
