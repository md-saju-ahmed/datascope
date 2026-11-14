'use client';
import { useState } from 'react';
import {
  datasetCreateSchema,
  datasetPatchSchema,
  fieldCreateSchema,
  fieldPatchSchema,
  fieldDataTypeSchema,
  fieldOperatorSchema,
  type Dataset,
  type DatasetField,
} from '@datascope/contracts';
import {
  useGetDatasetsQuery,
  useCreateDatasetMutation,
  useUpdateDatasetMutation,
  useArchiveDatasetMutation,
  useGetFieldsQuery,
  useCreateFieldMutation,
  useUpdateFieldMutation,
} from '@/store/api/datasets-api';
import { Button } from '@/components/ui/button';
import { FormDialog } from '@/components/ui/form-dialog';
import { DataFailure, DataLoading } from '@/features/datasets/data-state';
import { ActionForm, control } from '@/features/settings/form-support';
export function DatasetsManager() {
  const [page, setPage] = useState(1),
    [archived, setArchived] = useState(false),
    [message, setMessage] = useState('');
  const result = useGetDatasetsQuery({
    page,
    pageSize: 10,
    includeArchived: archived,
  });
  const saved = (close: () => void, message: string) => {
    setMessage(message);
    close();
  };
  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Dataset management</h1>
        <p className="mt-3 text-muted-foreground">
          Create and maintain dataset metadata. Record import and archival
          restoration are not supported.
        </p>
      </header>
      <div className="flex flex-wrap items-center gap-4">
        <FormDialog
          title="Create dataset"
          description="Create an empty dataset with its name, source and metadata."
          trigger={<Button>Create dataset</Button>}
        >
          {(close) => (
            <DatasetEditor
              complete={() => {
                saved(close, 'Dataset created.');
              }}
            />
          )}
        </FormDialog>
        <Button
          variant="outline"
          disabled={result.isFetching}
          onClick={() => {
            void result.refetch();
          }}
        >
          Refresh datasets
        </Button>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => {
              setArchived(e.target.checked);
              setPage(1);
            }}
          />
          Include archived datasets
        </label>
      </div>
      {message && <p role="status">{message}</p>}
      {result.isError ? (
        <DataFailure
          error={result.error}
          retry={() => {
            void result.refetch();
          }}
        />
      ) : !result.currentData ? (
        <DataLoading />
      ) : (
        <>
          {!result.currentData.data.length && <p>No datasets available.</p>}
          <div className="space-y-4">
            {result.currentData.data.map((dataset) => (
              <article
                key={dataset.id}
                className="min-w-0 space-y-3 rounded-xl border border-border bg-surface p-5"
              >
                <h2 className="break-words text-lg font-semibold">
                  {dataset.name}
                </h2>
                <p className="break-words text-sm text-muted-foreground">
                  {dataset.description || 'No description provided.'}
                </p>
                <p className="break-words text-sm">
                  {dataset.category} · {dataset.source} ·{' '}
                  {BigInt(dataset.recordCount).toLocaleString('en-US')} records
                  · {dataset.isArchived ? 'Archived' : 'Active'}
                </p>
                <p className="break-words text-xs text-muted-foreground">
                  {dataset.slug} · {dataset.id}
                </p>
                {!dataset.isArchived && (
                  <div className="flex flex-wrap gap-3">
                    <FormDialog
                      title="Edit dataset"
                      description={`Update metadata for ${dataset.name}.`}
                      trigger={<Button variant="outline">Edit dataset</Button>}
                    >
                      {(close) => (
                        <DatasetEditor
                          dataset={dataset}
                          complete={() => {
                            saved(close, 'Dataset updated.');
                          }}
                        />
                      )}
                    </FormDialog>
                    <FormDialog
                      title="Manage dataset fields"
                      description="Configure supported fields and query capabilities. Metadata changes can affect existing searches and saved views."
                      trigger={<Button variant="outline">Manage fields</Button>}
                    >
                      {() => <FieldsManager datasetId={dataset.id} />}
                    </FormDialog>
                    <FormDialog
                      title="Archive dataset"
                      description={`Archive ${dataset.name}. Records are retained, but dataset access and saved views become unavailable.`}
                      trigger={
                        <Button variant="outline">Archive dataset</Button>
                      }
                    >
                      {(close) => (
                        <ArchiveDataset
                          dataset={dataset}
                          complete={() => {
                            saved(close, 'Dataset archived.');
                          }}
                        />
                      )}
                    </FormDialog>
                  </div>
                )}
              </article>
            ))}
          </div>
          <nav
            aria-label="Admin dataset pages"
            className="flex flex-wrap items-center gap-3"
          >
            <Button
              variant="outline"
              disabled={page === 1 || result.isFetching}
              onClick={() => {
                setPage(page - 1);
              }}
            >
              Previous datasets
            </Button>
            <span>
              Page {page} of{' '}
              {Math.max(1, result.currentData.pageInfo.totalPages)}
            </span>
            <Button
              variant="outline"
              disabled={
                !result.currentData.pageInfo.hasNextPage || result.isFetching
              }
              onClick={() => {
                setPage(page + 1);
              }}
            >
              Next datasets
            </Button>
          </nav>
        </>
      )}
    </section>
  );
}
function DatasetEditor({
  dataset,
  complete,
}: {
  dataset?: Dataset;
  complete: () => void;
}) {
  const [draft, setDraft] = useState({
    name: dataset?.name ?? '',
    slug: dataset?.slug ?? '',
    description: dataset?.description ?? '',
    category: dataset?.category ?? 'uncategorized',
    source: dataset?.source ?? '',
  });
  const [create] = useCreateDatasetMutation(),
    [update] = useUpdateDatasetMutation();
  return (
    <ActionForm
      submit={dataset ? 'Save dataset' : 'Create empty dataset'}
      complete={complete}
      action={async () => {
        if (dataset)
          await update({
            datasetId: dataset.id,
            changes: datasetPatchSchema.parse(draft),
          }).unwrap();
        else await create(datasetCreateSchema.parse(draft)).unwrap();
      }}
    >
      {(['name', 'slug', 'category', 'source'] as const).map((key) => (
        <label key={key} className="block text-sm capitalize">
          {
            {
              name: 'Name',
              slug: 'Slug',
              category: 'Category',
              source: 'Source',
            }[key]
          }
          <input
            className={control}
            required
            maxLength={key === 'slug' || key === 'category' ? 100 : 200}
            pattern={key === 'slug' ? '[a-z0-9]+(-[a-z0-9]+)*' : undefined}
            title={
              key === 'slug'
                ? 'Lowercase letters, numbers and single hyphens'
                : undefined
            }
            value={draft[key]}
            onChange={(e) => {
              setDraft({ ...draft, [key]: e.target.value });
            }}
          />
        </label>
      ))}
      <label className="block text-sm">
        Description
        <textarea
          className={control}
          maxLength={2000}
          rows={4}
          value={draft.description}
          onChange={(e) => {
            setDraft({ ...draft, description: e.target.value });
          }}
        />
      </label>
    </ActionForm>
  );
}
function ArchiveDataset({
  dataset,
  complete,
}: {
  dataset: Dataset;
  complete: () => void;
}) {
  const [archive] = useArchiveDatasetMutation();
  return (
    <ActionForm
      submit="Confirm archive"
      complete={complete}
      confirmation={`I confirm archival of ${dataset.name}; records will be retained.`}
      action={async () => {
        await archive(dataset.id).unwrap();
      }}
    />
  );
}
function FieldsManager({ datasetId }: { datasetId: string }) {
  const result = useGetFieldsQuery({ datasetId, pageSize: 100 }),
    [editing, setEditing] = useState<DatasetField | null | undefined>(
      undefined,
    ),
    [message, setMessage] = useState('');
  if (editing !== undefined)
    return (
      <div className="space-y-5">
        <Button
          variant="outline"
          onClick={() => {
            setEditing(undefined);
          }}
        >
          Back to fields
        </Button>
        <h3 className="font-semibold">
          {editing ? 'Edit field' : 'Add field'}
        </h3>
        <FieldEditor
          key={editing?.id ?? 'new'}
          datasetId={datasetId}
          field={editing}
          complete={() => {
            setEditing(undefined);
            setMessage('Field metadata saved.');
          }}
        />
      </div>
    );
  return (
    <div className="space-y-5">
      <Button
        onClick={() => {
          setEditing(null);
        }}
      >
        Add field
      </Button>
      {message && <p role="status">{message}</p>}
      {result.isError ? (
        <DataFailure
          error={result.error}
          retry={() => {
            void result.refetch();
          }}
        />
      ) : !result.currentData ? (
        <DataLoading />
      ) : (
        <>
          {!result.currentData.data.length && (
            <p>No field metadata defined yet.</p>
          )}
          {result.currentData.data.map((field) => (
            <article
              key={field.id}
              className="space-y-2 rounded-md border border-border p-3"
            >
              <h3 className="break-words font-medium">{field.label}</h3>
              <p className="break-words text-sm">
                {field.fieldKey} · {field.dataType} ·{' '}
                {field.isVisible ? 'Visible' : 'Hidden'} · Operators:{' '}
                {field.operators.join(', ') || 'none'}
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setEditing(field);
                }}
              >
                Edit field {field.fieldKey}
              </Button>
            </article>
          ))}
        </>
      )}
    </div>
  );
}
function FieldEditor({
  datasetId,
  field,
  complete,
}: {
  datasetId: string;
  field: DatasetField | null;
  complete: () => void;
}) {
  const [draft, setDraft] = useState({
    fieldKey: field?.fieldKey ?? '',
    label: field?.label ?? '',
    dataType: field?.dataType ?? 'string',
    operators: field?.operators.join(', ') ?? '',
    isSearchable: field?.isSearchable ?? false,
    isSortable: field?.isSortable ?? false,
    isVisible: field?.isVisible ?? true,
    sortOrder: field?.sortOrder ?? 0,
  });
  const [create] = useCreateFieldMutation(),
    [update] = useUpdateFieldMutation();
  return (
    <ActionForm
      submit="Save field metadata"
      complete={complete}
      confirmation="I confirm these field capabilities. Existing searches may need updating."
      action={async () => {
        const operators = draft.operators
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        const parsed = fieldCreateSchema.parse({
          ...draft,
          operators,
          isFilterable: operators.length > 0,
        });
        if (field)
          await update({
            datasetId,
            fieldId: field.id,
            changes: fieldPatchSchema.parse(parsed),
          }).unwrap();
        else await create({ datasetId, field: parsed }).unwrap();
      }}
    >
      <p className="text-sm text-muted-foreground">
        Supported operators: {fieldOperatorSchema.options.join(', ')}. Enter a
        comma-separated list compatible with the field type, or leave blank to
        disable filtering. Common fields require their original type; reserved
        keys are rejected.
      </p>
      <label className="block text-sm">
        Field key
        <input
          className={control}
          required
          maxLength={64}
          pattern="[A-Za-z][A-Za-z0-9_]*"
          value={draft.fieldKey}
          onChange={(e) => {
            setDraft({ ...draft, fieldKey: e.target.value });
          }}
        />
      </label>
      <label className="block text-sm">
        Field label
        <input
          className={control}
          required
          maxLength={100}
          value={draft.label}
          onChange={(e) => {
            setDraft({ ...draft, label: e.target.value });
          }}
        />
      </label>
      <label className="block text-sm">
        Data type
        <select
          aria-label="Data type"
          className={control}
          value={draft.dataType}
          onChange={(e) => {
            setDraft({
              ...draft,
              dataType: fieldDataTypeSchema.parse(e.target.value),
            });
          }}
        >
          {fieldDataTypeSchema.options.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Operators
        <input
          className={control}
          value={draft.operators}
          onChange={(e) => {
            setDraft({ ...draft, operators: e.target.value });
          }}
        />
      </label>
      <label className="block text-sm">
        Sort order
        <input
          className={control}
          type="number"
          min={0}
          max={10000}
          required
          value={draft.sortOrder}
          onChange={(e) => {
            setDraft({ ...draft, sortOrder: Number(e.target.value) });
          }}
        />
      </label>
      {(['isSearchable', 'isSortable', 'isVisible'] as const).map(
        (key, index) => (
          <label key={key} className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={draft[key]}
              onChange={(e) => {
                setDraft({ ...draft, [key]: e.target.checked });
              }}
              className="size-5"
            />
            {['Searchable text', 'Sortable', 'Visible'][index]}
          </label>
        ),
      )}
    </ActionForm>
  );
}
