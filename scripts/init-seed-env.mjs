import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const credentials = ['ADMIN', 'ANALYST', 'VIEWER'].map(
  (role) =>
    `SEED_${role}_EMAIL=${role.toLowerCase()}@datascope.example.test\nSEED_${role}_PASSWORD=${randomBytes(24).toString('hex')}`,
);
try {
  await writeFile(
    new URL('../.env.seed.local', import.meta.url),
    `# Explicit local-only bootstrap. Never commit or use in production.\nSEED_ALLOW_LOCAL=true\n${credentials.join('\n')}\n`,
    { flag: 'wx', mode: 0o600 },
  );
  console.log(
    'Created ignored .env.seed.local with three distinct random local credentials.',
  );
} catch {
  console.error(
    'Could not create .env.seed.local; an existing file is never overwritten.',
  );
  process.exitCode = 1;
}
