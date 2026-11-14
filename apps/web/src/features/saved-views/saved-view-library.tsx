'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  savedQuery,
  searchRequestSchema,
  shareRequestSchema,
  viewPatchSchema,
} from '@datascope/contracts';
import type { DatasetField, SavedConfig } from '@datascope/contracts';
import {
  useGetSavedViewsQuery,
  useGetSavedViewQuery,
  useUpdateSavedViewMutation,
  useDeleteSavedViewMutation,
  useShareSavedViewMutation,
  useRevokeSavedViewShareMutation,
} from '@/store/api/views-api';
import {
  useGetDatasetQuery,
  useGetFieldsQuery,
} from '@/store/api/datasets-api';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { savedViewsSlice } from '@/store/slices/saved-views-slice';
import { DataFailure, DataLoading } from '@/features/datasets/data-state';
import { Button } from '@/components/ui/button';
import {
  ConditionEditor,
  controlClass,
} from '@/features/explorer/condition-editor';
import {
  advancedQuery,
  canAuthorAdvanced,
  conditionError,
} from '@/features/explorer/query-validation';
import {
  readExplorerQuery,
  writeExplorerQuery,
} from '@/features/explorer/url-state';
import { DetailPages } from '@/features/explorer/record-detail';
import { ViewDialog } from './view-dialog';

export function SavedViewLibrary() {
  const [page, setPage] = useState(1);
  const result = useGetSavedViewsQuery({ page, pageSize: 10 });
  const user = useAppSelector((s) => s.auth.user);
  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Saved Views</h1>
          <p className="mt-3 text-muted-foreground">
            Open saved searches or manage views you own. Dataset access is
            always checked separately.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={result.isFetching}
          onClick={() => {
            void result.refetch();
          }}
        >
          Refresh views
        </Button>
      </header>
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
            <div className="space-y-3 rounded-xl border border-dashed border-border p-6">
              <h2 className="font-semibold">No saved views available</h2>
              <p className="text-sm text-muted-foreground">
                {user?.role === 'viewer'
                  ? 'An owner can share a view after you have dataset access.'
                  : 'Save an applied search from the Data Explorer.'}
              </p>
              <Link
                className="inline-flex min-h-11 items-center text-primary underline"
                href="/search"
              >
                Search datasets
              </Link>
            </div>
          )}
          <div className="grid gap-4 xl:grid-cols-2">
            {result.currentData.data.map((view) => (
              <article
                key={view.id}
                className="min-w-0 space-y-4 rounded-xl border border-border bg-surface p-5"
              >
                <h2 className="break-words text-lg font-semibold">
                  {view.name}
                </h2>
                <p className="break-words text-xs text-muted-foreground">
                  Dataset {view.datasetId}
                  <br />
                  Created {view.createdAt} (UTC)
                  <br />
                  {view.ownerId === user?.id
                    ? 'Owned by you'
                    : 'Available to your account'}
                </p>
                <p className="break-words text-sm">
                  {view.config.q || 'All indexed text'} ·{' '}
                  {view.config.conditions.length} filters ·{' '}
                  {view.config.sort
                    .map((s) => `${s.field} ${s.direction}`)
                    .join(', ') || 'Default sort'}{' '}
                  · {view.config.columns?.join(', ') || 'Default columns'}
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button asChild>
                    <Link
                      prefetch={false}
                      href={`/datasets/${view.datasetId}/explore?${writeExplorerQuery(searchRequestSchema.parse(savedQuery(view.config)))}&view=${view.id}`}
                    >
                      Open view
                    </Link>
                  </Button>
                  {user?.role !== 'viewer' &&
                    (user?.role === 'admin' || view.ownerId === user?.id) && (
                      <>
                        <ViewDialog
                          title="Edit saved view"
                          description="Update the name or validated search configuration. Changes persist after the server confirms them."
                          trigger={<Button variant="outline">Edit view</Button>}
                        >
                          {(close) => (
                            <EditView viewId={view.id} close={close} />
                          )}
                        </ViewDialog>
                        <ViewDialog
                          title="Share saved view"
                          description="Enter the known user ID of a team member with dataset access. Sharing never grants dataset access."
                          trigger={
                            <Button variant="outline">Share view</Button>
                          }
                        >
                          {() => <ShareView viewId={view.id} />}
                        </ViewDialog>
                        <ViewDialog
                          title="Delete saved view"
                          description="Delete this saved configuration and revoke all its shares? Records and datasets are preserved."
                          trigger={
                            <Button variant="outline">Delete view</Button>
                          }
                        >
                          {(close) => (
                            <DeleteView viewId={view.id} close={close} />
                          )}
                        </ViewDialog>
                      </>
                    )}
                </div>
              </article>
            ))}
          </div>
          <DetailPages
            info={result.currentData.pageInfo}
            pending={result.isFetching}
            change={setPage}
            label="views"
          />
        </>
      )}
    </section>
  );
}
function DeleteView({ viewId, close }: { viewId: string; close: () => void }) {
  const [remove, result] = useDeleteSavedViewMutation();
  return (
    <div className="space-y-4">
      <Button
        disabled={result.isLoading}
        onClick={() => {
          void remove(viewId)
            .unwrap()
            .then(close)
            .catch(() => undefined);
        }}
      >
        Confirm delete
      </Button>
      {result.isError && (
        <p role="alert" className="text-sm text-destructive">
          Unable to delete this view. Check your access and try again.
        </p>
      )}
    </div>
  );
}
function ShareView({ viewId }: { viewId: string }) {
  const [recipient, setRecipient] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [share, sharing] = useShareSavedViewMutation();
  const [revoke, revoking] = useRevokeSavedViewShareMutation();
  const lock = useRef(false);
  const send = async (remove: boolean) => {
    if (lock.current) return;
    const parsed = shareRequestSchema.safeParse({ userId: recipient.trim() });
    setNotice('');
    setError('');
    if (!parsed.success) {
      setError('Enter a valid recipient user ID (UUID).');
      return;
    }
    lock.current = true;
    try {
      const args = { viewId, userId: parsed.data.userId };
      if (remove) await revoke(args).unwrap();
      else await share(args).unwrap();
      setNotice(
        remove
          ? 'Revocation confirmed. This user has no share through this view.'
          : 'View shared. The recipient must retain dataset access.',
      );
    } catch {
      setError(
        'Unable to change sharing. Check the user ID, dataset access and ownership, then try again.',
      );
    } finally {
      lock.current = false;
    }
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        User discovery and an existing-share list are unavailable. Obtain the
        recipient’s UUID from your administrator. You can revoke a known
        recipient below.
      </p>
      <label className="block text-sm">
        Recipient user ID
        <input
          className={controlClass}
          value={recipient}
          onChange={(event) => {
            setRecipient(event.target.value);
          }}
          aria-describedby="recipient-error"
          aria-invalid={!!error}
        />
      </label>
      <div className="flex flex-wrap gap-3">
        <Button
          disabled={sharing.isLoading || revoking.isLoading}
          onClick={() => {
            void send(false);
          }}
        >
          Confirm share
        </Button>
        <Button
          variant="outline"
          disabled={sharing.isLoading || revoking.isLoading}
          onClick={() => {
            void send(true);
          }}
        >
          Confirm revoke
        </Button>
      </div>
      {error && (
        <p
          id="recipient-error"
          role="alert"
          className="text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-primary">
          {notice}
        </p>
      )}
    </div>
  );
}
function EditView({ viewId, close }: { viewId: string; close: () => void }) {
  const view = useGetSavedViewQuery(viewId, {
    refetchOnMountOrArgChange: true,
  });
  const datasetId = view.currentData?.data.datasetId ?? '';
  const dataset = useGetDatasetQuery(datasetId, {
    skip: !datasetId || view.isError || view.isFetching,
  });
  const fields = useGetFieldsQuery(
    { datasetId },
    {
      skip:
        !dataset.currentData ||
        dataset.isError ||
        view.isError ||
        view.isFetching,
    },
  );
  const user = useAppSelector((s) => s.auth.user);
  if (view.isError || dataset.isError || fields.isError)
    return (
      <DataFailure
        error={view.error ?? dataset.error ?? fields.error}
        retry={() => {
          void view.refetch();
          if (!dataset.isUninitialized) void dataset.refetch();
          if (!fields.isUninitialized) void fields.refetch();
        }}
      />
    );
  if (
    !view.currentData ||
    view.isFetching ||
    !dataset.currentData ||
    !fields.currentData
  )
    return <DataLoading />;
  return (
    <EditForm
      key={view.currentData.data.updatedAt}
      viewId={viewId}
      datasetId={datasetId}
      initialName={view.currentData.data.name}
      initialConfig={view.currentData.data.config}
      advanced={canAuthorAdvanced(user, dataset.currentData.data)}
      fields={fields.currentData.data}
      close={close}
    />
  );
}
function EditForm({
  viewId,
  datasetId,
  initialName,
  initialConfig,
  advanced,
  fields,
  close,
}: {
  viewId: string;
  datasetId: string;
  initialName: string;
  initialConfig: SavedConfig;
  advanced: boolean;
  fields: DatasetField[];
  close: () => void;
}) {
  const dispatch = useAppDispatch();
  const editor = useAppSelector((s) => s.savedViews.editor);
  const [update, result] = useUpdateSavedViewMutation();
  const [error, setError] = useState('');
  const lock = useRef(false);
  useEffect(() => {
    dispatch(
      savedViewsSlice.actions.editorOpened({
        viewId,
        datasetId,
        name: initialName,
        config: initialConfig,
      }),
    );
    return () => {
      dispatch(savedViewsSlice.actions.editorClosed());
    };
  }, [dispatch, viewId, datasetId, initialName, initialConfig]);
  if (editor?.viewId !== viewId) return <DataLoading />;
  const invalid =
    editor.config.conditions.some((c) => conditionError(c, fields)) ||
    (!advanced && advancedQuery(editor.config));
  const change = (config: SavedConfig) =>
    dispatch(savedViewsSlice.actions.editorOpened({ ...editor, config }));
  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (lock.current || invalid) return;
        const parsed = viewPatchSchema.safeParse({
          name: editor.name,
          config: editor.config,
        });
        try {
          readExplorerQuery(
            writeExplorerQuery(
              searchRequestSchema.parse(savedQuery(editor.config)),
            ),
            fields,
          );
        } catch {
          setError('The configuration has invalid fields, sort or columns.');
          return;
        }
        if (!parsed.success) {
          setError('Check the name and configuration.');
          return;
        }
        lock.current = true;
        setError('');
        void update({ viewId, changes: parsed.data })
          .unwrap()
          .then(close)
          .catch(() => {
            setError(
              'Unable to update view. Check access and values, then try again.',
            );
          })
          .finally(() => {
            lock.current = false;
          });
      }}
    >
      <label className="block text-sm">
        View name
        <input
          className={controlClass}
          value={editor.name}
          maxLength={200}
          required
          onChange={(event) =>
            dispatch(
              savedViewsSlice.actions.editorOpened({
                ...editor,
                name: event.target.value,
              }),
            )
          }
        />
      </label>
      <label className="block text-sm">
        Search indexed text
        <input
          className={controlClass}
          value={editor.config.q}
          maxLength={200}
          onChange={(event) =>
            change({ ...editor.config, q: event.target.value })
          }
        />
      </label>
      <ConditionEditor
        fields={fields}
        conditions={editor.config.conditions}
        basic={!advanced}
        change={(conditions) => change({ ...editor.config, conditions })}
      />
      <fieldset className="space-y-3 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-semibold">Sort priority</legend>
        {editor.config.sort.map((sort, index) => (
          <div
            key={sort.field}
            className="flex flex-wrap items-center gap-2 text-sm"
          >
            <span>
              {index + 1}. {sort.field}
            </span>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                change({
                  ...editor.config,
                  sort: editor.config.sort.map((s, i) =>
                    i === index
                      ? {
                          ...s,
                          direction: s.direction === 'asc' ? 'desc' : 'asc',
                        }
                      : s,
                  ),
                })
              }
            >
              {sort.direction}
            </Button>
            <Button
              type="button"
              variant="ghost"
              aria-label={`Remove saved sort ${sort.field}`}
              onClick={() =>
                change({
                  ...editor.config,
                  sort: editor.config.sort.filter((_, i) => i !== index),
                })
              }
            >
              Remove
            </Button>
          </div>
        ))}
        <label className="block text-sm">
          Add saved sort
          <select
            aria-label="Add saved sort"
            className={controlClass}
            value=""
            disabled={editor.config.sort.length === 3}
            onChange={(event) => {
              if (event.target.value)
                change({
                  ...editor.config,
                  sort: [
                    ...editor.config.sort,
                    { field: event.target.value, direction: 'asc' },
                  ],
                });
            }}
          >
            <option value="">Choose field</option>
            {[
              { fieldKey: 'id', label: 'Record ID', isSortable: true },
              ...fields.filter((f) => f.isVisible),
            ]
              .filter(
                (f) =>
                  f.isSortable &&
                  !editor.config.sort.some((s) => s.field === f.fieldKey),
              )
              .map((f) => (
                <option key={f.fieldKey} value={f.fieldKey}>
                  {f.label}
                </option>
              ))}
          </select>
        </label>
      </fieldset>
      <fieldset className="space-y-2 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-semibold">Visible columns</legend>
        {[
          { fieldKey: 'id', label: 'Record ID' },
          ...fields.filter((f) => f.isVisible),
        ].map((field) => {
          const visible = editor.config.columns ?? [
            'id',
            ...fields.filter((f) => f.isVisible).map((f) => f.fieldKey),
          ];
          return (
            <label
              key={field.fieldKey}
              className="flex min-h-11 items-center gap-3 text-sm"
            >
              <input
                type="checkbox"
                checked={visible.includes(field.fieldKey)}
                disabled={
                  visible.length === 1 && visible.includes(field.fieldKey)
                }
                onChange={() =>
                  change({
                    ...editor.config,
                    columns: visible.includes(field.fieldKey)
                      ? visible.filter((k) => k !== field.fieldKey)
                      : [...visible, field.fieldKey],
                  })
                }
              />
              {field.label}
            </label>
          );
        })}
      </fieldset>
      <label className="block text-sm">
        Saved page size
        <select
          aria-label="Saved page size"
          className={controlClass}
          value={editor.config.pageSize}
          onChange={(event) => {
            const pageSize = Number(event.target.value);
            if (
              pageSize === 10 ||
              pageSize === 25 ||
              pageSize === 50 ||
              pageSize === 100
            )
              change({ ...editor.config, pageSize });
          }}
        >
          {[10, 25, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      {invalid && (
        <p role="alert" className="text-sm text-destructive">
          Correct the values or obtain advanced authoring access before saving.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button disabled={invalid || result.isLoading}>Save changes</Button>
    </form>
  );
}
