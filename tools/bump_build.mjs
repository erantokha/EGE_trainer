// tools/bump_build.mjs
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

// We do not touch docs/ (navigation snapshots) and content/ (task data)
const SKIP_DIRS = new Set([".git", "docs", "content", "node_modules"]);
const INCLUDE_EXT = new Set([".html", ".js", ".css"]);

const META_RE = /(<meta\s+name=["']app-build["']\s+content=["'])([^"']*)(["'][^>]*>)/i;
const V_RE = /(\?v=)(\d{4}-\d{2}-\d{2}[A-Za-z0-9-]*)/g;

// app/config.js: content.version = '...'
const CONTENT_VERSION_RE = /(content:\s*{\s*[^}]*?\bversion:\s*')([^']*)(')/s;

function pad2(n) {
  return String(n).padStart(2, "0");
}

function todayStampLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
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

function isIncludedFile(fp) {
  const ext = path.extname(fp).toLowerCase();
  if (!INCLUDE_EXT.has(ext)) return false;

  const r = rel(fp);

  // Touch:
  // - root *.html (включая index.html и отдельные варианты главной)
  // - tasks/** (pages + scripts + css)
  // - app/** (shared modules)
  if (r.endsWith(".html") && !r.startsWith("docs/") && !r.startsWith("content/")) return true;
  if (r.startsWith("tasks/")) return true;
  if (r.startsWith("app/")) return true;

  return false;
}


async function readText(fp) {
  return await fs.readFile(fp, "utf8");
}

async function writeText(fp, text) {
  await fs.writeFile(fp, text, "utf8");
}

async function collectExistingBuildIds() {
  const ids = new Set();

  // Source of truth: meta app-build from html
  for await (const fp of walk(REPO_ROOT)) {
    if (!fp.endsWith(".html")) continue;

    const r = rel(fp);
    if (r.startsWith("docs/")) continue;

    let txt;
    try {
      txt = await readText(fp);
    } catch {
      continue;
    }
    const m = txt.match(META_RE);
    if (m?.[2]) ids.add(m[2]);
  }
  return ids;
}

function computeNextBuildId(existingBuildIds) {
  const base = todayStampLocal();
  let maxN = 0;

  for (const b of existingBuildIds) {
    const m = b.match(new RegExp(`^${base}-(\\d+)$`));
    if (!m) continue;
    maxN = Math.max(maxN, Number(m[1]));
  }
  return `${base}-${maxN + 1}`;
}

function replaceAllVersions(text, newBuild) {
  let out = text;

  // meta app-build
  out = out.replace(META_RE, `$1${newBuild}$3`);

  // ?v=...
  out = out.replace(V_RE, `$1${newBuild}`);

  return out;
}

async function main() {
  const arg = process.argv[2];
  const explicitBuild = arg && !arg.startsWith("--") ? arg : null;

  const existing = await collectExistingBuildIds();
  const newBuild = explicitBuild || computeNextBuildId(existing);

  const changed = [];
  const scanned = [];

  for await (const fp of walk(REPO_ROOT)) {
    if (!isIncludedFile(fp)) continue;

    const r = rel(fp);
    scanned.push(r);

    const txt = await readText(fp);
    let out = replaceAllVersions(txt, newBuild);

    // Also sync content.version in app/config.js
    if (r === "app/config.js") {
      out = out.replace(CONTENT_VERSION_RE, `$1${newBuild}$3`);
    }

    if (out !== txt) {
      await writeText(fp, out);
      changed.push(r);
    }
  }

  console.log(`new build: ${newBuild}`);
  console.log(`scanned files: ${scanned.length}`);
  console.log(`changed files: ${changed.length}`);
  if (changed.length) {
    console.log(changed.map((x) => ` - ${x}`).join("\n"));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
