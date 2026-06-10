const pw = require('@playwright/test');
const URL='http://127.0.0.1:8000/reports/_zoom_proto.html';
async function run(name, engine){
  const b=await engine.launch(); const p=await b.newPage({viewport:{width:1200,height:800}});
  await p.goto(URL,{waitUntil:'networkidle'});
  // вставим однострочный пробник в .content
  await p.evaluate(()=>{const s=document.createElement('span');s.id='probe';s.style.whiteSpace='nowrap';s.textContent='МАСШТАБ';document.getElementById('content').appendChild(s);});
  const probe=async()=>p.evaluate(()=>{const r=document.getElementById('probe').getBoundingClientRect();const f=document.getElementById('svg').getBoundingClientRect();const ch=document.getElementById('content').getBoundingClientRect();return{pw:Math.round(r.width),fw:Math.round(f.width),cx:Math.round(ch.left+ch.width/2),cy:Math.round(ch.top+ch.height/2),scrollH:document.querySelector('.mask').scrollHeight,clientH:document.querySelector('.mask').clientHeight};});
  const a=await probe();
  await p.evaluate(()=>window.__setZ(2)); await p.waitForTimeout(60);
  const c=await probe();
  console.log(`[${name}] текст(пробник)×=${(c.pw/a.pw).toFixed(2)} ${Math.abs(c.pw/a.pw-2)<0.1?'✓':'✗'} | фигура×=${(c.fw/a.fw).toFixed(2)} ${Math.abs(c.fw/a.fw-2)<0.1?'✓':'✗'} | центр X=${Math.abs(c.cx-600)<4?'✓':'✗'}`);
  await b.close();
}
(async()=>{ await run('chromium',pw.chromium); await run('webkit',pw.webkit); })();
