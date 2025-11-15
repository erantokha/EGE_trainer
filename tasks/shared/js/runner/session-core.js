
import { checkFree } from '../checkers/answer-check.js';

export function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } }
export function sample(arr,k){ const a=[...arr]; shuffle(a); return a.slice(0, Math.min(k,a.length)); }

export function distributeNonNegative(buckets,total){
  const out = new Map(buckets.map(b=>[b.id,0]));
  let left=total,i=0;
  while(left>0 && buckets.some(b=>out.get(b.id)<b.cap)){
    const b = buckets[i % buckets.length];
    if(out.get(b.id)<b.cap){ out.set(b.id, out.get(b.id)+1); left--; }
    i++;
  }
  return out;
}

export function computeAnswer(type, proto, params){
  const spec = type.answer_spec || type.answerSpec;
  const t = { ...(type.defaults||{}), ...(spec||{}) };
  const out = {
    type: t.type || 'number',
    format: t.format || null,
    units: t.units || null,
    tolerance: t.tolerance || null,
    accept: t.accept || null,
    normalize: t.normalize || [],
  };
  if (proto.answer) {
    if (proto.answer.value != null) out.value = proto.answer.value;
    if (proto.answer.text != null) out.text = proto.answer.text;
  } else if (t.expr) {
    const pnames = Object.keys(params||{});
    // eslint-disable-next-line no-new-func
    const f = new Function(...pnames, `return (${t.expr});`);
    out.value = f(...pnames.map(k=>params[k]));
  }
  return out;
}

export function buildQuestion(manifest, type, proto){
  const params = proto.params || {};
  const stemTpl = proto.stem || type.stem_template || type.stem || '';
  const stem = String(stemTpl).replace(/\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_,k)=> params[k]!==undefined ? String(params[k]) : '');
  const fig = proto.figure || type.figure || null;
  const ans = computeAnswer(type, proto, params);
  return {
    topic_id: manifest.topic || '',
    topic_title: manifest.title || '',
    question_id: proto.id,
    difficulty: proto.difficulty ?? (type.defaults?.difficulty ?? 1),
    figure: fig,
    stem,
    answer: ans,
    chosen_text: null,
    normalized_text: null,
    correct_text: null,
    correct: null,
    time_ms: 0,
  };
}

export function checkAndRender(currAnswerSpec, inputValue){
  return checkFree(currAnswerSpec, inputValue);
}
