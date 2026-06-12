const { test, expect } = require('@playwright/test');
const { assertRoleHome } = require('../helpers/auth.cjs');

const SCREEN_RPC = '/rest/v1/rpc/teacher_picking_screen_v2';

test.describe('WTP.1 — teacher screen prewarm', () => {
  test('prewarms first min(10, N) students and reuses cache on first selection', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });

    await page.addInitScript(() => {
      sessionStorage.removeItem('teacher_selected_student_v1');
      sessionStorage.setItem('teacher_pick_filter_id_v2', 'weak_spots');
    });

    const active = new Map();
    const completedByStudent = new Map();
    const filtersByStudent = new Map();
    let concurrent = 0;
    let maxConcurrent = 0;

    page.on('request', (request) => {
      if (!request.url().includes(SCREEN_RPC)) return;
      const body = request.postDataJSON();
      if (body?.p_mode !== 'init') return;
      const sid = String(body?.p_student_id || '');
      active.set(request, sid);
      filtersByStudent.set(sid, body?.p_filter_id || null);
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
    });

    const finishRequest = (request) => {
      const sid = active.get(request);
      if (!sid) return;
      active.delete(request);
      concurrent -= 1;
      completedByStudent.set(sid, (completedByStudent.get(sid) || 0) + 1);
    };
    page.on('requestfinished', finishRequest);
    page.on('requestfailed', finishRequest);

    await page.goto('/home_teacher.html', { waitUntil: 'domcontentloaded' });
    await assertRoleHome(page, 'teacher');

    await page.waitForFunction(() => {
      const select = document.getElementById('teacherStudentSelect');
      return !!select && Array.from(select.options).some((option) => option.value);
    }, null, { timeout: 25_000 });

    const firstStudentIds = await page.locator('#teacherStudentSelect option[value]:not([value=""])')
      .evaluateAll((options) => options.slice(0, 10).map((option) => option.value));

    expect(firstStudentIds.length, 'E2E teacher must have at least one student').toBeGreaterThan(0);

    await expect.poll(
      () => firstStudentIds.filter((sid) => completedByStudent.has(sid)).length,
      { timeout: 60_000 },
    ).toBe(firstStudentIds.length);

    const completedIds = Array.from(completedByStudent.keys());
    expect(completedIds.length).toBeLessThanOrEqual(10);
    expect(completedIds.every((sid) => firstStudentIds.includes(sid))).toBe(true);
    expect(completedIds.every((sid) => filtersByStudent.get(sid) === 'weak_spots')).toBe(true);
    expect(maxConcurrent).toBeLessThanOrEqual(2);

    const firstId = firstStudentIds[0];
    const callsBeforeSelection = completedByStudent.get(firstId);
    const selectionStartedAt = Date.now();
    await page.evaluate((studentId) => {
      const select = document.getElementById('teacherStudentSelect');
      select.value = studentId;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }, firstId);

    await page.waitForFunction(() => {
      const inView = document.body.classList.contains('teacher-student-view');
      const loading = document.body.classList.contains('home-stats-loading');
      const note = document.getElementById('sfNote');
      const score = document.getElementById('studentComboScore');
      return inView && !loading && (
        (!!note && note.hidden === false)
        || (!!score && score.classList.contains('is-visible'))
      );
    }, null, { timeout: 10_000 });

    await page.waitForTimeout(500);
    expect(Date.now() - selectionStartedAt).toBeLessThan(1_000);
    expect(completedByStudent.get(firstId)).toBe(callsBeforeSelection);
  });
});
