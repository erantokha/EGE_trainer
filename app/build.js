// app/build.js
// Единый BUILD / cache-busting: читаем из <meta name="app-build" content="2026-02-27-1">.
// Используется для fetch(...) статических JSON/манифестов, чтобы не ловить смесь кэша.
//
// Пример:
//   import { withBuild } from '../app/build.js?v=BUILD';
//   const resp = await fetch(withBuild('../content/tasks/index.json'), { cache: 'force-cache' });

export function getBuild() {
  const el = document.querySelector('meta[name="app-build"]');
  const v = el && typeof el.content === 'string' ? el.content.trim() : '';
  return v || 'dev';
}

export function withBuild(urlLike) {
  const u = new URL(String(urlLike), location.href);
  u.searchParams.set('v', getBuild());
  return u.href;
}
