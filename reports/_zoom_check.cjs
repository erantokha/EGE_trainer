const pw = require('@playwright/test');
const URL='http://127.0.0.1:8000/reports/_zoom_proto.html';
async function run(engineName, engine){
  const b=await engine.launch(); const p=await b.newPage({viewport:{width:1200,height:800}});
  await p.goto(URL,{waitUntil:'networkidle'});
  const measure=async()=>p.evaluate(()=>{const st=document.getElementById('stem').getBoundingClientRect();const sv=document.getElementById('svg').getBoundingClientRect();const ct=document.getElementById('content').getBoundingClientRect();return{stemW:Math.round(st.width),stemH:Math.round(st.height),svgW:Math.round(sv.width),cx:Math.round(ct.left+ct.width/2),cy:Math.round(ct.top+ct.height/2),vw:innerWidth,vh:innerHeight};});
  const m1=await measure();
  const centered = Math.abs(m1.cx-m1.vw/2)<3 && Math.abs(m1.cy-m1.vh/2)<3;
  // зум +0.75 (3 клика)
  await p.evaluate(()=>window.__setZ(1.75));
  await p.waitForTimeout(60);
  const m2=await measure();
  const textGrew = m2.stemW>m1.stemW*1.4 && m2.stemH>m1.stemH*1.4;
  const figGrew = m2.svgW>m1.svgW*1.4;
  const stillCentered = Math.abs(m2.cx-m2.vw/2)<4;
  console.log(`[${engineName}] центр(нач)=${centered?'✓':'✗'}(cx${m1.cx}/vw${m1.vw}, cy${m1.cy}/vh${m1.vh}) | zoom1.75: текст×=${(m2.stemW/m1.stemW).toFixed(2)} ${textGrew?'✓':'✗'} | фигура×=${(m2.svgW/m1.svgW).toFixed(2)} ${figGrew?'✓':'✗'} | центр(зум)=${stillCentered?'✓':'✗'}`);
  await b.close();
}
(async()=>{ await run('chromium',pw.chromium); await run('webkit',pw.webkit); })();
