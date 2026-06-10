const fs=require('fs');const{chromium}=require('@playwright/test');
function le(p){const o={};for(const l of fs.readFileSync(p,'utf8').split('\n')){const i=l.indexOf('=');if(i<0||l.trim().startsWith('#'))continue;let v=l.slice(i+1).trim();if((v[0]==='"'&&v.endsWith('"'))||(v[0]==="'"&&v.endsWith("'")))v=v.slice(1,-1);o[l.slice(0,i).trim()]=v;}return o;}
const B='http://127.0.0.1:8000';const s=ms=>new Promise(r=>setTimeout(r,ms));
async function lg(p,e,pw,n){await p.goto(B+'/tasks/auth.html?next='+encodeURIComponent(n),{waitUntil:'domcontentloaded',timeout:30000});await p.locator('#loginForm').waitFor({timeout:15000});await p.locator('#loginEmail').fill(e);await p.locator('#loginPass').fill(pw);await p.locator('#loginSubmit').click();const dl=Date.now()+30000;let k=null;while(Date.now()<dl&&!k){k=await p.evaluate(()=>{for(const[kk,v]of Object.entries(localStorage)){if(kk.endsWith('-auth-token')&&v){try{const x=JSON.parse(v);const ss=x?.currentSession||x?.session||x;if(ss?.access_token)return kk;}catch(_){}}}return null;}).catch(()=>null);if(!k)await s(400);}}
(async()=>{const env=le('.env.local');const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1366,height:900}});const p=await ctx.newPage();
await lg(p,env.E2E_STUDENT_EMAIL,env.E2E_STUDENT_PASSWORD,'/home_student.html');
await p.goto(B+'/home_student.html',{waitUntil:'domcontentloaded',timeout:30000});
await p.waitForSelector('#htSidebarUserBtn',{timeout:20000}).catch(()=>{});await s(2500);
const info=await p.evaluate(()=>{const a=document.getElementById('htSidebarAvatar');const n=document.getElementById('htSidebarUserName');const btn=document.getElementById('htSidebarUserBtn');return{avatarText:a?a.textContent:null,nameText:n?n.textContent:null,railtip:btn?btn.getAttribute('data-railtip'):null};});
console.log('аватар/имя/подсказка:',JSON.stringify(info));
await p.locator('#htSidebarUserBtn').hover();await s(400);
await p.screenshot({path:'reports/perf/_av_collapsed.png',clip:{x:0,y:560,width:420,height:300}});
// раскрыть
await p.evaluate(()=>document.querySelector('#htSidebar')?.classList.add('open'));await s(400);
await p.screenshot({path:'reports/perf/_av_open.png',clip:{x:0,y:560,width:420,height:300}});
console.log('saved');await b.close();})().catch(e=>console.log('ERR',e.message));
