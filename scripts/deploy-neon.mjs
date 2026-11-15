#!/usr/bin/env node
/**
 * scripts/deploy-neon.mjs
 *
 * Runs Drizzle migrations against the Neon PostgreSQL database and verifies
 * the required pg_trgm extension and minimum seed row count.
 *
 * Usage:
 *   DATABASE_URL=<neon-connection-string> node scripts/deploy-neon.mjs
 *
 * Required environment variable:
 *   DATABASE_URL — standard PostgreSQL connection string to your Neon database.
 *                  Use the NON-pooled ("direct") connection string for migrations;
 *                  Neon's pooler does not support session-level DDL transactions.
 *
 * Optional flags:
 *   --migrate-only   Run migrations and pg_trgm check, skip seed count verification
 *   --check-only     Check extensions and row count without running migrations
 */

import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pg = require('../packages/db/node_modules/pg');

const { Client } = pg;

const args = process.argv.slice(2);
const MIGRATE_ONLY = args.includes('--migrate-only');
const CHECK_ONLY = args.includes('--check-only');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error(
    '❌  DATABASE_URL is not set.\n' +
      '    Export it before running:\n' +
      '      DATABASE_URL=<neon-direct-url> node scripts/deploy-neon.mjs',
  );
  process.exit(1);
}

/** @param {string} label */
function step(label) {
  console.log(`\n▶  ${label}`);
}

/** @param {string} label */
function ok(label) {
  console.log(`✅  ${label}`);
}

/** @param {string} label */
function fail(label) {
  console.error(`❌  ${label}`);
}

const client = new Client({ connectionString: DATABASE_URL });

async function checkExtensions() {
  step('Checking pg_trgm extension …');
  const result = await client.query(
    "SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'",
  );
  if (result.rows.length === 0) {
    step(
      'pg_trgm not found — creating extension (requires superuser / Neon project admin) …',
    );
    await client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    ok('pg_trgm extension created');
  } else {
    ok('pg_trgm extension already installed');
  }
}

async function checkRowCount() {
  step('Verifying minimum seed row count (≥ 100,000 records) …');
  const result = await client.query(
    "SELECT COUNT(*) AS cnt FROM dataset_records WHERE dataset_id NOT IN (SELECT id FROM datasets WHERE slug = 'restricted')",
  );
  const count = parseInt(result.rows[0].cnt, 10);
  if (count >= 100_000) {
    ok(`Record count: ${count.toLocaleString()} ✓`);
  } else {
    fail(
      `Record count is only ${count.toLocaleString()} — expected ≥ 100,000.\n` +
        '    Run the seed against this database:\n' +
        '      DATABASE_URL=<neon-direct-url> pnpm db:seed',
    );
    return false;
  }
  return true;
}

async function runMigrations() {
  step('Running Drizzle migrations via pnpm db:migrate …');
  try {
    execSync('pnpm --filter @datascope/db db:migrate', {
      env: { ...process.env, DATABASE_URL },
      stdio: 'inherit',
    });
    ok('Migrations applied successfully');
  } catch (err) {
    fail(`Migration failed: ${err.message}`);
    throw err;
  }
}

async function main() {
  await client.connect();

  try {
    if (CHECK_ONLY) {
      await checkExtensions();
      await checkRowCount();
      ok('Check complete');
      return;
    }

    if (!MIGRATE_ONLY) {
      await checkExtensions();
    }

    await runMigrations();

    if (!MIGRATE_ONLY) {
      const seedOk = await checkRowCount();
      if (!seedOk) process.exitCode = 1;
    }

    console.log(
      '\n✅  Neon deployment preparation complete.\n' +
        '    Next step: deploy the API to Render (or trigger a Render deploy hook).\n' +
        '    Then run smoke tests:\n' +
        '      API_BASE_URL=https://<render-url> WEB_BASE_URL=https://<vercel-url> \\\n' +
        '      node scripts/smoke-deployment.mjs',
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Fatal:', err.message ?? err);
  process.exit(1);
});
