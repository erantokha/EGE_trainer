const { chromium } = require('@playwright/test');
const BASE='https://ege-trainer.ru';
const T_EMAIL='anton.ermolaev.work@gmail.com', T_PASS='1324qwer2413';
const L=(...a)=>console.log(...a);
(async()=>{
  const browser=await chromium.launch();
  const ctx=await browser.newContext({viewport:{width:1440,height:1000}});
  const page=await ctx.newPage();
  try{
    // login
    await page.goto(`${BASE}/tasks/auth.html?next=${encodeURIComponent('/home_teacher.html')}`,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.body?.getAttribute('data-auth-ready')==='1',{timeout:25000});
    await page.locator('#loginEmail').fill(T_EMAIL);
    await page.locator('#loginPass').fill(T_PASS);
    await page.locator('#loginSubmit').click({noWaitAfter:true});
    await page.waitForFunction(()=>{for(const[k,v]of Object.entries(localStorage)){if(k.endsWith('-auth-token')&&v){try{if((JSON.parse(v).currentSession||JSON.parse(v).session||JSON.parse(v)).access_token)return true}catch{}}}return false},{timeout:25000});
    await page.waitForURL(u=>u.toString().includes('home_teacher'),{timeout:25000}).catch(()=>{});
    if(!page.url().includes('home_teacher')) await page.goto(`${BASE}/home_teacher.html`,{waitUntil:'domcontentloaded'});
    L('login ok, on', page.url());
    // выбрать ученика (для teacher-ДЗ-флоу)
    await page.locator('#studentComboInput').fill('Ермолаев').catch(()=>{});
    await page.waitForTimeout(1000);
    await page.locator('#studentComboList *').filter({hasText:'Ермолаев'}).first().click().catch(()=>L('  (student combo click skipped)'));
    await page.waitForTimeout(1500);
    // аккордеон + секция 13
    await page.waitForSelector('#accordion .node.section',{timeout:20000});
    const has13=await page.locator('.node.section[data-id="13"]').count();
    L('секция №13 в аккордеоне:', has13);
    await page.screenshot({path:'reports/w13_2e/live_home_accordion.png'});
    // развернуть №13 и нажать "+"
    await page.locator('.node.section[data-id="13"] > .row').click().catch(()=>{});
    await page.waitForTimeout(600);
    const plus=page.locator('.node.section[data-id="13"] > .row .btn.plus, .node.section[data-id="13"] .btn.plus').first();
    await plus.click({timeout:10000});
    L('«+» на №13 нажат');
    await page.waitForTimeout(800);
    // Создать ДЗ
    await page.locator('button:has-text("Создать ДЗ"), a:has-text("Создать ДЗ")').first().click({timeout:10000});
    await page.waitForURL(u=>u.toString().includes('hw_create'),{timeout:25000}).catch(()=>{});
    await page.waitForTimeout(3500);
    L('после «Создать ДЗ», url:', page.url());
    const info=await page.evaluate(()=>{
      const txt=document.body.innerText;
      const empty=/нет ни одного задания|Добавь хотя бы одну/i.test(txt);
      // подборка «Добавленные задачи»
      const cont=document.querySelector('#fixedList')||document.querySelector('[id*="fixed"]')||document.querySelector('[class*="added"]');
      const cards=cont?cont.querySelectorAll(':scope > *').length:0;
      const allCards=document.querySelectorAll('[class*="fixed-card"],[class*="added-card"],[class*="task-card"]').length;
      return {url:location.href, emptyMsg:empty, contId:cont?.id||cont?.className||null, contChildren:cards, cardLike:allCards};
    });
    L('hw_create подборка:', JSON.stringify(info));
    await page.screenshot({path:'reports/w13_2e/live_constructor.png', fullPage:true});
    L('скрин: reports/w13_2e/live_constructor.png');
  }catch(e){ L('ERROR:', e.message); await page.screenshot({path:'reports/w13_2e/live_error.png'}).catch(()=>{}); }
  finally{ await browser.close(); }
})();
