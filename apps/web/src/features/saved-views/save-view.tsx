'use client';
import { useRef, useState } from 'react';
import type { SearchRequest } from '@datascope/contracts';
import { viewCreateSchema } from '@datascope/contracts';
import { useCreateSavedViewMutation } from '@/store/api/views-api';
import { useAppDispatch } from '@/store/hooks';
import { savedViewsSlice } from '@/store/slices/saved-views-slice';
import { Button } from '@/components/ui/button';
import { controlClass } from '@/features/explorer/condition-editor';
import { queryConfig } from '@/features/explorer/query-validation';
import { ViewDialog } from './view-dialog';
export function SaveView({
  datasetId,
  query,
}: {
  datasetId: string;
  query: SearchRequest;
}) {
  const [notice, setNotice] = useState('');
  return (
    <div className="space-y-2">
      <ViewDialog
        title="Save view"
        description="Save the applied search, sorting, columns and page size. Views reopen at page 1."
        trigger={<Button variant="outline">Save view</Button>}
      >
        {(close) => (
          <SaveForm
            datasetId={datasetId}
            query={query}
            done={() => {
              setNotice('View saved.');
              close();
            }}
          />
        )}
      </ViewDialog>
      {notice && (
        <p role="status" className="text-sm text-primary">
          {notice}{' '}
          <a href="/saved-views" className="underline">
            Manage saved views
          </a>
        </p>
      )}
    </div>
  );
}
function SaveForm({
  datasetId,
  query,
  done,
}: {
  datasetId: string;
  query: SearchRequest;
  done: () => void;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [create, state] = useCreateSavedViewMutation();
  const dispatch = useAppDispatch();
  const lock = useRef(false);
  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (lock.current) return;
        const input = viewCreateSchema.safeParse({
          name,
          datasetId,
          config: queryConfig(query),
        });
        if (!input.success) {
          setError('Enter a name of 1 to 200 characters.');
          return;
        }
        dispatch(
          savedViewsSlice.actions.editorOpened({ viewId: null, ...input.data }),
        );
        lock.current = true;
        setError('');
        void create(input.data)
          .unwrap()
          .then((result) => {
            dispatch(savedViewsSlice.actions.viewSelected(result.data.id));
            dispatch(savedViewsSlice.actions.editorClosed());
            done();
          })
          .catch(() => {
            setError('Unable to save view. Check access and try again.');
          })
          .finally(() => {
            lock.current = false;
          });
      }}
    >
      <label className="block text-sm">
        View name
        <input
          autoFocus
          className={controlClass}
          value={name}
          maxLength={200}
          required
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button disabled={state.isLoading}>Create saved view</Button>
    </form>
  );
}
