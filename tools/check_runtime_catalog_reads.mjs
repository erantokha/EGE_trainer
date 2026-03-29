// tools/check_runtime_catalog_reads.mjs
// Guards the stage-1 catalog migration seam:
// - runtime files in tasks/ must not read content/tasks/index.json directly
// - critical migrated files must use catalog provider adapters instead

import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TASKS_DIR = path.join(ROOT, 'tasks');
const FORBIDDEN_LITERAL = 'content/tasks/index.json';

const CRITICAL_FILES = [
  {
    relPath: 'tasks/analog.js',
    mustInclude: [
      "import { loadCatalogIndexLike } from '../app/providers/catalog.js",
      'const catalog = await loadCatalogIndexLike();',
    ],
  },
  {
    relPath: 'tasks/hw.js',
    mustInclude: [
      "import { loadCatalogIndexLike } from '../app/providers/catalog.js",
      'CATALOG = await loadCatalogIndexLike();',
    ],
  },
  {
    relPath: 'tasks/picker.js',
    mustInclude: [
      "import { loadCatalogIndexLike } from '../app/providers/catalog.js",
      'CATALOG = await loadCatalogIndexLike();',
    ],
  },
  {
    relPath: 'tasks/trainer.js',
    mustInclude: [
      "import { loadCatalogIndexLike } from '../app/providers/catalog.js",
      'CATALOG = await loadCatalogIndexLike();',
    ],
  },
];

async function listJsFiles(dir) {
  const out = [];
  const stack = [dir];

  while (stack.length) {
    const current = stack.pop();
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        out.push(full);
      }
    }
  }

  return out.sort();
}

async function readUtf8(relPath) {
  return fs.readFile(path.join(ROOT, relPath), 'utf8');
}

async function main() {
  const errors = [];

  const taskFiles = await listJsFiles(TASKS_DIR);
  for (const fullPath of taskFiles) {
    const relPath = path.relative(ROOT, fullPath).replace(/\\/g, '/');
    const content = await fs.readFile(fullPath, 'utf8');
    if (content.includes(FORBIDDEN_LITERAL)) {
      errors.push(`Forbidden direct catalog read in ${relPath}`);
    }
  }

  for (const file of CRITICAL_FILES) {
    const content = await readUtf8(file.relPath);
    for (const needle of file.mustInclude) {
      if (!content.includes(needle)) {
        errors.push(`Missing expected catalog-provider seam in ${file.relPath}: ${needle}`);
      }
    }
  }

  if (errors.length) {
    console.error('runtime catalog read check failed:');
    for (const err of errors) console.error(`- ${err}`);
    process.exit(1);
  }

  console.log('runtime catalog read checks ok');
  console.log(`task_js_files=${taskFiles.length}`);
  console.log(`critical_files=${CRITICAL_FILES.length}`);
}

main().catch((err) => {
  console.error('check_runtime_catalog_reads failed:', err?.stack || err);
  process.exit(2);
});
