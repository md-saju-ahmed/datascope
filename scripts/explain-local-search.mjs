import {
  createDatabase,
  getMigrationStatus,
  localMigrationUrl,
  seedIds,
} from '../packages/db/dist/index.js';

async function main() {
  if (
    !['development', 'test'].includes(process.env.NODE_ENV) ||
    process.argv.slice(2).some((arg) => arg !== '--test')
  )
    throw new Error('Local explain requires development/test mode');
  const { pool } = createDatabase({
    connectionString: localMigrationUrl(
      process.env,
      process.argv.includes('--test'),
    ),
    max: 1,
    connectionTimeoutMillis: 5000,
    statementTimeoutMillis: 30000,
  });
  pool.on('error', () => {
    console.error('Query-plan database unavailable');
  });
  try {
    if (!(await getMigrationStatus(pool)).ready)
      throw new Error('Migrations are not current');
    const count = await pool.query(
      'select count(*)::text as count from dataset_records where dataset_id=$1',
      [seedIds.primary],
    );
    if (Number(count.rows[0]?.count) < 100000)
      throw new Error('100k primary seed required');
    await pool.query('analyze public.dataset_records');
    const version = await pool.query('show server_version');
    const definitions = await pool.query(
      "select indexname,indexdef from pg_indexes where schemaname='public' and tablename='dataset_records' order by indexname",
    );
    const cases = [
      [
        'listing',
        'select id from dataset_records where dataset_id=$1 order by id limit 25',
        [],
      ],
      [
        'newest',
        'select id from dataset_records where dataset_id=$1 order by created_at desc nulls last,id desc nulls last limit 25',
        [],
      ],
      [
        'categorical',
        'select id from dataset_records where dataset_id=$1 and status=$2 and country=$3 order by id limit 25',
        ['Active', 'Germany'],
      ],
      [
        'revenue_range',
        'select id from dataset_records where dataset_id=$1 and revenue between $2 and $3 order by revenue,id limit 25',
        ['999900.00', '1000000.00'],
      ],
      [
        'full_text',
        "select id from dataset_records where dataset_id=$1 and search_vector @@ websearch_to_tsquery('simple',$2)",
        ['"Known Match Alpha"'],
      ],
      [
        'partial_name',
        'select id from dataset_records where dataset_id=$1 and lower(name) like $2',
        ['%match alpha%'],
      ],
      [
        'combined',
        'select id from dataset_records where dataset_id=$1 and status=$2 and country=$3 and revenue>$4 and created_at>=$5 order by id limit 25',
        ['Active', 'Germany', '10000', '2026-01-01T00:00:00Z'],
      ],
      [
        'deep_offset',
        'select id from dataset_records where dataset_id=$1 order by id offset 90000 limit 25',
        [],
      ],
    ];
    const plans = [];
    for (const [name, query, values] of cases) {
      const parameters = [seedIds.primary, ...values];
      const result = await pool.query(
        `explain (analyze,buffers,format json) ${query}`,
        parameters,
      );
      plans.push({
        name,
        query,
        parameters,
        plan: result.rows[0]['QUERY PLAN'][0],
      });
    }
    console.log(
      JSON.stringify(
        {
          scope:
            'Single local SQL samples after ANALYZE; no forced index paths, API or concurrent load measurement.',
          postgresVersion: version.rows[0].server_version,
          primaryCount: count.rows[0].count,
          indexes: definitions.rows,
          plans,
        },
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  console.error(
    'Query-plan capture failed; verify local mode, current migrations and the 100k seed.',
  );
  process.exitCode = 1;
});
