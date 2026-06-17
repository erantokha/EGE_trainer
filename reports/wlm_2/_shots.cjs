// WLM.2 — скриншоты флаг-контролов (визуальный harness, Level A).
const { chromium } = require('@playwright/test');
const path = require('path');
const url = 'file://' + path.resolve(__dirname, 'flags_harness.html');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 860, height: 760 }, deviceScaleFactor: 2 });
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForSelector('.lesson-flags .lf-btn', { timeout: 10000 });

  // (1) карточка с 4 флаг-кнопками + дропдаун навыка (нейтральная) и карточка с активным флагом
  await p.locator('#runner').screenshot({ path: path.resolve(__dirname, 'shot1_cards.png') });
  console.log('shot1 cards ok');

  // (2) активный флаг + открытое меню навыка (2-я карточка: arith активен, 2 навыка выбраны).
  // Меню position:absolute выходит за bbox карточки → снимаем страницу целиком.
  const card2 = p.locator('.task-card[data-qid="q2"]');
  await card2.locator('.lf-skill-btn').click();
  await p.waitForSelector('.task-card[data-qid="q2"] .lf-skill-menu:not([hidden])');
  await p.waitForTimeout(150);
  await p.screenshot({ path: path.resolve(__dirname, 'shot2_active_and_menu.png'), fullPage: true });
  console.log('shot2 active+menu ok');

  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
