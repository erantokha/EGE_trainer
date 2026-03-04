// app/core/url_path.js
// Нормализация путей к статическому контенту.
//
// Цель: любые пути к JSON/манифестам/картинкам должны резолвиться от корня сайта,
// независимо от текущей страницы (/home_student.html, /tasks/..., и т.д.).

function isHttpUrl(s) {
  return /^https?:\/\//i.test(s);
}

export function toRootPath(p) {
  const raw = (p === undefined || p === null) ? '' : String(p);
  const s0 = raw.trim();
  if (!s0) throw new Error('Empty path');
  if (isHttpUrl(s0)) return s0;
  if (s0.startsWith('//')) return s0; // protocol-relative

  // Страховка: убираем ведущие ./ и ../ (сколько угодно раз)
  let s = s0;
  while (s.startsWith('./')) s = s.slice(2);
  while (s.startsWith('../')) s = s.slice(3);

  // Гарантируем ведущий слэш (и не допускаем //)
  while (s.startsWith('/')) s = s.slice(1);
  if (!s) throw new Error('Empty path after normalization');
  return '/' + s;
}

export function toAbsUrl(p) {
  const raw = (p === undefined || p === null) ? '' : String(p);
  const s0 = raw.trim();
  if (!s0) throw new Error('Empty path');
  if (isHttpUrl(s0)) return s0;
  if (s0.startsWith('//')) return new URL(s0, location.origin).toString();

  const root = toRootPath(s0);
  return new URL(root, location.origin).toString();
}
