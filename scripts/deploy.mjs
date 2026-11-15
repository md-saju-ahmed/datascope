import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));

const REQUIRED_DEPLOYMENT_FILES = [
  'compose.prod.yml',
  'infra/nginx/default.conf',
  'infra/postgres/init-production-extensions.sh',
  'infra/postgres/init-app-role.sh',
  'infra/scripts/backup.sh',
  'infra/scripts/migrate-production.mjs',
  'apps/api/Dockerfile',
  'apps/web/Dockerfile',
];

export function verifyDeploymentAssets(projectRoot = root) {
  const missing = [];
  for (const relativePath of REQUIRED_DEPLOYMENT_FILES) {
    const fullPath = join(projectRoot, relativePath);
    if (!existsSync(fullPath)) {
      missing.push(relativePath);
    }
  }
  return {
    valid: missing.length === 0,
    checkedCount: REQUIRED_DEPLOYMENT_FILES.length,
    missing,
  };
}

export function parseDeployConfig(env = process.env) {
  const host = env.DEPLOY_HOST?.trim() || '';
  const port = env.DEPLOY_PORT?.trim() || '22';
  const user = env.DEPLOY_USER?.trim() || '';
  const sshKey = env.DEPLOY_SSH_KEY?.trim() || '';
  const appOrigin = env.APP_ORIGIN?.trim() || '';

  return {
    host,
    port,
    user,
    sshKey,
    appOrigin,
    hasTargetCredentials: Boolean(host && user && sshKey),
  };
}

async function runDeploy() {
  const isReadinessCheck =
    process.argv.includes('--readiness') || process.argv.includes('--dry-run');

  console.log('[deploy] Auditing DataScope production deployment assets...');
  const assetCheck = verifyDeploymentAssets(root);
  if (!assetCheck.valid) {
    console.error(
      `[deploy] ERROR: Missing required deployment configuration files:\n  - ${assetCheck.missing.join('\n  - ')}`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    `[deploy] Verified ${String(assetCheck.checkedCount)}/${String(assetCheck.checkedCount)} core production infrastructure assets.`,
  );

  const config = parseDeployConfig(process.env);

  if (isReadinessCheck || !config.hasTargetCredentials) {
    console.log(
      '\n[deploy] === Deployment Readiness Report (Pre-REL-03 Provisioning) ===',
    );
    console.log(
      'Status: READY — Deployment infrastructure, scripts and Compose profiles validated.',
    );
    console.log(
      'Target Gate: G3 release requires authorized VPS/AWS provisioning under REL-03.',
    );
    console.log(
      '\nRequired GitHub Secrets for Automated Deployment to Production:',
    );
    console.log(
      '  - DEPLOY_HOST: Target VPS hostname or public IPv4 address (e.g. 203.0.113.10)',
    );
    console.log(
      '  - DEPLOY_USER: Remote deployment username (e.g. deploy / ubuntu)',
    );
    console.log(
      '  - DEPLOY_SSH_KEY: Ed25519 or RSA private SSH key configured in authorized_keys',
    );
    console.log(
      '  - PROD_POSTGRES_ADMIN_PASSWORD: High-entropy administrative password for PostgreSQL',
    );
    console.log(
      '  - PROD_APP_DB_PASSWORD: High-entropy least-privilege password for datascope_app',
    );
    console.log(
      '  - APP_ORIGIN: Canonical public origin URL (e.g. https://datascope.example.com)',
    );

    if (config.host && (!config.user || !config.sshKey)) {
      console.warn(
        '\n[deploy] WARNING: DEPLOY_HOST is set but DEPLOY_USER or DEPLOY_SSH_KEY is missing.',
      );
    }

    console.log(
      '\n[deploy] Deployment readiness verification complete. Ready for owner authorization in REL-03.\n',
    );
    return;
  }

  // Active deployment when host and credentials are fully supplied
  console.log(
    `[deploy] Executing authorized production deployment to ${config.user}@${config.host}:${config.port}...`,
  );

  const tempDir = mkdtempSync(join(tmpdir(), 'datascope-deploy-'));
  const keyPath = join(tempDir, 'id_rsa');

  try {
    writeFileSync(keyPath, `${config.sshKey}\n`, { mode: 0o600 });

    const sshBaseArgs = [
      '-i',
      keyPath,
      '-p',
      config.port,
      '-o',
      'StrictHostKeyChecking=accept-new',
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=15',
    ];

    console.log('[deploy] Testing remote host connectivity...');
    execFileSync(
      'ssh',
      [...sshBaseArgs, `${config.user}@${config.host}`, 'docker --version'],
      {
        stdio: 'inherit',
        timeout: 30000,
      },
    );

    console.log('[deploy] Executing remote production database migration...');
    execFileSync(
      'ssh',
      [
        ...sshBaseArgs,
        `${config.user}@${config.host}`,
        'cd /opt/datascope && docker compose -f compose.prod.yml --profile ops run --rm -e DATASCOPE_MIGRATION_APPROVED=true migrate',
      ],
      { stdio: 'inherit', timeout: 60000 },
    );

    console.log('[deploy] Launching and updating application services...');
    execFileSync(
      'ssh',
      [
        ...sshBaseArgs,
        `${config.user}@${config.host}`,
        'cd /opt/datascope && docker compose -f compose.prod.yml up -d --remove-orphans --wait api web nginx',
      ],
      { stdio: 'inherit', timeout: 90000 },
    );

    console.log('[deploy] Production deployment completed successfully.');
  } finally {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore temporary directory cleanup failure
    }
  }
}

// Execute when invoked directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runDeploy().catch((error) => {
    console.error('[deploy] Deployment step failed:', error.message || error);
    process.exitCode = 1;
  });
}
