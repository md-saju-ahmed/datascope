'use client';
import { useMemo, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
  type RowSelectionState,
} from '@tanstack/react-table';
import type {
  DatasetField,
  SearchResponse,
  SearchRequest,
} from '@datascope/contracts';
import { displayValue } from '@/features/datasets/data-state';
import { Button } from '@/components/ui/button';
import { useAppSelector } from '@/store/hooks';
import { ExportSelection } from '@/features/explorer/export-selection';

type Row = SearchResponse['data'][number];
function Highlight({ value, term }: { value: unknown; term: string }) {
  const text = displayValue(value);
  const index = term ? text.toLowerCase().indexOf(term.toLowerCase()) : -1;
  return index < 0 ? (
    text
  ) : (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + term.length)}</mark>
      {text.slice(index + term.length)}
    </>
  );
}
export function RecordTable({
  data,
  fields,
  query,
  change,
  openRecord,
  readOnly = false,
  datasetId,
  exportAllowed,
}: {
  data: Row[];
  fields: DatasetField[];
  query: SearchRequest;
  change: (query: SearchRequest) => void;
  openRecord: (id: string) => void;
  readOnly?: boolean;
  datasetId: string;
  exportAllowed: boolean;
}) {
  const density = useAppSelector((s) => s.uiPreferences.density);
  const [selection, setSelection] = useState<RowSelectionState>({});
  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        id: 'select',
        size: 52,
        enableResizing: false,
        header: ({ table }) => (
          <input
            type="checkbox"
            aria-label="Select current page"
            checked={table.getIsAllRowsSelected()}
            ref={(node) => {
              if (node) node.indeterminate = table.getIsSomeRowsSelected();
            }}
            onChange={table.getToggleAllRowsSelectedHandler()}
            className="size-5"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            aria-label={`Select record ${row.id}`}
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
            className="size-5"
          />
        ),
      },
      ...[
        { fieldKey: 'id', label: 'Record ID', isSortable: true },
        ...fields.filter((field) => field.isVisible),
      ]
        .filter(
          (field) => !query.columns || query.columns.includes(field.fieldKey),
        )
        .map((field) => ({
          id: field.fieldKey,
          accessorFn: (row: Row) => row[field.fieldKey],
          size: field.fieldKey === 'name' ? 260 : 180,
          header: () => {
            const index = query.sort.findIndex(
              (sort) => sort.field === field.fieldKey,
            );
            const sort = query.sort[index];
            return (
              <Button
                variant="ghost"
                className="justify-start px-1 text-xs"
                disabled={readOnly || !field.isSortable}
                onClick={() => {
                  const next = sort
                    ? query.sort.map((item) =>
                        item.field === field.fieldKey
                          ? {
                              ...item,
                              direction:
                                item.direction === 'asc'
                                  ? ('desc' as const)
                                  : ('asc' as const),
                            }
                          : item,
                      )
                    : [{ field: field.fieldKey, direction: 'asc' as const }];
                  change({ ...query, page: 1, sort: next });
                }}
              >
                {field.label}
                {sort
                  ? ` ${String(index + 1)} ${sort.direction === 'asc' ? '↑' : '↓'}`
                  : ''}
              </Button>
            );
          },
          cell: ({ getValue }: { getValue: () => unknown }) => (
            <span className="block break-words">
              <Highlight value={getValue()} term={query.q} />
            </span>
          ),
        })),
      {
        id: 'open',
        size: 100,
        enableResizing: false,
        header: 'Details',
        cell: ({ row }) => (
          <Button
            variant="ghost"
            onClick={() => {
              openRecord(row.id);
            }}
            aria-label={`Open record ${row.id}`}
          >
            Open
          </Button>
        ),
      },
    ],
    [fields, query, change, openRecord, readOnly],
  );
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    getRowId: (row) => row.id,
    state: { rowSelection: selection },
    onRowSelectionChange: setSelection,
    columnResizeMode: 'onEnd',
    defaultColumn: { minSize: 100, maxSize: 600 },
    enableRowSelection: true,
  });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-3 text-sm">
        <span role="status">
          {Object.keys(selection).filter((id) => selection[id]).length} selected
          on this page
        </span>
        <Button
          variant="ghost"
          onClick={() => {
            setSelection({});
          }}
          disabled={!Object.keys(selection).length}
        >
          Clear selection
        </Button>
        {exportAllowed && (
          <ExportSelection
            datasetId={datasetId}
            recordIds={data
              .filter((row) => selection[row.id])
              .map((row) => row.id)}
            columns={
              query.columns ?? [
                'id',
                ...fields
                  .filter((field) => field.isVisible)
                  .map((field) => field.fieldKey),
              ]
            }
          />
        )}
      </div>
      <div
        role="region"
        aria-label="Dataset records"
        tabIndex={0}
        className="max-w-full overflow-x-auto rounded-lg border border-border bg-surface"
      >
        <table
          className="table-fixed border-collapse text-left text-sm"
          style={{ width: table.getTotalSize() }}
        >
          <caption className="sr-only">
            Current page of dataset records. Sorting and pagination run on the
            server.
          </caption>
          <thead className="bg-muted/70">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
                  <th
                    key={header.id}
                    scope="col"
                    style={{ width: header.getSize() }}
                    className="relative border-b border-border p-3 font-medium"
                    aria-sort={
                      query.sort[0]?.field === header.column.id
                        ? query.sort[0].direction === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : undefined
                    }
                  >
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )}
                    {header.column.getCanResize() && (
                      <div
                        role="separator"
                        aria-label={`Resize ${header.column.id}`}
                        aria-orientation="vertical"
                        aria-valuenow={header.getSize()}
                        aria-valuemin={100}
                        aria-valuemax={600}
                        tabIndex={0}
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        onKeyDown={(event) => {
                          if (
                            ['ArrowLeft', 'ArrowRight', 'Home'].includes(
                              event.key,
                            )
                          ) {
                            event.preventDefault();
                            table.setColumnSizing((old) => ({
                              ...old,
                              [header.column.id]:
                                event.key === 'Home'
                                  ? 180
                                  : Math.min(
                                      600,
                                      Math.max(
                                        100,
                                        header.getSize() +
                                          (event.key === 'ArrowRight'
                                            ? 20
                                            : -20),
                                      ),
                                    ),
                            }));
                          }
                        }}
                        className="absolute inset-y-0 right-0 w-2 cursor-col-resize touch-none border-r border-border hover:bg-primary/20"
                      />
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-border last:border-0 hover:bg-muted/40"
                data-selected={row.getIsSelected()}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    data-density={density}
                    className={
                      density === 'compact'
                        ? 'px-4 py-2 align-top'
                        : 'px-4 py-3 align-top'
                    }
                    style={{ width: cell.column.getSize() }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
