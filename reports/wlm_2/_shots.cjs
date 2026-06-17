// WLM.2.1 — скриншоты: новые иконки + тултип, тулбар в рисовалке, кнопка «Очистить конспект».
const { chromium } = require('@playwright/test');
const path = require('path');
const url = 'file://' + path.resolve(__dirname, 'flags_harness.html');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 2 });
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForSelector('.lesson-flags .lf-btn svg', { timeout: 10000 });

  // (1) карточки: новые иконки + активный флаг + наведённый тултип на первой иконке 1-й карточки
  await p.locator('.task-card[data-qid="q1"] .lf-btn[data-flag="clean"]').hover();
  await p.waitForTimeout(250);
  await p.locator('#runner').screenshot({ path: path.resolve(__dirname, 'shot1_cards_icons_tip.png') });
  console.log('shot1 ok');

  // (2) панель рисовалки: масштаб 150% + тулбар флагов справа
  await p.locator('.dro-focus-bar').screenshot({ path: path.resolve(__dirname, 'shot2_focusbar_toolbar.png') });
  console.log('shot2 ok');

  // (3) полоса режима занятия с кнопкой «Очистить конспект»
  await p.locator('.lesson-bar').screenshot({ path: path.resolve(__dirname, 'shot3_lessonbar_clear.png') });
  console.log('shot3 ok');

  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
