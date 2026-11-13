import {
  viewCreateSchema,
  viewPatchSchema,
  viewApplySchema,
  selectedExportSchema,
  userPatchSchema,
  preferencePatchSchema,
  settingsPatchSchema,
  analyticsQuerySchema,
} from '@datascope/contracts';
import { csvCell } from '../src/modules/exports/exports.service.js';
describe('BE-14–18 safe workflow contracts', () => {
  it('keeps patch fields optional and versions saved configurations', () => {
    expect(viewPatchSchema.parse({ name: 'Renamed' })).toEqual({
      name: 'Renamed',
    });
    expect(
      viewCreateSchema.safeParse({
        name: 'View',
        datasetId: 'dada0004-0000-4000-8000-000000000101',
        config: { version: 2 },
      }).success,
    ).toBe(false);
    expect(viewApplySchema.safeParse({ conditions: [] }).success).toBe(false);
    expect(preferencePatchSchema.parse({ density: 'compact' })).toEqual({
      density: 'compact',
    });
    expect(
      settingsPatchSchema.parse({ 'registration.enabled': false }),
    ).toEqual({ 'registration.enabled': false });
  });
  it.each([
    { recordIds: [], columns: ['name'] },
    { recordIds: ['1', '1'], columns: ['name'] },
    { recordIds: ['9007199254740993'], columns: ['name', 'name'] },
    { recordIds: ['1'], columns: ['attributes'] },
    { recordIds: [1], columns: ['name'] },
    { recordIds: ['9223372036854775808'], columns: ['name'] },
    {
      recordIds: Array.from({ length: 1001 }, (_, i) => (i + 1).toString()),
      columns: ['name'],
    },
  ])('rejects invalid/unbounded export selection %#', (body) => {
    expect(selectedExportSchema.safeParse(body).success).toBe(false);
  });
  it.each([
    [userPatchSchema, { email: 'forged@example.test' }],
    [userPatchSchema, { passwordHash: 'bad' }],
    [userPatchSchema, {}],
    [preferencePatchSchema, { userId: 'forged' }],
    [preferencePatchSchema, { defaultPageSize: 1000 }],
    [settingsPatchSchema, { 'seed.marker': 'secret' }],
    [settingsPatchSchema, { 'exports.max_selected_rows': 1001 }],
    [settingsPatchSchema, { 'registration.enabled': 'false' }],
    [analyticsQuerySchema, { days: 367 }],
  ])('rejects protected keys and invalid values %#', (schema, body) => {
    expect(schema.safeParse(body).success).toBe(false);
  });
  it.each([
    '=SUM(1,2)',
    '+1',
    '-1',
    '@cmd',
    '  =formula',
    '\t=cmd',
    '\rtext',
    '\ntext',
  ])('neutralizes spreadsheet prefix %j', (value) => {
    expect(csvCell(value)).toBe(`"'${value}"`);
  });
  it('quotes CSV delimiters/quotes/newlines and preserves scalar data', () => {
    expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
    expect(csvCell(null)).toBe('""');
    expect(csvCell(true)).toBe('"true"');
    expect(csvCell('9007199254740993')).toBe('"9007199254740993"');
  });
});
