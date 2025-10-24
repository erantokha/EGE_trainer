export function validateQuestionBank(bank){
  const errors=[]; const ids=new Set(); const isStr=v=>typeof v==='string' && v.trim().length>0;
  bank.forEach((q,idx)=>{
    const path=q.topic?`${q.topic}/${q.id}`:q.id||`#${idx}`;
    if(!q.id) errors.push({path,code:'id.missing',msg:'Отсутствует id'});
    if(q.id && ids.has(q.id)) errors.push({path,code:'id.duplicate',msg:'Дубликат id'});
    if(q.id) ids.add(q.id);
    if(!isStr(q.stem)) errors.push({path,code:'stem.invalid',msg:'Пустая формулировка'});
    if(!Array.isArray(q.choices) || q.choices.length!==8) errors.push({path,code:'choices.count',msg:'Должно быть ровно 8 вариантов'});
    else q.choices.forEach((c,i)=>{ if(!isStr(c)) errors.push({path,code:`choices.${i}.empty`,msg:`Пустой вариант ответа #${i+1}`}); });
    if(typeof q.answer!=='number' || q.answer<0 || q.answer>7) errors.push({path,code:'answer.range',msg:'answer должен быть 0..7'});
    if(q.difficulty!=null && ![1,2,3].includes(q.difficulty)) errors.push({path,code:'difficulty.range',msg:'difficulty ∈ {1,2,3} либо отсутствует'});
  }); return errors;
}
