const { chromium } = require('@playwright/test');
const BASE='http://127.0.0.1:8000';
(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({viewport:{width:1200,height:900}});
  await ctx.addInitScript(()=>{
    try{
      sessionStorage.setItem('tasks_selection_v1', JSON.stringify({topics:{},sections:{},protos:{},shuffle:false,teacher_student_id:''}));
      localStorage.setItem('ege_role','teacher');
    }catch(e){}
  });
  const p=await ctx.newPage();
  const errs=[];
  p.on('console',m=>{ if(m.type()==='error') errs.push(m.text()); });
  p.on('pageerror',e=>errs.push('THROW:'+e.message));
  await p.goto(BASE+'/tasks/list.html',{waitUntil:'domcontentloaded'});
  await p.waitForTimeout(3500);
  const modErrs = errs.filter(t=>/SyntaxError|does not provide an export|Failed to fetch dynamically imported module|Unexpected token|Cannot find module/i.test(t));
  console.log('TOTAL console errors:', errs.length);
  console.log('MODULE-RESOLUTION errors:', modErrs.length);
  modErrs.slice(0,10).forEach(t=>console.log('  MOD-ERR:',t));
  errs.slice(0,8).forEach(t=>console.log('  ctx:',String(t).slice(0,160)));
  await b.close();
  process.exit(modErrs.length?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
