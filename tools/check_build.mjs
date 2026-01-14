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
  const builds = new Set();
  const vvals = new Set();

  for await (const fp of walk(REPO_ROOT)) {
    const r = rel(fp);
    if (!shouldScanFile(r)) continue;

    const txt = await fs.readFile(fp, "utf8");

    const m = txt.match(META_RE);
    if (m?.[1]) builds.add(m[1]);

    let mm;
    while ((mm = V_RE.exec(txt)) !== null) {
      vvals.add(mm[1]);
    }
  }

  const problems = [];
  if (builds.size > 1) problems.push(`meta app-build differs: ${[...builds].join(", ")}`);
  if (vvals.size > 1) problems.push(`?v= differs: ${[...vvals].join(", ")}`);

  if (problems.length) {
    console.error("build/version mismatch:");
    for (const p of problems) console.error(`- ${p}`);
    process.exit(1);
  }

  console.log(`ok: build=${[...builds][0] || "none"}, v=${[...vvals][0] || "none"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
