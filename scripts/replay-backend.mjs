import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';

// Copy only reviewable source, including proposed untracked files; no Git mutation.
const target = join(tmpdir(), `datascope-backend-replay-${Date.now()}`);
mkdirSync(target);
const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean);
const manifest = [];
for (const file of files) {
  if (
    file === 'AGENTS.md' ||
    /^(docs|technical-docs|\.git|\.codex|\.agents)\//.test(file) ||
    (/^\.env(?:\.|$)/.test(file) && file !== '.env.example')
  )
    throw new Error('Private source in replay inventory');
  const destination = resolve(target, file);
  const contained = relative(target, destination);
  if (isAbsolute(contained) || contained.split(/[\\/]/).includes('..'))
    throw new Error('Unsafe source path');
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(file, destination);
  const hash = (data) => createHash('sha256').update(data).digest('hex');
  const sha256 = hash(readFileSync(file));
  if (sha256 !== hash(readFileSync(destination)))
    throw new Error('Replay copy mismatch');
  manifest.push({ file, sha256 });
}
const results = [];
for (const command of [
  'pnpm install --frozen-lockfile --fetch-timeout 10000 --network-concurrency 4',
  'pnpm verify:backend',
]) {
  const log = join(target, `replay-${results.length}.log`);
  try {
    const output = execFileSync(
      process.platform === 'win32' ? 'cmd' : 'sh',
      process.platform === 'win32' ? ['/d', '/c', command] : ['-c', command],
      {
        cwd: target,
        encoding: 'utf8',
        windowsHide: true,
        timeout: 300000,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    writeFileSync(log, output);
    results.push({ command, exit: 0, log });
  } catch (error) {
    writeFileSync(
      log,
      String(error.stdout ?? '') + '\n' + String(error.stderr ?? ''),
    );
    results.push({ command, exit: error.status ?? 1, log });
    process.exitCode = 1;
    break;
  }
}
mkdirSync('docs/evidence/be-19-22', { recursive: true });
writeFileSync(
  'docs/evidence/be-19-22/replay.json',
  JSON.stringify(
    {
      target,
      method:
        'Fresh hash-verified source copy; no existing node_modules/build caches or private files; inherited environment supplies DB configuration; local pnpm store may be reused; not a committed checkout until owner commits.',
      manifest,
      results,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify({ target, files: manifest.length, results }, null, 2),
);
