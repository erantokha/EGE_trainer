const fs=require('fs');const{chromium}=require('@playwright/test');
function le(p){const o={};for(const l of fs.readFileSync(p,'utf8').split('\n')){const i=l.indexOf('=');if(i<0||l.trim().startsWith('#'))continue;let v=l.slice(i+1).trim();if((v[0]==='"'&&v.endsWith('"'))||(v[0]==="'"&&v.endsWith("'")))v=v.slice(1,-1);o[l.slice(0,i).trim()]=v;}return o;}
const B='http://127.0.0.1:8000';const s=ms=>new Promise(r=>setTimeout(r,ms));
async function lg(p,e,pw,n){await p.goto(B+'/tasks/auth.html?next='+encodeURIComponent(n),{waitUntil:'domcontentloaded',timeout:30000});await p.locator('#loginForm').waitFor({timeout:15000});await p.locator('#loginEmail').fill(e);await p.locator('#loginPass').fill(pw);await p.locator('#loginSubmit').click();const dl=Date.now()+30000;let k=null;while(Date.now()<dl&&!k){k=await p.evaluate(()=>{for(const[kk,v]of Object.entries(localStorage)){if(kk.endsWith('-auth-token')&&v){try{const x=JSON.parse(v);const ss=x?.currentSession||x?.session||x;if(ss?.access_token)return kk;}catch(_){}}}return null;}).catch(()=>null);if(!k)await s(400);}}
(async()=>{const env=le('.env.local');const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1366,height:1000}});const p=await ctx.newPage();
await lg(p,env.E2E_TEACHER_EMAIL,env.E2E_TEACHER_PASSWORD,'/home_teacher.html');
await p.goto(B+'/home_teacher.html',{waitUntil:'domcontentloaded',timeout:30000});
await p.waitForFunction(()=>{const s=document.getElementById('teacherStudentSelect');return s&&[...s.options].some(o=>o.value);},{timeout:25000}).catch(()=>{});await s(800);
await p.evaluate(()=>{const s=document.getElementById('teacherStudentSelect');const o=[...(s?.options||[])].find(o=>o.value);s.value=o.value;s.dispatchEvent(new Event('change',{bubbles:true}));});
await p.waitForSelector('#accordion .node.section',{timeout:20000}).catch(()=>{});await s(2000);
// включаем фильтр weak_spots
await p.evaluate(()=>{const r=document.getElementById('teacherFilterWeakSpots');if(r){r.checked=true;r.dispatchEvent(new Event('change',{bubbles:true}));}});
await s(4000);
const acc=await p.$('#accordion');await (acc||p).screenshot({path:'reports/perf/_acc_teacher_filter.png'});
console.log('saved teacher+filter');await b.close();})().catch(e=>console.log('ERR',e.message));
