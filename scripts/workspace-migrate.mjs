import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
// Single schema source, without a runtime TypeScript loader.
const source = await readFile(new URL('../lib/workspace/schema.ts', import.meta.url), 'utf8');
const schema = source.match(/`([\s\S]*)`;/)?.[1];
if (!schema || !process.env.DATABASE_URL) throw new Error('Schema and DATABASE_URL are required');
const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'verify-full', prepare: false });
try {
  await sql.begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(76391120)`;
    await tx.unsafe(schema);
  });
  console.log('Workspace schema ready. Existing patient tables unchanged.');
} finally { await sql.end(); }
