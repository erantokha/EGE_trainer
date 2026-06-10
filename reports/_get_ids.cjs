const { chromium } = require('@playwright/test');
const path=require('path'); const BASE='http://127.0.0.1:8000';
(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({storageState:path.resolve(__dirname,'../.auth/student.json'),viewport:{width:1280,height:820}});
  const p=await ctx.newPage();
  await p.goto(BASE+'/home_student.html',{waitUntil:'domcontentloaded'});
  await p.locator('#accordion .node.section').first().waitFor({state:'visible',timeout:25000});
  // развернём первую секцию, найдём topic
  const ids=await p.evaluate(()=>{
    const sec=document.querySelector('#accordion .node.section');
    const secId=sec?.getAttribute('data-id')||sec?.dataset.id||sec?.id;
    // развернуть
    sec?.querySelector('.node-head,.row,button,summary')?.click();
    return {secId, html: sec?.outerHTML?.slice(0,300)};
  });
  await p.waitForTimeout(500);
  const more=await p.evaluate(()=>{
    const t=document.querySelector('#accordion .node.topic');
    const a=document.querySelector('#accordion [data-topic],#accordion [data-id].topic, #accordion .node.topic [data-id]');
    return { topicId: t?.getAttribute('data-id')||t?.dataset.id, anyTopicAttr: a?.outerHTML?.slice(0,160), topics: [...document.querySelectorAll('#accordion .node.topic')].slice(0,3).map(n=>n.getAttribute('data-id')||n.dataset.id) };
  });
  console.log('section:', JSON.stringify(ids));
  console.log('topic:', JSON.stringify(more));
  await b.close();
})();
