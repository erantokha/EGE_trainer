
const BASE = new URL('../../', location.href);
const cache = new Map();

export async function ensureManifest(topic){
  if(!topic?.path) return null;
  if(cache.has(topic.path)) return cache.get(topic.path);
  const url = new URL(topic.path, BASE).href;
  const resp = await fetch(url);
  if(!resp.ok) return null;
  const man = await resp.json();
  cache.set(topic.path, man);
  return man;
}
