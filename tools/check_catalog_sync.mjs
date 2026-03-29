// tools/check_catalog_sync.mjs
// Проверяет что catalog_upsert_v1.sql применён в Supabase.
// Сравнивает catalog_version из заголовка SQL-файла с версией в БД.
//
// Использование:
//   node tools/check_catalog_sync.mjs
//
// Env:
//   SUPABASE_URL       — https://<project>.supabase.co
//   SUPABASE_ANON_KEY  — публичный anon-ключ (не service_role)
//
// Если переменные не заданы — выводит предупреждение и завершается успешно
// (позволяет запускать локально без credentials).

import fs from 'node:fs/promises';
import path from 'node:path';

const SQL_FILE = 'docs/supabase/catalog_upsert_v1.sql';

async function main() {
  const root = process.cwd();

  // 1. Читаем catalog_version из заголовка SQL-файла
  const sqlPath = path.join(root, SQL_FILE);
  let sqlContent;
  try {
    sqlContent = await fs.readFile(sqlPath, 'utf8');
  } catch {
    console.error(`[catalog-sync] ERROR: ${SQL_FILE} not found.`);
    console.error('[catalog-sync] Run: node tools/export_catalog.mjs --out docs/supabase/catalog_upsert_v1.sql');
    process.exitCode = 1;
    return;
  }

  const match = sqlContent.match(/^-- catalog_version:\s*(\S+)/m);
  if (!match) {
    console.error('[catalog-sync] ERROR: catalog_version not found in SQL file header.');
    process.exitCode = 1;
    return;
  }
  const sqlVersion = match[1].trim();

  // 2. Проверяем наличие credentials
  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !supabaseKey) {
    console.warn('[catalog-sync] WARN: SUPABASE_URL / SUPABASE_ANON_KEY not set — skipping DB check.');
    console.warn(`[catalog-sync] SQL file version: ${sqlVersion}`);
    console.warn('[catalog-sync] Add secrets to GitHub or .env to enable full check.');
    return; // не ошибка — просто пропускаем
  }

  // 3. Запрашиваем текущую версию из БД через публичную RPC-функцию
  let dbVersion;
  try {
    const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/get_catalog_version`, {
      method: 'POST',
      headers: {
        'apikey':        supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type':  'application/json',
      },
      body: '{}',
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`HTTP ${resp.status}: ${text}`);
    }
    dbVersion = (await resp.json()) ?? null;
  } catch (e) {
    console.error('[catalog-sync] ERROR: Failed to query Supabase:', e.message);
    process.exitCode = 1;
    return;
  }

  // 4. Сравниваем
  console.log(`[catalog-sync] SQL file:  ${sqlVersion}`);
  console.log(`[catalog-sync] Supabase:  ${dbVersion ?? '(empty — таблицы пусты?)'}`);

  if (sqlVersion === dbVersion) {
    console.log('[catalog-sync] OK — catalog is in sync.');
  } else {
    console.error('');
    console.error('[catalog-sync] ════════════════════════════════════════════════════');
    console.error('[catalog-sync] FAIL — catalog is OUT OF SYNC with Supabase.');
    console.error('[catalog-sync] Примени docs/supabase/catalog_upsert_v1.sql');
    console.error('[catalog-sync] в Supabase SQL Editor и сделай git push.');
    console.error('[catalog-sync] ════════════════════════════════════════════════════');
    process.exitCode = 1;
  }
}

main().catch(e => {
  console.error('[catalog-sync] Unexpected error:', e);
  process.exitCode = 1;
});
