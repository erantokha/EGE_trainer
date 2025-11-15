
export const $ = (s, root=document) => root.querySelector(s);
export const $$ = (s, root=document) => Array.from(root.querySelectorAll(s));
export const on = (el, ev, fn) => el && el.addEventListener(ev, fn);
export const esc = (s) => String(s).replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
