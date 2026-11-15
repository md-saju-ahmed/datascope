import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyDeploymentAssets } from './deploy.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

function main() {
  console.log(
    '[verify-ci] Starting DataScope GitHub Actions CI/CD Pipeline Verification...',
  );

  // 1. Verify workflow file existence
  const workflowPath = join(root, '.github/workflows/ci.yml');
  assert(
    existsSync(workflowPath),
    'Workflow file .github/workflows/ci.yml must exist',
  );
  const workflowContent = readFileSync(workflowPath, 'utf8');
  console.log('[verify-ci] ✓ .github/workflows/ci.yml exists');

  // 2. Read package.json to verify tool version alignment
  const packageJsonPath = join(root, 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const pnpmVersion =
    packageJson.packageManager?.replace(/^pnpm@/, '') || '12.18.0';
  console.log(`[verify-ci] ✓ Monorepo packageManager: pnpm@${pnpmVersion}`);

  // 3. Verify workflow triggers
  assert(
    workflowContent.includes('branches: [main]') &&
      workflowContent.includes('pull_request:') &&
      workflowContent.includes('workflow_dispatch:'),
    'Workflow must trigger on push to main, pull_request to main, and manual dispatch',
  );
  console.log(
    '[verify-ci] ✓ Workflow triggers: push (main), pull_request (main), workflow_dispatch',
  );

  // 4. Verify concurrency settings
  assert(
    workflowContent.includes('concurrency:') &&
      workflowContent.includes('cancel-in-progress:'),
    'Workflow must define concurrency group with conditional cancel-in-progress',
  );
  console.log('[verify-ci] ✓ Concurrency controls verified');

  // 5. Verify all four required stages exist
  const requiredJobs = ['quality', 'integration', 'build', 'deploy'];
  for (const job of requiredJobs) {
    const jobRegex = new RegExp(`^\\s*${job}:`, 'm');
    assert(
      jobRegex.test(workflowContent),
      `Workflow must contain job '${job}'`,
    );
  }
  console.log(
    '[verify-ci] ✓ All 4 required CI/CD jobs defined (quality, integration, build, deploy)',
  );

  // 6. Verify job dependency hierarchy
  assert(
    /integration:[\s\S]*?needs:\s*quality/.test(workflowContent),
    'Job integration must depend on quality',
  );
  assert(
    /build:[\s\S]*?needs:\s*\[quality,\s*integration\]/.test(workflowContent),
    'Job build must depend on both quality and integration',
  );
  assert(
    /deploy:[\s\S]*?needs:\s*build/.test(workflowContent),
    'Job deploy must depend on build',
  );
  console.log(
    '[verify-ci] ✓ Job dependency hierarchy verified: quality -> integration -> build -> deploy',
  );

  // 7. Verify deployment protection and gate compliance
  assert(
    workflowContent.includes('environment:') &&
      workflowContent.includes('name: production'),
    'Deploy job must be bound to production environment for owner review gate',
  );
  assert(
    /if:\s*github\.ref\s*==\s*'refs\/heads\/main'/.test(workflowContent),
    'Deploy job must be restricted to main branch pushes/dispatches',
  );
  console.log(
    '[verify-ci] ✓ Deployment gate protection verified: environment: production, main-branch restriction',
  );

  // 8. Verify tool pins in workflow match package.json engines
  assert(
    workflowContent.includes(`version: ${pnpmVersion}`),
    `pnpm setup in workflow must use pinned version ${pnpmVersion}`,
  );
  assert(
    workflowContent.includes('node-version: 24.x'),
    'Node.js setup in workflow must use Node 24.x matching engines.node',
  );
  console.log(
    `[verify-ci] ✓ Tool version pins verified: Node 24.x and pnpm ${pnpmVersion}`,
  );

  // 9. Verify quality job commands
  assert(
    workflowContent.includes('pnpm lint'),
    'Quality job must run pnpm lint',
  );
  assert(
    workflowContent.includes('pnpm format:check'),
    'Quality job must run pnpm format:check',
  );
  assert(
    workflowContent.includes('pnpm typecheck'),
    'Quality job must run pnpm typecheck',
  );
  assert(
    workflowContent.includes('pnpm test'),
    'Quality job must run pnpm test',
  );
  console.log(
    '[verify-ci] ✓ Quality commands verified: lint, format:check, typecheck, test',
  );

  // 10. Verify integration job commands
  assert(
    workflowContent.includes('pnpm env:init'),
    'Integration job must initialize test env',
  );
  assert(
    workflowContent.includes('pnpm db:test:up'),
    'Integration job must launch PostgreSQL service',
  );
  assert(
    workflowContent.includes('pnpm db:extensions:test'),
    'Integration job must install extensions',
  );
  assert(
    workflowContent.includes('pnpm db:migrate:test'),
    'Integration job must apply test migrations',
  );
  assert(
    workflowContent.includes('pnpm test:integration'),
    'Integration job must run test:integration',
  );
  assert(
    workflowContent.includes('docker compose --profile test down -v'),
    'Integration job must tear down test containers with volumes on completion',
  );
  console.log(
    '[verify-ci] ✓ Integration commands verified: env:init, db:test:up, extensions, migrations, test:integration, teardown',
  );

  // 11. Verify build job commands and multi-stage container builds
  assert(
    workflowContent.includes('pnpm build'),
    'Build job must run pnpm build',
  );
  assert(
    workflowContent.includes('docker build -f apps/api/Dockerfile'),
    'Build job must build API Docker image',
  );
  assert(
    workflowContent.includes('docker build -f apps/web/Dockerfile'),
    'Build job must build Web Docker image',
  );
  console.log(
    '[verify-ci] ✓ Build commands verified: pnpm build, API container build, Web container build',
  );

  // 12. Verify deployment script and core production assets
  assert(
    workflowContent.includes('node scripts/deploy.mjs'),
    'Deploy job must execute scripts/deploy.mjs',
  );
  const assetCheck = verifyDeploymentAssets(root);
  assert(
    assetCheck.valid,
    `Missing required deployment assets: ${assetCheck.missing.join(', ')}`,
  );
  console.log(
    `[verify-ci] ✓ Production deployment assets verified (${String(assetCheck.checkedCount)} files present)`,
  );

  const summary = {
    task: 'REL-02',
    status: 'VERIFIED',
    timestamp: new Date().toISOString(),
    workflow: '.github/workflows/ci.yml',
    jobs: requiredJobs,
    pnpmVersion,
    nodeVersion: '24.x',
    deploymentGates: {
      environment: 'production',
      branchRestriction: 'refs/heads/main',
      manualDispatchSupported: true,
    },
    assetCheck: {
      valid: assetCheck.valid,
      count: assetCheck.checkedCount,
    },
  };

  console.log('\n[verify-ci] === CI/CD Pipeline Audit Summary ===');
  console.log(JSON.stringify(summary, null, 2));
  console.log(
    '\n[verify-ci] All REL-02 CI/CD pipeline checks passed successfully.',
  );
}

try {
  main();
} catch (error) {
  console.error('[verify-ci] Verification failed:', error.message || error);
  process.exitCode = 1;
}
