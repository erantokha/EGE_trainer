/**
 * app/core/random.js
 * Детерминируемый PRNG (Mulberry32). Экспорт: createRng, randomSeed.
 */
function toUint32(n){ return (n>>>0); }
function hashString(str){
  let h = 2166136261>>>0;
  for (let i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h = (h*16777619)>>>0; }
  return h>>>0;
}
export function randomSeed(){
  try{ const b=new Uint32Array(1); crypto.getRandomValues(b); return toUint32(b[0]^Date.now()); }
  catch{ return toUint32(Date.now() ^ (Math.random()*0xffffffff)); }
}
function mulberry32(seed){
  let a = toUint32(seed);
  return function(){
    a = toUint32(a + 0x6D2B79F5);
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function createRng(seed){
  const s = typeof seed==='string' ? hashString(seed) : toUint32(seed);
  const next = mulberry32(s);
  return {
    nextFloat(){ return next(); },
    nextInt(max){ if(!Number.isFinite(max)||max<=0) throw new Error('nextInt: max>0'); return Math.floor(next()*max); },
    shuffle(arr){ for(let i=arr.length-1;i>0;i--){ const j=Math.floor(next()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; } return arr; },
    choice(arr){ if(!arr||arr.length===0) throw new Error('choice: empty'); return arr[this.nextInt(arr.length)]; }
  };
}
