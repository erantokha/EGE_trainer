// tools/inject_cache_check.mjs
//
// Injects (or refreshes) the inline cache-check block into the <head> of
// production HTML pages — right after <meta name="app-build" ...>.
//
// The block does three things at runtime:
//   1. meta http-equiv Cache-Control / Pragma — hint to browsers not to
//      serve a stale HTML from cache (soft, not strictly honoured by Safari).
//   2. inline <script> — fetches /version.json (cache: 'no-store') and
//      compares with the local app-build meta. On mismatch: caches.delete()
//      then location.reload(). Protects against reload-loops via sessionStorage
//      (max 2 attempts).
//
// Idempotent: re-running replaces the block between the two markers.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

// Explicit allowlist of production HTML pages.
// Smoke pages, browser fixtures, and test fixtures are intentionally NOT in
// this list — cache freshness is not a concern for them.
const PRODUCTION_HTML = [
  "index.html",
  "student.html",
  "home_teacher.html",
  "home_student.html",
  "privacy.html",
  "terms.html",
  "tasks/trainer.html",
  "tasks/list.html",
  "tasks/hw.html",
  "tasks/hw_create.html",
  "tasks/stats.html",
  "tasks/my_students.html",
  "tasks/my_homeworks.html",
  "tasks/my_homeworks_archive.html",
  "tasks/profile.html",
  "tasks/student.html",
  "tasks/auth.html",
  "tasks/auth_callback.html",
  "tasks/auth_reset.html",
  "tasks/google_complete.html",
  "tasks/analog.html",
  "tasks/unique.html",
  "tasks/diag_network.html",
];

const MARKER_START = "<!-- cache-check:start -->";
const MARKER_END = "<!-- cache-check:end -->";

const BLOCK = `  ${MARKER_START}
  <meta http-equiv="Cache-Control" content="no-cache, must-revalidate">
  <meta http-equiv="Pragma" content="no-cache">
  <script>
  (function () {
    try {
      var meta = document.querySelector('meta[name="app-build"]');
      if (!meta) return;
      var localBuild = (meta.content || '').trim();
      if (!localBuild || localBuild === 'dev') return;
      var SS_KEY = '__cacheCheckAttempts';
      var attempts = 0;
      try { attempts = parseInt(sessionStorage.getItem(SS_KEY) || '0', 10) || 0; } catch (e) {}
      if (attempts >= 2) return;
      fetch('/version.json?_=' + Date.now(), { cache: 'no-store' }).then(function (r) {
        return r && r.ok ? r.json() : null;
      }).then(function (j) {
        if (!j || typeof j.build !== 'string') return;
        if (j.build === localBuild) {
          try { sessionStorage.removeItem(SS_KEY); } catch (e) {}
          return;
        }
        try { sessionStorage.setItem(SS_KEY, String(attempts + 1)); } catch (e) {}
        var doReload = function () { try { location.reload(); } catch (e) {} };
        if (window.caches && caches.keys) {
          caches.keys().then(function (keys) {
            return Promise.all(keys.map(function (k) { return caches.delete(k); }));
          }).then(doReload, doReload);
        } else {
          doReload();
        }
      }).catch(function () {});
    } catch (e) {}
  })();
  </script>
  ${MARKER_END}`;

const META_APP_BUILD_RE = /<meta\s+name=["']app-build["']\s+content=["'][^"']*["'][^>]*>/i;
const EXISTING_BLOCK_RE = new RegExp(
  `\\s*${MARKER_START}[\\s\\S]*?${MARKER_END}`,
  "g",
);

async function processFile(relPath) {
  const fp = path.join(REPO_ROOT, relPath);
  let txt;
  try {
    txt = await fs.readFile(fp, "utf8");
  } catch (e) {
    return { relPath, status: "missing", error: e.message };
  }

  const metaMatch = txt.match(META_APP_BUILD_RE);
  if (!metaMatch) {
    return { relPath, status: "no-meta" };
  }

  // Strip any prior cache-check block (idempotent rerun).
  let cleaned = txt.replace(EXISTING_BLOCK_RE, "");

  const metaIdx = cleaned.search(META_APP_BUILD_RE);
  if (metaIdx === -1) {
    return { relPath, status: "no-meta-after-clean" };
  }
  const metaTag = cleaned.match(META_APP_BUILD_RE)[0];
  const insertAt = metaIdx + metaTag.length;

  const before = cleaned.slice(0, insertAt);
  const after = cleaned.slice(insertAt);
  const sep = after.startsWith("\n") ? "\n" : "\n";
  const out = before + "\n" + BLOCK + (after.startsWith("\n") ? "" : "\n") + after.replace(/^\n+/, "\n");

  if (out === txt) {
    return { relPath, status: "unchanged" };
  }
  await fs.writeFile(fp, out, "utf8");
  return { relPath, status: "updated" };
}

async function main() {
  const results = [];
  for (const r of PRODUCTION_HTML) {
    results.push(await processFile(r));
  }

  const updated = results.filter((r) => r.status === "updated");
  const unchanged = results.filter((r) => r.status === "unchanged");
  const missing = results.filter((r) => r.status === "missing" || r.status === "no-meta" || r.status === "no-meta-after-clean");

  console.log(`scanned: ${results.length}`);
  console.log(`updated: ${updated.length}`);
  console.log(`unchanged: ${unchanged.length}`);
  if (missing.length) {
    console.log(`problems: ${missing.length}`);
    for (const m of missing) {
      console.log(`  - ${m.relPath}: ${m.status}${m.error ? " (" + m.error + ")" : ""}`);
    }
  }
  if (updated.length) {
    console.log(updated.map((x) => ` - ${x.relPath}`).join("\n"));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
