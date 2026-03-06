// tools/check_build.mjs
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const SKIP_DIRS = new Set([".git", "docs", "content", "node_modules"]);

const META_RE = /<meta\s+name=["']app-build["']\s+content=["']([^"']+)["'][^>]*>/i;
const V_RE = /\?v=([0-9]{4}-[0-9]{2}-[0-9]{2}[A-Za-z0-9-]*)/g;

// app/config.js: content: { ..., version: '...' }
const CONTENT_VERSION_RE = /(content:\s*{\s*[^}]*?\bversion:\s*')([^']*)(')/s;

// Проверка, что локальные ресурсы и ESM-импорты тоже содержат cache-busting (?v=...).
const HTML_SCRIPT_SRC_RE = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
const HTML_LINK_HREF_RE = /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi;

const IMPORT_FROM_RE = /(^|\n)\s*import\s+[^;\n]*?\sfrom\s*['"]([^'"]+)['"]/g;
const IMPORT_BARE_RE = /(^|\n)\s*import\s*['"]([^'"]+)['"]/g;
const IMPORT_DYN_RE = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function isExternalUrl(u) {
  const s = String(u || "").trim();
  return (
    s.startsWith("http://") ||
    s.startsWith("https://") ||
    s.startsWith("//") ||
    s.startsWith("data:") ||
    s.startsWith("blob:")
  );
}

function stripQueryHash(u) {
  return String(u || "").split(/[?#]/)[0];
}

function hasVParam(u) {
  return /[?&]v=/.test(String(u || ""));
}

function needsVParam(u) {
  const base = stripQueryHash(u);
  return base.endsWith(".js") || base.endsWith(".css");
}

function collectMissingVInHtml(r, txt) {
  const out = [];
  let m;
  while ((m = HTML_SCRIPT_SRC_RE.exec(txt)) !== null) {
    const src = m[1];
    if (isExternalUrl(src)) continue;
    if (needsVParam(src) && !hasVParam(src)) out.push(`script src="${src}"`);
  }
  HTML_SCRIPT_SRC_RE.lastIndex = 0;

  while ((m = HTML_LINK_HREF_RE.exec(txt)) !== null) {
    const href = m[1];
    if (isExternalUrl(href)) continue;
    if (needsVParam(href) && !hasVParam(href)) out.push(`link href="${href}"`);
  }
  HTML_LINK_HREF_RE.lastIndex = 0;

  return out.map((s) => `${r}: ${s}`);
}

function collectMissingVInImports(r, txt) {
  const out = [];
  const specs = new Set();

  let m;
  while ((m = IMPORT_FROM_RE.exec(txt)) !== null) specs.add(m[2]);
  IMPORT_FROM_RE.lastIndex = 0;

  while ((m = IMPORT_BARE_RE.exec(txt)) !== null) specs.add(m[2]);
  IMPORT_BARE_RE.lastIndex = 0;

  while ((m = IMPORT_DYN_RE.exec(txt)) !== null) specs.add(m[1]);
  IMPORT_DYN_RE.lastIndex = 0;

  for (const spec of specs) {
    const s = String(spec || "");
    if (!(s.startsWith(".") || s.startsWith("/"))) continue;
    if (!stripQueryHash(s).endsWith(".js")) continue;
    if (!hasVParam(s)) out.push(`${r}: import "${s}"`);
  }

  return out;
}


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
  // HTML: index.html + любые другие страницы в корне (например, home_student.html/home_teacher.html) и в tasks/.
  if (r.endsWith(".html")) return true;
  // Static assets under tasks/ and shared modules.
  if (r.startsWith("tasks/")) return r.endsWith(".js") || r.endsWith(".css");
  if (r.startsWith("app/")) return r.endsWith(".js");
  return false;
}

async function readConfigContentVersion() {
  try {
    const cfgPath = path.join(REPO_ROOT, "app/config.js");
    const cfg = await fs.readFile(cfgPath, "utf8");
    const m = cfg.match(CONTENT_VERSION_RE);
    return m?.[2] ? String(m[2]).trim() : "";
  } catch (_) {
    return "";
  }
}

async function main() {
  const builds = new Set();  // meta app-build
  const vvals = new Set();   // ?v=
  const missingMeta = [];    // html without meta
  const missingVInHtml = [];
  const missingVInImports = [];

  for await (const fp of walk(REPO_ROOT)) {
    const r = rel(fp);
    if (!shouldScanFile(r)) continue;

    const txt = await fs.readFile(fp, "utf8");

    if (r.endsWith(".html")) {
      missingVInHtml.push(...collectMissingVInHtml(r, txt));
    }
    if (r.endsWith(".js")) {
      missingVInImports.push(...collectMissingVInImports(r, txt));
    }

    const m = txt.match(META_RE);
    if (m?.[1]) builds.add(String(m[1]).trim());
    if (r.endsWith(".html") && !m?.[1]) missingMeta.push(r);

    let mm;
    while ((mm = V_RE.exec(txt)) !== null) {
      vvals.add(String(mm[1]).trim());
    }
  }

  const cfgVersion = await readConfigContentVersion();

  const problems = [];

  for (const p of missingVInHtml) problems.push(`missing ?v= in HTML asset: ${p}`);
  for (const p of missingVInImports) problems.push(`missing ?v= in import specifier: ${p}`);

  if (missingMeta.length) {
    problems.push(`missing <meta name="app-build"...> in HTML: ${missingMeta.join(", ")}`);
  }
  if (builds.size === 0) problems.push(`meta app-build not found (expected in index.html and tasks/*.html)`);
  if (vvals.size === 0) problems.push(`no ?v= found anywhere (cache-busting likely broken)`);
  if (!cfgVersion) problems.push(`cannot read CONFIG.content.version from app/config.js`);

  if (builds.size > 1) problems.push(`meta app-build differs: ${[...builds].join(", ")}`);
  if (vvals.size > 1) problems.push(`?v= differs: ${[...vvals].join(", ")}`);

  const build = builds.size ? [...builds][0] : "";
  const v = vvals.size ? [...vvals][0] : "";

  if (build && v && build !== v) problems.push(`meta app-build (${build}) != ?v= (${v})`);
  if (build && cfgVersion && build !== cfgVersion) problems.push(`meta app-build (${build}) != CONFIG.content.version (${cfgVersion})`);

  if (problems.length) {
    console.error("build/version mismatch:");
    for (const p of problems) console.error(`- ${p}`);
    process.exit(1);
  }

  console.log(`ok: build=${build}, v=${v}, content.version=${cfgVersion}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
