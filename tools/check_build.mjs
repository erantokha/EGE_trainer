// tools/check_build.mjs
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const SKIP_DIRS = new Set([".git", "docs", "content", "node_modules"]);

const META_RE = /<meta\s+name=["']app-build["']\s+content=["']([^"']+)["'][^>]*>/i;
const V_RE = /\?v=(\d{4}-\d{2}-\d{2}[A-Za-z0-9-]*)/g;

// app/config.js: content.version = '...'
const CONTENT_VERSION_RE = /(content:\s*{\s*[^}]*?\bversion:\s*')([^']*)(')/s;

async function* walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      yield* walk(full);
    } else if (e.isFile()) {
      yield full;
    }
  }
}

function rel(fp) {
  return path.relative(REPO_ROOT, fp).replaceAll("\\", "/");
}

function shouldScanFile(r) {
  if (r === "index.html") return true;
  if (r.startsWith("tasks/")) return r.endsWith(".html") || r.endsWith(".js") || r.endsWith(".css");
  if (r.startsWith("app/")) return r.endsWith(".js");
  return false;
}

async function main() {
  const builds = new Set();  // meta app-build values
  const vvals = new Set();   // ?v= values
  const missingMeta = [];    // html files without meta
  const missingV = [];       // files that should contain ?v= but don't (мягкая проверка)

  for await (const fp of walk(REPO_ROOT)) {
    const r = rel(fp);
    if (!shouldScanFile(r)) continue;

    const txt = await fs.readFile(fp, "utf8");

    // meta app-build: обязателен для HTML
    const m = txt.match(META_RE);
    if (m?.[1]) builds.add(m[1]);
    if (r.endsWith(".html") && !m?.[1]) missingMeta.push(r);

    // ?v=...: собираем, но не требуем в каждом файле
    let mm;
    let hasV = false;
    while ((mm = V_RE.exec(txt)) !== null) {
      hasV = true;
      vvals.add(mm[1]);
    }
    // мягко: обычно js/css должны иметь хотя бы 1 ?v= (чтобы не забыли cache-bust на импорт/ресурсы)
    if ((r.endsWith(".html") || r.endsWith(".js") || r.endsWith(".css")) && !hasV) {
      // можно закомментировать, если покажется слишком строгим
      missingV.push(r);
    }
  }

  // config content.version
  const cfgPath = path.join(REPO_ROOT, "app/config.js");
  let cfgVersion = null;
  try {
    const cfg = await fs.readFile(cfgPath, "utf8");
    const cm = cfg.match(CONTENT_VERSION_RE);
    cfgVersion = cm?.[2] || null;
  } catch {
    cfgVersion = null;
  }

  const problems = [];

  if (missingMeta.length) {
    problems.push(`missing <meta name="app-build"...> in HTML: ${missingMeta.join(", ")}`);
  }

  if (builds.size === 0) problems.push(`meta app-build not found (expected in index.html and tasks/*.html)`);
  if (vvals.size === 0) problems.push(`no ?v= found anywhere (cache-busting likely broken)`);

  if (!cfgVersion) problems.push(`cannot read CONFIG.content.version from app/config.js`);

  if (builds.size > 1) problems.push(`meta app-build differs: ${[...builds].join(", ")}`);
  if (vvals.size > 1) problems.push(`?v= differs: ${[...vvals].join(", ")}`);

  const build = builds.size ? [...builds][0] : null;
  const v = vvals.size ? [...vvals][0] : null;

  if (build && v && build !== v) {
    problems.push(`meta app-build (${build}) != ?v= (${v})`);
  }

  if (build && cfgVersion && build !== cfgVersion) {
    problems.push(`meta app-build (${build}) != CONFIG.content.version (${cfgVersion})`);
  }

  // если хочешь совсем жёстко: раскомментируй, и любой файл без ?v= будет ошибкой
  // if (missingV.length) problems.push(`files without ?v= found: ${missingV.join(", ")}`);

  if (problems.length) {
    console.error("build/version mismatch:");
    for (const p of problems) console.error(`- ${p}`);
    process.exit(1);
  }

  console.log(`ok: build=${build || "none"}, v=${v || "none"}, content.version=${cfgVersion || "none"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
