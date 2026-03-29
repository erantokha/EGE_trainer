// tools/check_runtime_rpc_registry.mjs
// Checks stage-0 governance docs for runtime-RPC:
// - every registry row has a valid owner and status
// - source_sql_file points to an existing file in repo
// - standalone_sql rows point to .sql files that exist
// - summary counters in registry match actual table rows
// - temporary migration exceptions include required fields and valid owners

import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REGISTRY_FILE = 'docs/supabase/runtime_rpc_registry.md';
const EXCEPTIONS_FILE = 'docs/navigation/temporary_migration_exceptions.md';

const VALID_OWNERS = new Set([
  'auth-profile',
  'homework-domain',
  'teacher-directory',
  'student-analytics',
  'teacher-picking',
]);

const VALID_STATUSES = new Set([
  'standalone_sql',
  'snapshot_only',
  'missing_in_repo',
]);

function stripCell(value) {
  let out = String(value || '').trim();
  out = out.replace(/^\[([^\]]+)\]\(([^)]+)\)$/, '$2');
  if (out.startsWith('`') && out.endsWith('`')) out = out.slice(1, -1);
  return out.trim();
}

function parseMarkdownTableRows(content) {
  const rows = [];
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((x) => x.trim());
    if (cells.length !== 7) continue;
    if (cells[0] === 'canonical_name') continue;
    if (cells.every((x) => /^:?-{3,}:?$/.test(x))) continue;

    rows.push({
      canonical_name: stripCell(cells[0]),
      aliases: stripCell(cells[1]),
      used_by: stripCell(cells[2]),
      source_sql_file: stripCell(cells[3]),
      owner: stripCell(cells[4]),
      status: stripCell(cells[5]),
      notes: stripCell(cells[6]),
    });
  }

  return rows;
}

function parseSummary(content) {
  const summary = {};
  const backtickedRe = /^- `([^`]+)`: `(\d+)`$/gm;
  for (const match of content.matchAll(backtickedRe)) {
    summary[match[1]] = Number(match[2]);
  }
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const totalMatch = line.match(/^- .*runtime-RPC.*: `(\d+)`$/);
    if (totalMatch) {
      summary.total_runtime_rpc = Number(totalMatch[1]);
    }
  }
  return summary;
}

function parseExceptionBlocks(content) {
  const chunks = content.split(/^###\s+/m).slice(1);
  const blocks = [];

  for (const chunk of chunks) {
    const lines = chunk.split(/\r?\n/);
    const headingId = (lines.shift() || '').trim();
    const body = lines.join('\n');
    const fields = {};
    const fieldRe = /^- `([^`]+)`: (.+)$/gm;
    for (const fm of body.matchAll(fieldRe)) {
      fields[fm[1].trim()] = stripCell(fm[2]);
    }
    blocks.push({ headingId, fields });
  }
  return blocks;
}

async function existsRel(relPath) {
  if (!relPath || relPath === '-') return false;
  try {
    await fs.access(path.join(ROOT, relPath));
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const [registryContent, exceptionsContent] = await Promise.all([
    fs.readFile(path.join(ROOT, REGISTRY_FILE), 'utf8'),
    fs.readFile(path.join(ROOT, EXCEPTIONS_FILE), 'utf8'),
  ]);

  const errors = [];
  const rows = parseMarkdownTableRows(registryContent);
  const summary = parseSummary(registryContent);

  if (!rows.length) {
    errors.push(`No runtime-RPC rows parsed from ${REGISTRY_FILE}`);
  }

  const seenNames = new Set();
  let standaloneCount = 0;
  let snapshotOnlyCount = 0;
  let missingCount = 0;

  for (const row of rows) {
    const name = row.canonical_name;
    if (!name) {
      errors.push('Registry row with empty canonical_name');
      continue;
    }
    if (seenNames.has(name)) {
      errors.push(`Duplicate canonical_name in registry: ${name}`);
    }
    seenNames.add(name);

    if (!VALID_OWNERS.has(row.owner)) {
      errors.push(`Invalid owner for ${name}: ${row.owner || '(empty)'}`);
    }

    if (!VALID_STATUSES.has(row.status)) {
      errors.push(`Invalid status for ${name}: ${row.status || '(empty)'}`);
    }

    if (!row.source_sql_file || row.source_sql_file === '-') {
      errors.push(`Missing source_sql_file for ${name}`);
    } else if (!(await existsRel(row.source_sql_file))) {
      errors.push(`source_sql_file does not exist for ${name}: ${row.source_sql_file}`);
    }

    if (row.status === 'standalone_sql') {
      standaloneCount++;
      if (!row.source_sql_file.endsWith('.sql')) {
        errors.push(`standalone_sql row must point to .sql file for ${name}: ${row.source_sql_file}`);
      }
    } else if (row.status === 'snapshot_only') {
      snapshotOnlyCount++;
    } else if (row.status === 'missing_in_repo') {
      missingCount++;
    }
  }

  const expectedTotal = rows.length;
  if (summary.total_runtime_rpc !== expectedTotal) {
    errors.push(
      `Registry total mismatch: summary=${summary.total_runtime_rpc} actual=${expectedTotal}`
    );
  }
  if (summary['standalone_sql'] !== standaloneCount) {
    errors.push(`standalone_sql count mismatch: summary=${summary['standalone_sql']} actual=${standaloneCount}`);
  }
  if (summary['snapshot_only'] !== snapshotOnlyCount) {
    errors.push(`snapshot_only count mismatch: summary=${summary['snapshot_only']} actual=${snapshotOnlyCount}`);
  }
  if (summary['missing_in_repo'] !== missingCount) {
    errors.push(`missing_in_repo count mismatch: summary=${summary['missing_in_repo']} actual=${missingCount}`);
  }

  const exceptionBlocks = parseExceptionBlocks(exceptionsContent);
  const requiredExceptionFields = [
    'id',
    'what',
    'where',
    'why_allowed_now',
    'target_state',
    'remove_by_stage',
    'owner',
  ];

  if (!exceptionBlocks.length) {
    errors.push(`No exception blocks parsed from ${EXCEPTIONS_FILE}`);
  }

  for (const block of exceptionBlocks) {
    if (block.fields.id !== block.headingId) {
      errors.push(`Exception heading/id mismatch: heading=${block.headingId} id=${block.fields.id || '(missing)'}`);
    }

    for (const field of requiredExceptionFields) {
      if (!block.fields[field]) {
        errors.push(`Exception ${block.headingId} is missing required field: ${field}`);
      }
    }

    if (block.fields.owner && !VALID_OWNERS.has(block.fields.owner)) {
      errors.push(`Exception ${block.headingId} has invalid owner: ${block.fields.owner}`);
    }
  }

  if (errors.length) {
    console.error('runtime-rpc registry check failed:');
    for (const err of errors) console.error(`- ${err}`);
    process.exit(1);
  }

  console.log('runtime-rpc registry ok');
  console.log(`rows=${rows.length} standalone_sql=${standaloneCount} snapshot_only=${snapshotOnlyCount} missing_in_repo=${missingCount}`);
  console.log(`exceptions=${exceptionBlocks.length}`);
}

main().catch((err) => {
  console.error('check_runtime_rpc_registry failed:', err?.stack || err);
  process.exit(2);
});
