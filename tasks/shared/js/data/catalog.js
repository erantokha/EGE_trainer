
import { $ } from '../core/dom.js';

const BASE = new URL('../../', location.href); // /tasks/ -> repo root
export const baseHref = BASE;

export async function loadCatalog(){
  const url = new URL('content/tasks/index.json', BASE).href;
  const resp = await fetch(url);
  if(!resp.ok) throw new Error('index.json not found');
  const CATALOG = await resp.json();
  // group -> attach children
  const groups = CATALOG.filter(x=>x.type==='group');
  for(const g of groups){
    g.topics = CATALOG.filter(x=>x.parent===g.id);
  }
  return { CATALOG, groups };
}
