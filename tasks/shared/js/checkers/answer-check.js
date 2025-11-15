
export function normalize(s, kinds=[]){
  let t = s==null ? '' : String(s);
  t = t.trim();
  if (kinds.includes('strip_spaces')) t = t.replace(/\s+/g,'');
  if (kinds.includes('unicode_minus_to_ascii')) t = t.replace(/[\u2212\u2012\u2013\u2014]/g,'-');
  if (kinds.includes('comma_to_dot')) t = t.replace(/,/g,'.');
  return t;
}
export function parseNumber(s){
  const m = s.match(/^\s*([+-]?\d+(?:\.\d+)?)\s*\/\s*([+-]?\d+(?:\.\d+)?)\s*$/);
  if(m) return Number(m[1])/Number(m[2]);
  return Number(s);
}
export function compareNumber(x, v, tol={abs:0}){
  if(!Number.isFinite(x)) return false;
  const abs = typeof tol.abs==='number' ? tol.abs : null;
  const rel = typeof tol.rel==='number' ? tol.rel : null;
  if(abs!=null && Math.abs(x-v)<=abs) return true;
  if(rel!=null && Math.abs(x-v)<=Math.abs(v)*rel) return true;
  return Math.abs(x-v)<=1e-12;
}
export function matchText(norm, spec){
  const acc = spec.accept||[];
  for(const a of acc){
    if(a.exact && norm===a.exact) return true;
    if(a.regex){
      const re = new RegExp(a.regex, a.flags||'');
      if(re.test(norm)) return true;
    }
  }
  return false;
}
export function checkFree(spec, raw){
  const chosen_text = String(raw ?? '').trim();
  const norm = normalize(chosen_text, spec.normalize || []);
  if (spec.type === 'string' && spec.format === 'ege_decimal') {
    const expected = String(spec.text ?? (spec.value ?? ''));
    const ok = norm === expected;
    return { correct:ok, chosen_text, normalized_text:norm, correct_text:expected };
  }
  if (spec.type === 'number') {
    const x = parseNumber(norm);
    const v = Number(spec.value);
    const ok = compareNumber(x, v, spec.tolerance || { abs: 0 });
    return { correct:ok, chosen_text, normalized_text:String(x), correct_text:String(v) };
  }
  const ok = matchText(norm, spec);
  return { correct:ok, chosen_text, normalized_text:norm, correct_text:(spec.accept?.map?.(p=>p.regex||p.exact)?.join(' | '))||'' };
}
