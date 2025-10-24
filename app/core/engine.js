/**
 * app/core/engine.js
 * Порядок вопросов и представления (1 верный + 3 неверных).
 */
export function buildOrder(bank, rng){
  const n = bank.length;
  const order = Array.from({length:n}, (_,i)=>i);
  return rng.shuffle(order);
}
function uniq(arr){
  const s=new Set(), out=[];
  for(const x of arr){ const k=String(x); if(!s.has(k)){ s.add(k); out.push(x); } }
  return out;
}
export function buildView(q, rng){
  if(!q || !Array.isArray(q.choices) || q.choices.length!==8) throw new Error(`buildView: ${q&&q.id||'<no-id>'} должен иметь 8 вариантов`);
  if(typeof q.answer!=='number' || q.answer<0 || q.answer>7) throw new Error(`buildView: ${q.id} неверный answer`);
  const correct = q.choices[q.answer];
  const wrongPool = q.choices.filter((_,i)=>i!==q.answer);
  const uniqueWrong = uniq(wrongPool);
  if(uniqueWrong.length<3) throw new Error(`buildView: ${q.id} менее 3 уникальных неверных`);
  rng.shuffle(uniqueWrong);
  const pickedWrong = uniqueWrong.slice(0,3);
  const four = [correct, ...pickedWrong];
  rng.shuffle(four);
  const correctIndex = four.indexOf(correct);
  if(correctIndex===-1) throw new Error('internal: correctIndex not found');
  return { id:q.id||'', topic:q.topic||'', stem:q.stem, choices:four, correctIndex, explanation:q.explanation };
}
export function buildViews(bank, order, rng){
  const out=[];
  for(let i=0;i<order.length;i++){ out.push(buildView(bank[order[i]], rng)); }
  return out;
}
