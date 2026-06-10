// Capture tasks/trainer.html (student) via home_student → "Выбрать все" → "Начать" → trainer?session.
// Viewport screenshots (fullPage:false) + hscroll + pill/burger/right diagnostics. mob+desk.
const fs = require('fs');
const { chromium } = require('@playwright/test');
function loadEnv(p){const o={};for(const l of fs.readFileSync(p,'utf8').split('\n')){const i=l.indexOf('=');if(i<0||l.trim().startsWith('#'))continue;let v=l.slice(i+1).trim();if((v[0]==='"'&&v.endsWith('"'))||(v[0]==="'"&&v.endsWith("'")))v=v.slice(1,-1);o[l.slice(0,i).trim()]=v;}return o;}
const BASE='http://127.0.0.1:8000';const s=ms=>new Promise(r=>setTimeout(r,ms));
async function login(p,e,pw){await p.goto(BASE+'/tasks/auth.html?next='+encodeURIComponent('/home_student.html'),{waitUntil:'domcontentloaded',timeout:30000});await p.locator('#loginForm').waitFor({timeout:15000});await p.locator('#loginEmail').fill(e);await p.locator('#loginPass').fill(pw);await p.locator('#loginSubmit').click();const dl=Date.now()+30000;let k=null;while(Date.now()<dl&&!k){k=await p.evaluate(()=>{for(const[kk,v]of Object.entries(localStorage)){if(kk.endsWith('-auth-token')&&v){try{const x=JSON.parse(v);const ss=x?.currentSession||x?.session||x;if(ss?.access_token)return kk;}catch(_){}}}return null;}).catch(()=>null);if(!k)await s(400);}}
(async()=>{const env=loadEnv('.env.local');const b=await chromium.launch();
for(const[w,h,tag]of[[1366,900,'desk'],[390,844,'mob']]){
  const c=await b.newContext({viewport:{width:w,height:h}});const p=await c.newPage();const errs=[];
  p.on('pageerror',e=>errs.push(e.message.slice(0,80)));
  await login(p,env.E2E_STUDENT_EMAIL,env.E2E_STUDENT_PASSWORD);
  await p.goto(BASE+'/home_student.html',{waitUntil:'domcontentloaded',timeout:30000});
  await p.waitForSelector('#accordion .node.section',{timeout:20000}).catch(()=>{});
  await s(2500);
  // Выбрать все → enables Начать
  await p.evaluate(()=>{const b=document.getElementById('bulkPickAll');if(b)b.click();}).catch(()=>{});
  await s(2500);
  await p.evaluate(()=>{const st=document.getElementById('start');if(st&&!st.disabled)st.click();}).catch(()=>{});
  await p.waitForFunction(()=>/trainer\.html/.test(location.pathname),null,{timeout:15000}).catch(()=>{});
  await s(3500);
  const ov=await p.evaluate(()=>{const de=document.documentElement;const info=s=>{const el=document.querySelector(s);if(!el)return 'absent';const cs=getComputedStyle(el);const r=el.getBoundingClientRect();return `disp=${cs.display} rect=${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)}x${Math.round(r.height)}`;};return{path:location.pathname,search:location.search.slice(0,30),hscroll:de.scrollWidth>de.clientWidth+1,sw:de.scrollWidth,cw:de.clientWidth,pill:info('#userMenuBtn'),right:info('.page-head-right'),burger:info('#htSidebarOpen'),print:info('#printBtn'),sidebar:info('.ht-sidebar-panel')};});
  await p.screenshot({path:`reports/site_restyle/shots/trainer_after_${tag}.png`,fullPage:false});
  console.log(`[trainer] ${tag}: ${ov.path}${ov.search} hscroll=${ov.hscroll}(sw=${ov.sw}/cw=${ov.cw}) jserr=${errs.length?errs.join('|'):'нет'}`);
  console.log(`   pill:${ov.pill}\n   right:${ov.right}\n   burger:${ov.burger}\n   print:${ov.print}\n   sidebar:${ov.sidebar}`);
  await c.close();
}
await b.close();})().catch(e=>console.log('[trainer] ERR',e.message));
