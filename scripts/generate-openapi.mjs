import { writeFileSync, mkdirSync } from 'node:fs';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from '../packages/contracts/node_modules/zod/index.js';
import * as contracts from '../packages/contracts/dist/index.js';
const schemas = {};
const add = (name, input = false) => {
  const schema = contracts[name];
  if (!schema) throw new Error('Missing shared schema');
  const value = z.toJSONSchema(schema, { io: input ? 'input' : 'output' });
  delete value.$schema;
  schemas[name] = value;
  return { $ref: `#/components/schemas/${name}` };
};
const paths = {};
function route(path, method, response, body, query, description, status = 200) {
  const operation = {
    operationId: method + path.replace(/[^a-zA-Z]/g, ''),
    description,
    security: [{ SessionCookie: [] }],
    responses: {
      [status]: {
        description: 'Successful authorized operation',
        content: {
          [response === 'csv' ? 'text/csv' : 'application/json']: {
            schema: response === 'csv' ? { type: 'string' } : add(response),
          },
        },
      },
    },
    parameters: [],
  };
  for (const match of path.matchAll(/\{([^}]+)\}/g))
    operation.parameters.push({
      in: 'path',
      name: match[1],
      required: true,
      schema:
        match[1] === 'recordId'
          ? { type: 'string', pattern: '^[1-9][0-9]*$' }
          : { type: 'string', format: 'uuid' },
    });
  if (query) {
    const definition = z.toJSONSchema(contracts[query], { io: 'input' });
    for (const [name, schema] of Object.entries(definition.properties))
      operation.parameters.push({ in: 'query', name, schema, required: false });
  }
  if (body) {
    operation.requestBody = {
      required: true,
      content: { 'application/json': { schema: add(body, true) } },
    };
    operation.parameters.push({
      in: 'header',
      name: 'X-CSRF-Token',
      required: true,
      schema: { type: 'string' },
      description: 'Session-bound token and trusted Origin/Referer required',
    });
  }
  for (const code of [400, 401, 403, 404, 409, 413, 415, 429, 500, 503])
    operation.responses[code] = {
      description: 'Controlled safe error with correlation ID',
      content: { 'application/json': { schema: add('apiErrorSchema') } },
    };
  (paths[path] ??= {})[method] = operation;
}
route(
  '/saved-views',
  'get',
  'viewListResponseSchema',
  null,
  'viewListQuerySchema',
  'SQL-filtered owner/shared/Admin views; dataset visibility applies before count/paging.',
);
route(
  '/saved-views',
  'post',
  'viewResponseSchema',
  'viewCreateSchema',
  null,
  'Analyst/Admin; advanced authoring requires analyze/manage. Persist versioned metadata-validated configuration.',
  201,
);
route(
  '/saved-views/{viewId}',
  'get',
  'viewResponseSchema',
  null,
  null,
  'Owner/shared/Admin plus current dataset access.',
);
route(
  '/saved-views/{viewId}',
  'patch',
  'viewResponseSchema',
  'viewPatchSchema',
  null,
  'Owner/Admin only. Dataset/owner immutable; validate merged state.',
);
route(
  '/saved-views/{viewId}',
  'delete',
  'deletedResponseSchema',
  'logoutRequestSchema',
  null,
  'Owner/Admin; cascades shares.',
);
route(
  '/saved-views/{viewId}/apply',
  'post',
  'searchResponseSchema',
  'viewApplySchema',
  null,
  'Re-execute stored configuration after current share/dataset/metadata checks. Only paging overrides accepted. Authorized Viewer may consume advanced shared state read-only; raw advanced Viewer input remains denied.',
);
route(
  '/saved-views/{viewId}/shares',
  'post',
  'shareResponseSchema',
  'shareRequestSchema',
  null,
  'Owner/Admin; idempotent share with active recipient already authorized on dataset.',
  201,
);
route(
  '/saved-views/{viewId}/shares/{userId}',
  'delete',
  'deletedResponseSchema',
  'logoutRequestSchema',
  null,
  'Owner/Admin; idempotent share revocation, no dataset grant mutation.',
);
route(
  '/search-history',
  'get',
  'historyResponseSchema',
  null,
  'historyQuerySchema',
  'Own history only; exclude inaccessible datasets/view origins before count/paging.',
);
route(
  '/search-history',
  'delete',
  'historyClearResponseSchema',
  'logoutRequestSchema',
  null,
  'Clear only current user; serialize with concurrent history writes.',
);
route(
  '/datasets/{datasetId}/analytics',
  'get',
  'datasetAnalyticsResponseSchema',
  null,
  'analyticsQuerySchema',
  'Admin/Analyst analyze. Actual SQL aggregates; top50 category/status plus otherCount; daily growth/activity1â€“366days UTC, Analyst own activity/Admin dataset activity. Counts strings.',
);
route(
  '/analytics/platform',
  'get',
  'platformAnalyticsResponseSchema',
  null,
  null,
  'Admin only. Actual dataset/record/user counts including archived datasets.',
);
route(
  '/analytics/search-activity',
  'get',
  'activityResponseSchema',
  null,
  'activityQuerySchema',
  'Analyst own visible history or Admin dataset/platform scope. Viewer denied. Retained/deduplicated executions, not all-time counters.',
);
route(
  '/users',
  'get',
  'usersResponseSchema',
  null,
  'usersQuerySchema',
  'Admin only; bounded literal email search with minimal projections.',
);
route(
  '/users/{userId}',
  'patch',
  'userResponseSchema',
  'userPatchSchema',
  null,
  'Admin strict role/isActive changes; protect last active Admin under concurrency; deactivate revokes sessions.',
);
route(
  '/preferences/me',
  'get',
  'preferencesResponseSchema',
  null,
  null,
  'Own preferences with defaults; revoked default dataset is returned null.',
);
route(
  '/preferences/me',
  'patch',
  'preferencesResponseSchema',
  'preferencePatchSchema',
  null,
  'Own partial merge; no other user ID accepted; selected dataset access rechecked.',
);
route(
  '/system/settings',
  'get',
  'settingsResponseSchema',
  null,
  null,
  'Admin allowlist only; internal seed/settings omitted.',
);
route(
  '/system/settings',
  'patch',
  'settingsResponseSchema',
  'settingsPatchSchema',
  null,
  'Admin partial merge; registration.enabled and exports.max_selected_rows consumed by actual registration/export.',
);
route(
  '/datasets/{datasetId}/exports/selected',
  'post',
  'csv',
  'selectedExportSchema',
  null,
  'Admin/Analyst analyze.1â€“1000 unique string IDs or lower configured cap; all-or-error scoped membership; requested columns/order, stable numeric ID rows; quoted CSV/CRLF/formula protection, string decimals and empty null cells.',
);
route(
  '/health/live',
  'get',
  'livenessResponseSchema',
  null,
  null,
  'Process liveness',
);
route(
  '/health/ready',
  'get',
  'readinessResponseSchema',
  null,
  null,
  'Connectivity and exact migration readiness; unavailable returns safe 503.',
);
route(
  '/auth/csrf',
  'get',
  'csrfResponseSchema',
  null,
  null,
  'Bootstrap signed CSRF cookie/token; trusted origin when supplied.',
);
route(
  '/auth/register',
  'post',
  'authUserResponseSchema',
  'registerRequestSchema',
  null,
  'Public Viewer-only registration; signed CSRF and trusted Origin required; rate limited.',
  201,
);
route(
  '/auth/login',
  'post',
  'loginResponseSchema',
  'loginRequestSchema',
  null,
  'Public login; signed CSRF and trusted Origin required. Issues host-only HttpOnly session cookie.',
);
route(
  '/auth/logout',
  'post',
  'logoutResponseSchema',
  'logoutRequestSchema',
  null,
  'Revoke current session and clear cookie.',
);
route(
  '/auth/me',
  'get',
  'authUserResponseSchema',
  null,
  null,
  'Live authenticated principal.',
);
route(
  '/datasets',
  'get',
  'datasetListResponseSchema',
  null,
  'datasetListQuerySchema',
  'Permitted datasets only; SQL visibility before pagination.',
);
route(
  '/datasets',
  'post',
  'datasetResponseSchema',
  'datasetCreateSchema',
  null,
  'Admin create empty dataset.',
  201,
);
route(
  '/datasets/{datasetId}',
  'get',
  'datasetResponseSchema',
  null,
  null,
  'Current dataset read access required.',
);
route(
  '/datasets/{datasetId}',
  'patch',
  'datasetResponseSchema',
  'datasetPatchSchema',
  null,
  'Admin metadata update.',
);
route(
  '/datasets/{datasetId}',
  'delete',
  'datasetResponseSchema',
  null,
  null,
  'Admin archive; preserves records.',
);
route(
  '/datasets/{datasetId}/fields',
  'get',
  'fieldListResponseSchema',
  null,
  'pageQuerySchema',
  'Authorized metadata; bounded pages.',
);
route(
  '/datasets/{datasetId}/fields',
  'post',
  'fieldResponseSchema',
  'fieldCreateSchema',
  null,
  'Admin metadata creation; searchable changes synchronously refresh vectors.',
  201,
);
route(
  '/datasets/{datasetId}/fields/{fieldId}',
  'patch',
  'fieldResponseSchema',
  'fieldPatchSchema',
  null,
  'Admin validated metadata update.',
);
route(
  '/datasets/{datasetId}/permissions',
  'get',
  'grantListResponseSchema',
  null,
  'pageQuerySchema',
  'Admin grants list.',
);
route(
  '/datasets/{datasetId}/permissions/{userId}',
  'put',
  'grantResponseSchema',
  'permissionWriteSchema',
  null,
  'Admin grant/upsert.',
);
route(
  '/datasets/{datasetId}/permissions/{userId}',
  'delete',
  'revokedResponseSchema',
  null,
  null,
  'Admin revoke.',
);
route(
  '/datasets/{datasetId}/search',
  'post',
  'searchResponseSchema',
  'searchRequestSchema',
  null,
  'Parameterized retrieval with exact snapshot count. Basic q/eq/in categorical filters; advanced requires Admin or Analyst analyze/manage. 60 searches/user/minute, 10s deadline.',
);
route(
  '/datasets/{datasetId}/records/{recordId}',
  'get',
  'recordResponseSchema',
  null,
  null,
  'Authorized full detail; bigint and decimals are strings.',
);
route(
  '/datasets/{datasetId}/records/{recordId}/related',
  'get',
  'relatedListResponseSchema',
  null,
  'pageQuerySchema',
  'Check target dataset visibility before count/paging.',
);
route(
  '/datasets/{datasetId}/records/{recordId}/changes',
  'get',
  'changesResponseSchema',
  null,
  'pageQuerySchema',
  'Real history where available; honest empty list.',
);
for (const path of [
  '/health/live',
  '/health/ready',
  '/auth/csrf',
  '/auth/register',
  '/auth/login',
]) {
  for (const operation of Object.values(paths[path])) operation.security = [];
}
for (const [path, methods] of Object.entries(paths))
  for (const [method, operation] of Object.entries(methods)) {
    if (
      ['post', 'put', 'patch', 'delete'].includes(method) &&
      !operation.parameters.some((p) => p.name === 'X-CSRF-Token')
    )
      operation.parameters.push({
        in: 'header',
        name: 'X-CSRF-Token',
        required: true,
        schema: { type: 'string' },
        description:
          'Signed session-bound CSRF; trusted Origin/Referer required.',
      });
    if (path.includes('/health/'))
      operation.responses[503] = {
        description: 'Not ready',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                code: { const: 'DATABASE_UNAVAILABLE' },
                message: { const: 'Service is not ready' },
              },
              required: ['code', 'message'],
              additionalProperties: false,
            },
          },
        },
      };
  }
paths['/datasets/{datasetId}/search'].post.parameters.push({
  in: 'header',
  name: 'X-Search-Intent',
  required: false,
  schema: { type: 'string', enum: ['apply'] },
  description:
    'Only explicit user-applied searches record deduplicated history. Omit on background/paging requests.',
});
// Compare the whole inventory to actual Nest route decorators, independently of this list.
const actual = [];
for (const directory of readdirSync('apps/api/src/modules')) {
  for (const file of readdirSync(`apps/api/src/modules/${directory}`).filter(
    (f) => f.endsWith('.controller.ts'),
  )) {
    const source = readFileSync(
      `apps/api/src/modules/${directory}/${file}`,
      'utf8',
    );
    const declaration = /@Controller\((?:'([^']+)')?\)/.exec(source);
    if (!declaration) throw new Error('Controller prefix missing');
    const prefix = declaration[1] ?? '';
    for (const match of source.matchAll(
      /@(Get|Post|Put|Patch|Delete)\((?:'([^']*)')?\)/g,
    ))
      actual.push(
        `${match[1].toLowerCase()} /${[prefix, match[2]]
          .filter(Boolean)
          .join('/')
          .replace(/:([A-Za-z]+)/g, '{$1}')}`,
      );
  }
}
const documented = Object.entries(paths).flatMap(([path, methods]) =>
  Object.keys(methods).map((method) => `${method} ${path}`),
);
if (JSON.stringify(actual.sort()) !== JSON.stringify(documented.sort()))
  throw new Error('OpenAPI inventory differs from controllers');
const document = {
  openapi: '3.1.0',
  info: {
    title: 'DataScope Backend API',
    version: '1.0.0',
    description:
      'Generated from canonical runtime Zod schemas, with complete controller inventory check. Runtime field metadata constrains filters/projections further. Session authentication, role and dataset authorization are enforced by NestJS. README specifies behavior and operational limits.',
  },
  servers: [{ url: '/api/v1' }],
  paths,
  components: {
    securitySchemes: {
      SessionCookie: {
        type: 'apiKey',
        in: 'cookie',
        name: 'datascope_session',
        description: 'Use __Host-datascope_session in production HTTPS.',
      },
    },
    schemas,
  },
};
const output = resolve(process.argv[2] ?? 'technical-docs/api');
mkdirSync(output, { recursive: true });
const encoded = JSON.stringify(document, null, 2) + '\n';
writeFileSync(`${output}/openapi.json`, encoded);
// Swagger UI is a viewer only; embedded spec contains no private runtime data.
writeFileSync(
  `${output}/index.html`,
  `<!doctype html><html lang="en"><meta charset="utf-8"><title>DataScope API</title><link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css"><div id="swagger-ui"></div><script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script><script>SwaggerUIBundle({spec:${encoded.replaceAll('<', '\\u003c')},dom_id:'#swagger-ui',supportedSubmitMethods:[]});</script></html>`,
);
console.log(
  `Generated ${actual.length} operations; exact Nest controller inventory PASS; schemas from current runtime contracts.`,
);
