import { argon2id, hash, verify } from 'argon2';
import type pg from 'pg';
import { databaseForClient } from '../client.js';
import { getMigrationStatus } from '../migrations.js';
import * as schema from '../schema/index.js';
import { assertSeedConnection, seedRoles } from './config.js';
import type { SeedConfiguration } from './config.js';
import {
  fieldDefinitions,
  fixedDate,
  primarySize,
  recordBase,
  secondarySize,
  seedDatasets,
  seedIds,
  seedKey,
  seedRecord,
  seedVersion,
} from './fixtures.js';

export interface SeedVerification {
  primaryCount: number;
  restrictedCount: number;
  fixtureMatchIds: string[];
  combinedMatchCount: number;
  dataChecksum: string;
}
export interface SeedResult extends SeedVerification {
  applied: boolean;
}

export async function verifySeed(
  client: pg.PoolClient,
): Promise<SeedVerification> {
  const counts = await client.query<{
    id: string;
    count: string;
    stored: string;
  }>(
    `select d.id, count(r.id)::text as count, d.record_count::text as stored
     from datasets d left join dataset_records r on r.dataset_id=d.id
     where d.id=any($1::uuid[]) group by d.id order by d.id`,
    [[seedIds.primary, seedIds.restricted]],
  );
  const primary = counts.rows.find((row) => row.id === seedIds.primary);
  const restricted = counts.rows.find((row) => row.id === seedIds.restricted);
  if (
    primary?.count !== primarySize.toString() ||
    primary.stored !== primary.count ||
    restricted?.count !== secondarySize.toString() ||
    restricted.stored !== restricted.count
  )
    throw new Error(
      'Seed row counts do not match; no automatic repair performed',
    );
  const matches = await client.query<{ id: string; fixture: boolean }>(
    `select id::text, (attributes->>'fixture')::boolean as fixture from dataset_records
     where dataset_id=$1 and status=$2 and country=$3 and revenue>$4
     and created_at >= $5 order by id`,
    [seedIds.primary, 'Active', 'Germany', '10000', '2026-01-01T00:00:00Z'],
  );
  const fixtureMatchIds = matches.rows
    .filter((row) => row.fixture)
    .map((row) => row.id);
  if (
    JSON.stringify(fixtureMatchIds) !==
    JSON.stringify([1n, 7n, 8n].map((n) => (recordBase + n).toString()))
  )
    throw new Error(
      'Known seed fixtures do not match; no automatic repair performed',
    );
  const digest = await client.query<{ checksum: string }>(
    `select md5(string_agg(jsonb_build_array(id::text,dataset_id,name,status,country,category,
     revenue,attributes,created_at,updated_at)::text, '|' order by id)) as checksum
     from dataset_records where dataset_id=any($1::uuid[])`,
    [[seedIds.primary, seedIds.restricted]],
  );
  const checksum = digest.rows[0]?.checksum;
  if (!checksum) throw new Error('Seed verification checksum unavailable');
  return {
    primaryCount: Number(primary.count),
    restrictedCount: Number(restricted.count),
    fixtureMatchIds,
    combinedMatchCount: matches.rowCount ?? 0,
    dataChecksum: checksum,
  };
}

export async function seedDatabase(
  pool: pg.Pool,
  config: SeedConfiguration,
): Promise<SeedResult> {
  assertSeedConnection(pool.options.connectionString ?? '', config);
  const client = await pool.connect();
  try {
    const context = await client.query<{ database: string; role: string }>(
      'select current_database() as database, current_user as role',
    );
    const target = new URL(pool.options.connectionString ?? '');
    if (
      context.rows[0]?.database !== target.pathname.slice(1) ||
      context.rows[0].role !== target.username
    )
      throw new Error('Seed connection identity mismatch');
    if (!(await getMigrationStatus(client)).ready)
      throw new Error('Seed requires current migrations');
    const db = databaseForClient(client);
    return await db.transaction(async (transaction) => {
      await client.query("set local timezone='UTC'");
      await client.query('select pg_advisory_xact_lock($1)', [178586370]);
      // Stable business data; randomized password salts are deliberately excluded.
      const manifest = {
        version: seedVersion,
        primarySize,
        secondarySize,
        accounts: config.accounts.map((a) => ({
          role: a.role,
          email: a.email,
        })),
      };
      const marker = await client.query<{ value: unknown }>(
        'select value from system_settings where key=$1',
        [seedKey],
      );
      const existing = marker.rows[0];
      if (existing) {
        const same = await client.query<{ same: boolean }>(
          'select $1::jsonb = $2::jsonb as same',
          [existing.value, manifest],
        );
        if (!same.rows[0]?.same)
          throw new Error(
            'Existing seed configuration differs; no changes made',
          );
        const users = await client.query<{
          id: string;
          email: string;
          role: string;
          password_hash: string;
          is_active: boolean;
        }>(
          'select id,email,role,password_hash,is_active from users where id=any($1::uuid[])',
          [seedRoles.map((role) => seedIds[role])],
        );
        for (const account of config.accounts) {
          const user = users.rows.find((u) => u.id === seedIds[account.role]);
          if (
            !user ||
            user.email !== account.email ||
            user.role !== account.role ||
            !user.is_active ||
            !(await verify(user.password_hash, account.password))
          )
            throw new Error(
              'Existing seed account differs; no account was overwritten',
            );
        }
        return { applied: false, ...(await verifySeed(client)) };
      }
      const conflicts = await client.query<{ conflict: boolean }>(
        `select exists(select 1 from users where id=any($1::uuid[]) or lower(email)=any($2::text[]))
         or exists(select 1 from datasets where id=any($3::uuid[]) or slug=any($4::text[]))
         or exists(select 1 from dataset_records where id between $5 and $6) as conflict`,
        [
          seedRoles.map((role) => seedIds[role]),
          config.accounts.map((a) => a.email),
          seedDatasets.map((d) => d.id),
          seedDatasets.map((d) => d.slug),
          (recordBase + 1n).toString(),
          (recordBase + BigInt(primarySize + secondarySize)).toString(),
        ],
      );
      if (conflicts.rows[0]?.conflict)
        throw new Error(
          'Seed identifiers or emails already exist; no changes made',
        );
      for (const account of config.accounts) {
        await transaction.insert(schema.users).values({
          id: seedIds[account.role],
          email: account.email,
          role: account.role,
          passwordHash: await hash(account.password, { type: argon2id }),
          createdAt: fixedDate,
          updatedAt: fixedDate,
        });
      }
      await transaction.insert(schema.datasets).values(seedDatasets);
      await transaction.insert(schema.datasetFields).values(
        seedDatasets.flatMap((dataset) =>
          fieldDefinitions.map((field, sortOrder) => ({
            datasetId: dataset.id,
            fieldKey: field.fieldKey,
            label: field.label,
            dataType: field.dataType,
            operators: [...field.operators],
            isSearchable: 'isSearchable' in field && field.isSearchable,
            isFilterable: true,
            isSortable: true,
            sortOrder,
            createdAt: fixedDate,
            updatedAt: fixedDate,
          })),
        ),
      );
      await transaction.insert(schema.datasetPermissions).values([
        {
          datasetId: seedIds.primary,
          userId: seedIds.analyst,
          permission: 'analyze',
          grantedBy: seedIds.admin,
          createdAt: fixedDate,
          updatedAt: fixedDate,
        },
        {
          datasetId: seedIds.primary,
          userId: seedIds.viewer,
          permission: 'read',
          grantedBy: seedIds.admin,
          createdAt: fixedDate,
          updatedAt: fixedDate,
        },
        {
          datasetId: seedIds.restricted,
          userId: seedIds.analyst,
          permission: 'analyze',
          grantedBy: seedIds.admin,
          createdAt: fixedDate,
          updatedAt: fixedDate,
        },
      ]);
      for (const secondary of [false, true]) {
        const size = secondary ? secondarySize : primarySize;
        for (let start = 0; start < size; start += 1000) {
          const batch = Array.from(
            { length: Math.min(1000, size - start) },
            (_, i) => seedRecord(start + i, secondary),
          );
          // Bind one JSON payload per batch. PostgreSQL performs typed conversion;
          // no identifiers or SQL fragments come from generated field values.
          await client.query(
            `insert into dataset_records
             (id,dataset_id,name,status,country,category,revenue,attributes,created_at,updated_at)
             select id,"datasetId",name,status,country,category,revenue,attributes,"createdAt","updatedAt"
             from jsonb_to_recordset($1::jsonb) as input(
               id bigint,"datasetId" uuid,name text,status text,country text,category text,
               revenue numeric(18,2),attributes jsonb,"createdAt" timestamptz,"updatedAt" timestamptz)`,
            [
              JSON.stringify(batch, (_key, value: unknown) =>
                typeof value === 'bigint' ? value.toString() : value,
              ),
            ],
          );
        }
      }
      await transaction.insert(schema.recordRelationships).values([
        {
          id: recordBase + 1n,
          sourceRecordId: recordBase + 1n,
          targetRecordId: recordBase + 7n,
          relationType: 'related_business',
          createdAt: fixedDate,
        },
        {
          id: recordBase + 2n,
          sourceRecordId: recordBase + 1n,
          targetRecordId: recordBase + BigInt(primarySize + 1),
          relationType: 'partner',
          createdAt: fixedDate,
        },
      ]);
      const result = await verifySeed(client);
      await transaction
        .insert(schema.systemSettings)
        .values({ key: seedKey, value: manifest, updatedBy: seedIds.admin });
      return { applied: true, ...result };
    });
  } finally {
    client.release();
  }
}
