import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import postgres from 'postgres';
// Single schema source, without a runtime TypeScript loader.
const source = await readFile(new URL('../lib/workspace/schema.ts', import.meta.url), 'utf8');
const schema = source.match(/`([\s\S]*)`;/)?.[1];
if (!schema || !process.env.DATABASE_URL) throw new Error('Schema and DATABASE_URL are required');
const migrationDir = new URL('../migrations/workspace/', import.meta.url);
const migrations = (await readdir(migrationDir)).filter(f => f.endsWith('.sql')).sort();
const checksum = text => createHash('sha256').update(text).digest('hex');
const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'verify-full', prepare: false });
try {
  const applied = await sql.begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(76391120)`;
    await tx.unsafe(schema);
    await tx`CREATE TABLE IF NOT EXISTS ns_workspace_migrations (
      filename text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`;
    const seenRows = await tx`SELECT filename,checksum FROM ns_workspace_migrations`;
    const seen = new Map(seenRows.map(row => [row.filename,row.checksum]));
    const ran = [];
    for (const filename of migrations) {
      const body = await readFile(new URL(filename, migrationDir), 'utf8');
      const sum = checksum(body);
      if (seen.has(filename)) {
        if (seen.get(filename) !== sum) throw new Error(`${filename} changed after application; add a new migration instead.`);
        continue;
      }
      await tx.unsafe(body);
      await tx`INSERT INTO ns_workspace_migrations (filename,checksum) VALUES (${filename},${sum})`;
      ran.push(filename);
    }
    return ran;
  });
  console.log(`Workspace schema ready${applied.length ? `. Applied ${applied.join(', ')}` : '; no new migrations'}. Existing patient tables unchanged.`);
} finally { await sql.end(); }
