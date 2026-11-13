import { Injectable } from '@nestjs/common';
import { schema, sql } from '@datascope/db';
import { searchRequestSchema, settingsSchema } from '@datascope/contracts';
import type { CurrentUser, SelectedExport } from '@datascope/contracts';
import { DatabaseService } from '../../database/database.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import { SecurityAudit } from '../permissions/security-audit.service.js';
import { AuthFailure } from '../auth/auth-http.js';
import { notFound } from '../../common/access.js';
import { validateSearch } from '../search/search-validation.js';
import { compileSearch } from '../search/search-compiler.js';
export function csvCell(value: string | boolean | null): string {
  let text = value === null ? '' : String(value);
  let first = '';
  for (const character of text) {
    if (
      character.charCodeAt(0) > 31 &&
      character.charCodeAt(0) !== 127 &&
      !/\s/u.test(character)
    ) {
      first = character;
      break;
    }
  }
  if (['=', '+', '-', '@'].includes(first) || /^[\t\r\n]/.test(text))
    text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
@Injectable()
export class ExportsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly permissions: PermissionsService,
    private readonly audit: SecurityAudit,
  ) {}
  async selected(user: CurrentUser, datasetId: string, body: SelectedExport) {
    return this.database.db.transaction(
      async (db) => {
        const access = await this.permissions.dataset(
          user,
          datasetId,
          'analyze',
          db,
        );
        const setting = await db.query.systemSettings.findFirst({
          where: sql`${schema.systemSettings.key}='exports.max_selected_rows'`,
        });
        const cap = settingsSchema.shape['exports.max_selected_rows'].parse(
          setting?.value ?? 1000,
        );
        if (body.recordIds.length > cap)
          throw new AuthFailure(
            400,
            'EXPORT_LIMIT',
            'Selected export limit exceeded',
          );
        const fields = await db
          .select()
          .from(schema.datasetFields)
          .where(sql`${schema.datasetFields.datasetId}=${datasetId}`)
          .limit(101);
        if (fields.length > 100) throw new Error('Field cap exceeded');
        const query = validateSearch(
          searchRequestSchema.parse({
            columns: body.columns,
            sort: [{ field: 'id', direction: 'asc' }],
          }),
          fields,
        );
        const compiled = compileSearch(
          datasetId,
          query,
          fields,
          this.permissions.visible(
            access.user,
            schema.datasetRecords.datasetId,
          ),
          body.recordIds,
        );
        const rows = await db.execute<{
          record: Record<string, string | boolean | null>;
        }>(compiled.rows);
        if (rows.rows.length !== body.recordIds.length) notFound();
        const header = body.columns.map((key) => csvCell(key)).join(',');
        const lines = rows.rows.map((row) =>
          body.columns.map((key) => csvCell(row.record[key] ?? null)).join(','),
        );
        this.audit.record(user.id, 'records.export.selected', datasetId, {
          count: body.recordIds.length.toString(),
        });
        return `${header}\r\n${lines.join('\r\n')}\r\n`;
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
}
