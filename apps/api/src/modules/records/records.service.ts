import { Injectable } from '@nestjs/common';
import { schema, sql } from '@datascope/db';
import type {
  CurrentUser,
  PageQuery,
  RecordDetail,
  RecordSummary,
  RelatedRecord,
  RecordChange,
} from '@datascope/contracts';
import { DatabaseService } from '../../database/database.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import { notFound, offset, pageInfo } from '../../common/access.js';

const projection = {
  id: schema.datasetRecords.id,
  datasetId: schema.datasetRecords.datasetId,
  name: schema.datasetRecords.name,
  status: schema.datasetRecords.status,
  country: schema.datasetRecords.country,
  category: schema.datasetRecords.category,
  revenue: schema.datasetRecords.revenue,
  createdAt: schema.datasetRecords.createdAt,
  updatedAt: schema.datasetRecords.updatedAt,
};
type SummaryRow = Pick<
  typeof schema.datasetRecords.$inferSelect,
  keyof typeof projection
>;
function summary(row: SummaryRow): RecordSummary {
  return {
    ...row,
    id: row.id.toString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class RecordsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly permissions: PermissionsService,
  ) {}

  async detail(
    user: CurrentUser,
    datasetId: string,
    recordId: string,
  ): Promise<{ data: RecordDetail }> {
    await this.permissions.dataset(user, datasetId);
    const [row] = await this.database.db
      .select({ ...projection, attributes: schema.datasetRecords.attributes })
      .from(schema.datasetRecords)
      .where(
        sql`${schema.datasetRecords.datasetId} = ${datasetId} and ${schema.datasetRecords.id} = ${recordId} and ${this.permissions.visible(user, schema.datasetRecords.datasetId)}`,
      )
      .limit(1);
    if (!row) notFound();
    return { data: { ...summary(row), attributes: row.attributes } };
  }

  async related(
    user: CurrentUser,
    datasetId: string,
    recordId: string,
    query: PageQuery,
  ) {
    await this.assertRecord(user, datasetId, recordId);
    const related = schema.recordRelationships;
    const target = sql`case when ${related.sourceRecordId} = ${recordId} then ${related.targetRecordId} else ${related.sourceRecordId} end`;
    const predicate = sql`(${related.sourceRecordId} = ${recordId} or ${related.targetRecordId} = ${recordId}) and ${this.permissions.visible(user, schema.datasetRecords.datasetId)}`;
    const rows = await this.database.db
      .select({
        relationId: related.id,
        relationType: related.relationType,
        sourceId: related.sourceRecordId,
        record: projection,
      })
      .from(related)
      .innerJoin(
        schema.datasetRecords,
        sql`${schema.datasetRecords.id} = ${target}`,
      )
      .where(predicate)
      .orderBy(related.id)
      .limit(query.pageSize)
      .offset(offset(query));
    const count = await this.database.db.execute<{ total: string }>(
      sql`select count(*)::text as total from record_relationships inner join dataset_records on dataset_records.id = ${target} where ${predicate}`,
    );
    const data: RelatedRecord[] = rows.map((row) => ({
      relationId: row.relationId.toString(),
      relationType: row.relationType,
      direction: row.sourceId.toString() === recordId ? 'outgoing' : 'incoming',
      record: summary(row.record),
    }));
    return {
      data,
      pageInfo: pageInfo(query, Number(count.rows[0]?.total ?? 0)),
    };
  }

  async changes(
    user: CurrentUser,
    datasetId: string,
    recordId: string,
    query: PageQuery,
  ) {
    await this.assertRecord(user, datasetId, recordId);
    const rows = await this.database.db.query.recordChanges.findMany({
      where: sql`${schema.recordChanges.recordId} = ${recordId}`,
      orderBy: (table, { desc }) => [desc(table.changedAt), desc(table.id)],
      limit: query.pageSize,
      offset: offset(query),
    });
    const count = await this.database.db.execute<{ total: string }>(
      sql`select count(*)::text as total from record_changes where record_id = ${recordId}`,
    );
    const data: RecordChange[] = rows.map((row) => ({
      ...row,
      id: row.id.toString(),
      recordId: row.recordId.toString(),
      changedAt: row.changedAt.toISOString(),
    }));
    return {
      data,
      pageInfo: pageInfo(query, Number(count.rows[0]?.total ?? 0)),
    };
  }

  private async assertRecord(
    user: CurrentUser,
    datasetId: string,
    recordId: string,
  ): Promise<void> {
    await this.permissions.dataset(user, datasetId);
    const [row] = await this.database.db
      .select({ id: schema.datasetRecords.id })
      .from(schema.datasetRecords)
      .where(
        sql`${schema.datasetRecords.datasetId} = ${datasetId} and ${schema.datasetRecords.id} = ${recordId} and ${this.permissions.visible(user, schema.datasetRecords.datasetId)}`,
      )
      .limit(1);
    if (!row) notFound();
  }
}
