const fs=require('fs');const{chromium}=require('@playwright/test');
function le(p){const o={};for(const l of fs.readFileSync(p,'utf8').split('\n')){const i=l.indexOf('=');if(i<0||l.trim().startsWith('#'))continue;let v=l.slice(i+1).trim();if((v[0]==='"'&&v.endsWith('"'))||(v[0]==="'"&&v.endsWith("'")))v=v.slice(1,-1);o[l.slice(0,i).trim()]=v;}return o;}
const B='http://127.0.0.1:8000';const s=ms=>new Promise(r=>setTimeout(r,ms));
async function lg(p,e,pw,n){await p.goto(B+'/tasks/auth.html?next='+encodeURIComponent(n),{waitUntil:'domcontentloaded',timeout:30000});await p.locator('#loginForm').waitFor({timeout:15000});await p.locator('#loginEmail').fill(e);await p.locator('#loginPass').fill(pw);await p.locator('#loginSubmit').click();const dl=Date.now()+30000;let k=null;while(Date.now()<dl&&!k){k=await p.evaluate(()=>{for(const[kk,v]of Object.entries(localStorage)){if(kk.endsWith('-auth-token')&&v){try{const x=JSON.parse(v);const ss=x?.currentSession||x?.session||x;if(ss?.access_token)return kk;}catch(_){}}}return null;}).catch(()=>null);if(!k)await s(400);}}
const SNAP=`()=>{const it=[...document.querySelectorAll('#htSidebar .ht-sidebar-nav .ht-sidebar-item')];return{variant:document.body.dataset.homeVariant,labels:it.map(b=>(b.querySelector('.ht-sidebar-label')||{}).textContent),n:it.length};}`;
(async()=>{const env=le('.env.local');const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1366,height:900}});const p=await ctx.newPage();
await lg(p,env.E2E_TEACHER_EMAIL,env.E2E_TEACHER_PASSWORD,'/home_teacher.html');
// прогреем кэш роли (зайдём на home_teacher → роль закэшируется)
await p.goto(B+'/home_teacher.html',{waitUntil:'domcontentloaded',timeout:30000});await s(2500);
// init-скрипт: снимаем меню на КАЖДОМ readystatechange (interactive=после парса, до async-модуля)
await ctx.addInitScript(()=>{window.__snap=[];const f=()=>{const it=[...document.querySelectorAll('#htSidebar .ht-sidebar-nav .ht-sidebar-item')];window.__snap.push({st:document.readyState,t:Math.round(performance.now()),variant:document.body?document.body.dataset.homeVariant:null,labels:it.map(x=>(x.querySelector('.ht-sidebar-label')||{}).textContent)});};document.addEventListener('readystatechange',f);});
console.log('=== TEACHER → profile (роль в кэше) ===');
await p.goto(B+'/tasks/profile.html',{waitUntil:'commit',timeout:30000});await s(1800);
const snaps=await p.evaluate(()=>window.__snap||[]);
snaps.forEach(x=>console.log(`  ${x.st} @${x.t}ms variant=${x.variant} nav=${JSON.stringify(x.labels)}`));
const fin=await p.evaluate(SNAP);
console.log(`  FINAL(после модуля): variant=${fin.variant} nav=${JSON.stringify(fin.labels)}`);
console.log('  >>> если interactive != FINAL → меню перестраивается после модуля = МИГАНИЕ');
await ctx.close();await b.close();})().catch(e=>console.log('ERR',e.message));
