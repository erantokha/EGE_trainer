// Diagnose student.html mobile stats-accordion badge overlap. Toggle data-home-variant to see if restyle caused it.
const fs = require('fs');
const { chromium } = require('@playwright/test');
function loadEnv(p){const o={};for(const l of fs.readFileSync(p,'utf8').split('\n')){const i=l.indexOf('=');if(i<0||l.trim().startsWith('#'))continue;let v=l.slice(i+1).trim();if((v[0]==='"'&&v.endsWith('"'))||(v[0]==="'"&&v.endsWith("'")))v=v.slice(1,-1);o[l.slice(0,i).trim()]=v;}return o;}
const BASE='http://127.0.0.1:8000';const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
async function login(p,e,pw,next){await p.goto(BASE+'/tasks/auth.html?next='+encodeURIComponent(next),{waitUntil:'domcontentloaded',timeout:30000});await p.locator('#loginForm').waitFor({timeout:15000});await p.locator('#loginEmail').fill(e);await p.locator('#loginPass').fill(pw);await p.locator('#loginSubmit').click();const dl=Date.now()+30000;let k=null;while(Date.now()<dl&&!k){k=await p.evaluate(()=>{for(const[kk,v]of Object.entries(localStorage)){if(kk.endsWith('-auth-token')&&v){try{const x=JSON.parse(v);const s=x?.currentSession||x?.session||x;if(s?.access_token)return kk;}catch(_){}}}return null;}).catch(()=>null);if(!k)await sleep(400);}}
(async()=>{
  const env=loadEnv('.env.local');const b=await chromium.launch();
  const ct=await b.newContext({viewport:{width:390,height:844}});const p=await ct.newPage();
  await login(p,env.E2E_TEACHER_EMAIL,env.E2E_TEACHER_PASSWORD,'/tasks/my_students.html');
  await p.goto(BASE+'/tasks/my_students.html',{waitUntil:'domcontentloaded',timeout:30000});
  await p.waitForSelector('.student-card',{timeout:20000}).catch(()=>{});
  await p.evaluate(()=>{const c=document.querySelector('.student-card');if(c)c.click();});
  await p.waitForFunction(()=>/student\.html/.test(location.pathname),null,{timeout:12000}).catch(()=>{});
  await sleep(5000);
  const dump=async(label)=>{
    const d=await p.evaluate(()=>{
      // find stats accordion rows; report structure of first topic row
      const item=document.querySelector('.acc-item, .stats-acc .acc-item, [class*="acc-item"]');
      const headRow=document.querySelector('.acc-head, .acc-item .acc-head');
      const out={variant:document.body.getAttribute('data-home-variant')||'(none)'};
      const rect=(el)=>el?(()=>{const r=el.getBoundingClientRect();return `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`;})():'absent';
      out.accItem=rect(item);
      if(headRow){
        out.head=rect(headRow);
        out.headChildren=[...headRow.children].map(c=>`${c.className||c.tagName}:${rect(c)}`);
      }
      // detect horizontal overlap among direct children of any .acc-head
      const heads=[...document.querySelectorAll('.acc-head')].slice(0,3);
      out.overlaps=heads.map(h=>{const ch=[...h.children];const rs=ch.map(c=>c.getBoundingClientRect());let ov=[];for(let i=0;i<rs.length-1;i++){for(let j=i+1;j<rs.length;j++){const a=rs[i],c=rs[j];if(a.right>c.left+1&&c.right>a.left+1&&a.bottom>c.top+1&&c.bottom>a.top+1)ov.push(`${ch[i].className}|${ch[j].className}`);}}return ov;});
      return out;
    });
    console.log(`--- ${label} ---`); console.log(JSON.stringify(d,null,1));
  };
  await dump('WITH variant=teacher (current)');
  await p.evaluate(()=>document.body.removeAttribute('data-home-variant'));
  await sleep(600);
  await dump('WITHOUT variant (toggled off)');
  await b.close();
})().catch(e=>console.log('ERR',e.message));
