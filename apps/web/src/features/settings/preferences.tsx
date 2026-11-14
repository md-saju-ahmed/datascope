'use client';
import { useEffect, useState } from 'react';
import {
  preferencesSchema,
  preferencePatchSchema,
  type Preferences,
} from '@datascope/contracts';
import {
  useGetPreferencesQuery,
  useUpdatePreferencesMutation,
} from '@/store/api/management-api';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { uiPreferencesSlice } from '@/store/slices/ui-preferences-slice';
import { DataFailure, DataLoading } from '@/features/datasets/data-state';
import { DatasetPicker } from '@/features/datasets/dataset-picker';
import { Button } from '@/components/ui/button';
import { FormDialog } from '@/components/ui/form-dialog';
import { ActionForm, control } from './form-support';

export function PreferencesBridge() {
  const dispatch = useAppDispatch();
  const result = useGetPreferencesQuery(undefined, {
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });
  useEffect(() => {
    if (result.currentData && !result.isError)
      dispatch(
        uiPreferencesSlice.actions.preferencesChanged(result.currentData.data),
      );
  }, [result.currentData, result.isError, dispatch]);
  return null;
}
export function Settings() {
  const result = useGetPreferencesQuery(undefined);
  const user = useAppSelector((s) => s.auth.user);
  const [message, setMessage] = useState('');
  return (
    <section className="max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-3 text-muted-foreground">
          Preferences are saved to your account. Explicit Explorer URLs and
          saved views keep their own configuration.
        </p>
      </header>
      <dl className="space-y-2 rounded-xl border border-border bg-surface p-5 text-sm">
        <div>
          <dt>Email</dt>
          <dd className="break-words">{user?.email}</dd>
        </div>
        <div>
          <dt>Role</dt>
          <dd>{user?.role}</dd>
        </div>
      </dl>
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
        <PreferenceForm
          key={JSON.stringify(result.currentData.data)}
          initial={result.currentData.data}
          saved={() => {
            setMessage('Preferences saved.');
          }}
        />
      )}
      <FormDialog
        title="Reset preferences"
        description="Restore comfortable density, 25 rows and no default dataset for your account."
        trigger={<Button variant="outline">Reset preferences</Button>}
      >
        {(close) => (
          <ResetPreferences
            complete={() => {
              setMessage('Preferences reset.');
              close();
            }}
          />
        )}
      </FormDialog>
    </section>
  );
}
function PreferenceForm({
  initial,
  saved,
}: {
  initial: Preferences;
  saved: () => void;
}) {
  const [draft, setDraft] = useState(initial),
    [update] = useUpdatePreferencesMutation();
  const dispatch = useAppDispatch();
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <ActionForm
        submit="Save preferences"
        complete={saved}
        action={async () => {
          const response = await update(
            preferencePatchSchema.parse(draft),
          ).unwrap();
          dispatch(
            uiPreferencesSlice.actions.preferencesChanged(response.data),
          );
        }}
      >
        <label className="block text-sm">
          Table density
          <select
            aria-label="Table density"
            className={control}
            value={draft.density}
            onChange={(e) => {
              setDraft({
                ...draft,
                density: preferencesSchema.shape.density.parse(e.target.value),
              });
            }}
          >
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
        </label>
        <label className="block text-sm">
          Default rows per page
          <select
            aria-label="Default rows per page"
            className={control}
            value={draft.defaultPageSize}
            onChange={(e) => {
              setDraft({
                ...draft,
                defaultPageSize: preferencesSchema.shape.defaultPageSize.parse(
                  Number(e.target.value),
                ),
              });
            }}
          >
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <DatasetPicker
          label="Default dataset"
          none="No default dataset"
          value={draft.defaultDatasetId}
          change={(value) => {
            setDraft({ ...draft, defaultDatasetId: value });
          }}
        />
      </ActionForm>
    </div>
  );
}
function ResetPreferences({ complete }: { complete: () => void }) {
  const [update] = useUpdatePreferencesMutation();
  return (
    <ActionForm
      submit="Confirm reset"
      complete={complete}
      action={async () => {
        await update(preferencesSchema.parse({})).unwrap();
      }}
    />
  );
}
