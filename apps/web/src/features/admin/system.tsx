'use client';
import { useState } from 'react';
import {
  settingsPatchSchema,
  type settingsResponseSchema,
} from '@datascope/contracts';
import {
  useGetSettingsQuery,
  useUpdateSettingsMutation,
} from '@/store/api/management-api';
import { DataFailure, DataLoading } from '@/features/datasets/data-state';
import { Button } from '@/components/ui/button';
import { ActionForm, control } from '@/features/settings/form-support';
type Settings = ReturnType<typeof settingsResponseSchema.parse>['data'];
export function SystemSettings() {
  const result = useGetSettingsQuery(undefined),
    [message, setMessage] = useState('');
  return (
    <section className="max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">System settings</h1>
        <p className="mt-3 text-muted-foreground">
          These settings affect registration and selected-record exports across
          the platform.
        </p>
      </header>
      <Button
        variant="outline"
        disabled={result.isFetching}
        onClick={() => {
          void result.refetch();
        }}
      >
        Refresh system settings
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
        <SettingsForm
          key={JSON.stringify(result.currentData.data)}
          initial={result.currentData.data}
          saved={() => {
            setMessage('System settings saved.');
          }}
        />
      )}
    </section>
  );
}
function SettingsForm({
  initial,
  saved,
}: {
  initial: Settings;
  saved: () => void;
}) {
  const [registration, setRegistration] = useState(
      initial['registration.enabled'],
    ),
    [limit, setLimit] = useState(String(initial['exports.max_selected_rows'])),
    [update] = useUpdateSettingsMutation();
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <ActionForm
        submit="Save system settings"
        complete={saved}
        confirmation="I confirm these platform-wide registration and export settings."
        action={async () => {
          await update(
            settingsPatchSchema.parse({
              'registration.enabled': registration,
              'exports.max_selected_rows': Number(limit),
            }),
          ).unwrap();
        }}
      >
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="size-5"
            checked={registration}
            onChange={(e) => {
              setRegistration(e.target.checked);
            }}
          />
          Allow public Viewer registration
        </label>
        <p className="text-sm text-muted-foreground">
          Turning registration off prevents new public accounts. Existing
          accounts are retained.
        </p>
        <label className="block text-sm">
          Maximum selected records per export
          <input
            className={control}
            type="number"
            required
            min={1}
            max={1000}
            step={1}
            value={limit}
            onChange={(e) => {
              setLimit(e.target.value);
            }}
          />
        </label>
      </ActionForm>
    </div>
  );
}
