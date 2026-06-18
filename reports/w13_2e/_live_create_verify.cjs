const { chromium } = require('@playwright/test');
const fs=require('fs');const cfg=fs.readFileSync('app/config.js','utf8');
const BASE='https://ege-trainer.ru';
const API=(cfg.match(/url:\s*'(https:\/\/api[^']+)'/)||[])[1];const ANON=(cfg.match(/anonKey:\s*'([^']+)'/)||[])[1];
const T_EMAIL='anton.ermolaev.work@gmail.com', T_PASS='1324qwer2413';
const L=(...a)=>console.log(...a);
const api=async(p,o={},t)=>{const r=await fetch(API+p,{...o,headers:{apikey:ANON,'Content-Type':'application/json',...(t?{Authorization:'Bearer '+t}:{}),...(o.headers||{})}});let b;try{b=await r.json()}catch{b=null}return{status:r.status,body:b}};
(async()=>{
  const browser=await chromium.launch(); const ctx=await browser.newContext({viewport:{width:1440,height:1000}}); const page=await ctx.newPage();
  let token=null;
  try{
    await page.goto(`${BASE}/tasks/auth.html?next=${encodeURIComponent('/home_teacher.html')}`,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.body?.getAttribute('data-auth-ready')==='1',{timeout:25000});
    await page.locator('#loginEmail').fill(T_EMAIL); await page.locator('#loginPass').fill(T_PASS);
    await page.locator('#loginSubmit').click({noWaitAfter:true});
    await page.waitForFunction(()=>{for(const[k,v]of Object.entries(localStorage)){if(k.endsWith('-auth-token')){try{if((JSON.parse(v).currentSession||JSON.parse(v).session||JSON.parse(v)).access_token)return true}catch{}}}return false},{timeout:25000});
    if(!page.url().includes('home_teacher')) await page.goto(`${BASE}/home_teacher.html`,{waitUntil:'domcontentloaded'});
    await page.waitForSelector('#accordion .node.section',{timeout:20000});
    await page.locator('.node.section[data-id="13"] > .row').click().catch(()=>{}); await page.waitForTimeout(600);
    await page.locator('.node.section[data-id="13"] .btn.plus').first().click({timeout:10000}); await page.waitForTimeout(800);
    await page.locator('button:has-text("Создать ДЗ"),a:has-text("Создать ДЗ")').first().click({timeout:10000});
    await page.waitForURL(u=>u.toString().includes('hw_create'),{timeout:25000}).catch(()=>{});
    await page.waitForTimeout(3000);
    // title уже префилл; жмём создать
    await page.locator('#createBtn').click({timeout:10000});
    await page.waitForTimeout(4000);
    // вытащить токен ссылки
    token=await page.evaluate(()=>{ const m=document.body.innerText.match(/hw\.html\?token=([0-9a-f-]{36})/i); if(m)return m[1]; const a=[...document.querySelectorAll('a,input')].map(e=>e.href||e.value||'').join(' '); const m2=a.match(/token=([0-9a-f-]{36})/i); return m2?m2[1]:null; });
    L('создан ДЗ, token:', token);
    await page.screenshot({path:'reports/w13_2e/live_created.png'});
  }catch(e){ L('UI ERROR:', e.message); await page.screenshot({path:'reports/w13_2e/live_create_err.png'}).catch(()=>{}); }
  finally{ await browser.close(); }
  // REST: прочитать frozen_questions
  const tk=(await api('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:T_EMAIL,password:T_PASS})})).body?.access_token;
  if(token){
    const hw=await api('/rest/v1/rpc/get_homework_by_token',{method:'POST',body:JSON.stringify({p_token:token})},tk);
    const fq=(Array.isArray(hw.body)?hw.body[0]:hw.body)?.frozen_questions||[];
    L('frozen_questions:', JSON.stringify(fq).slice(0,300));
    const p2=fq.filter(q=>String(q.question_id||'').startsWith('13.'));
    L('№13 в frozen:', p2.length, '| topic_id-ы:', [...new Set(p2.map(q=>q.topic_id))].join(', '));
    const okTid=p2.every(q=>String(q.topic_id||'').split('.').length>=3); // 13.trig.factor (3 seg), не 13.trig
    L('topic_id = subtopic_id (3+ сегмента, не урезан):', okTid?'PASS ✓':'FAIL ✗');
    // cleanup: удалить тестовую ДЗ
    const links=await api(`/rest/v1/homework_links?token=eq.${token}&select=homework_id`,{},tk);
    const hwId=Array.isArray(links.body)?links.body[0]?.homework_id:null;
    if(hwId){ await api(`/rest/v1/homework_links?homework_id=eq.${hwId}`,{method:'DELETE'},tk); await api(`/rest/v1/homeworks?id=eq.${hwId}`,{method:'DELETE'},tk); L('cleanup: тестовая ДЗ',hwId,'удалена'); }
  } else L('токен не пойман — пропускаю REST-проверку frozen (см. скрин)');
})();
