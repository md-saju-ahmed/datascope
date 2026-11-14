'use client';
import { useId, useState } from 'react';
import { permissionSchema, uuidParamSchema } from '@datascope/contracts';
import { useGetUsersQuery } from '@/store/api/management-api';
import {
  useGetPermissionsQuery,
  useSetPermissionMutation,
  useRevokePermissionMutation,
} from '@/store/api/datasets-api';
import { DatasetPicker } from '@/features/datasets/dataset-picker';
import { DataFailure, DataLoading } from '@/features/datasets/data-state';
import { Button } from '@/components/ui/button';
import { FormDialog } from '@/components/ui/form-dialog';
import { ActionForm, control } from '@/features/settings/form-support';
export function PermissionsManager() {
  const [datasetId, setDatasetId] = useState<string | null>(null);
  return (
    <section className="max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Dataset permissions</h1>
        <p className="mt-3 text-muted-foreground">
          Read grants browsing; analyze adds advanced search, analytics and
          export for Analysts. Manage includes lower grants. Role limits still
          apply; Admins have platform access.
        </p>
      </header>
      <DatasetPicker value={datasetId} change={setDatasetId} />
      {datasetId && <GrantList key={datasetId} datasetId={datasetId} />}
    </section>
  );
}
function GrantList({ datasetId }: { datasetId: string }) {
  const [page, setPage] = useState(1),
    [message, setMessage] = useState('');
  const result = useGetPermissionsQuery({ datasetId, page, pageSize: 10 });
  return (
    <div className="space-y-5">
      <FormDialog
        title="Grant dataset access"
        description="Choose an enabled user and permission. A dataset grant does not change their role."
        trigger={<Button>Grant or update access</Button>}
      >
        {(close) => (
          <GrantEditor
            datasetId={datasetId}
            complete={() => {
              setMessage('Dataset access updated.');
              close();
            }}
          />
        )}
      </FormDialog>
      <Button
        className="ml-3"
        variant="outline"
        disabled={result.isFetching}
        onClick={() => {
          void result.refetch();
        }}
      >
        Refresh permissions
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
            <p>No explicit grants for this dataset.</p>
          )}
          <ul className="space-y-3">
            {result.currentData.data.map((grant) => (
              <li
                key={grant.userId}
                className="min-w-0 space-y-3 rounded-xl border border-border bg-surface p-5"
              >
                <p className="break-words text-sm">User {grant.userId}</p>
                <p className="text-sm">
                  Permission: <strong>{grant.permission}</strong>
                </p>
                <p className="text-xs text-muted-foreground">
                  Updated {grant.updatedAt} (UTC)
                </p>
                <FormDialog
                  title="Revoke dataset access"
                  description={`Remove the explicit grant for user ${grant.userId}. Access through this grant and shared views will stop; Admin platform access remains.`}
                  trigger={<Button variant="outline">Revoke access</Button>}
                >
                  {(close) => (
                    <RevokeGrant
                      datasetId={datasetId}
                      userId={grant.userId}
                      complete={() => {
                        setMessage('Dataset access revoked.');
                        close();
                      }}
                    />
                  )}
                </FormDialog>
              </li>
            ))}
          </ul>
          <nav
            aria-label="Permission pages"
            className="flex flex-wrap items-center gap-3"
          >
            <Button
              variant="outline"
              disabled={page === 1 || result.isFetching}
              onClick={() => {
                setPage(page - 1);
              }}
            >
              Previous grants
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
              Next grants
            </Button>
          </nav>
        </>
      )}
    </div>
  );
}
function GrantEditor({
  datasetId,
  complete,
}: {
  datasetId: string;
  complete: () => void;
}) {
  const recipientId = useId(),
    permissionId = useId();
  const [userId, setUserId] = useState(''),
    [permission, setPermission] = useState('read');
  const [q, setQ] = useState(''),
    [draft, setDraft] = useState(''),
    [page, setPage] = useState(1);
  const users = useGetUsersQuery({ page, pageSize: 10, q }),
    [grant] = useSetPermissionMutation();
  return (
    <div className="space-y-5">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(draft.trim());
          setPage(1);
        }}
      >
        <label className="min-w-0 flex-1 text-sm">
          Find recipient by email
          <input
            className={control}
            maxLength={200}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
            }}
          />
        </label>
        <Button>Find recipient</Button>
      </form>
      {users.isError ? (
        <DataFailure
          error={users.error}
          retry={() => {
            void users.refetch();
          }}
        />
      ) : !users.currentData ? (
        <DataLoading />
      ) : (
        <>
          <ActionForm
            submit="Save dataset access"
            complete={complete}
            confirmation="I confirm this dataset grant for the selected user."
            action={async () => {
              await grant({
                datasetId,
                userId: uuidParamSchema.parse(userId),
                permission: permissionSchema.parse(permission),
              }).unwrap();
            }}
          >
            <label htmlFor={recipientId} className="block text-sm">
              Recipient
              <select
                id={recipientId}
                aria-label="Recipient"
                className={control}
                required
                value={userId}
                onChange={(e) => {
                  setUserId(e.target.value);
                }}
              >
                <option value="">Select an enabled user</option>
                {userId &&
                  !users.currentData.data.some((u) => u.id === userId) && (
                    <option value={userId}>Selected user: {userId}</option>
                  )}
                {users.currentData.data
                  .filter((u) => u.isActive)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.email} ({u.role})
                    </option>
                  ))}
              </select>
            </label>
            <label htmlFor={permissionId} className="block text-sm">
              Permission
              <select
                id={permissionId}
                aria-label="Permission"
                className={control}
                value={permission}
                onChange={(e) => {
                  setPermission(e.target.value);
                }}
              >
                {permissionSchema.options.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          </ActionForm>
          {!users.currentData.data.length && <p>No matching users.</p>}
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              disabled={page === 1 || users.isFetching}
              onClick={() => {
                setPage(page - 1);
              }}
            >
              Previous recipients
            </Button>
            <span className="self-center text-sm">Page {page}</span>
            <Button
              variant="outline"
              disabled={
                !users.currentData.pageInfo.hasNextPage || users.isFetching
              }
              onClick={() => {
                setPage(page + 1);
              }}
            >
              Next recipients
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
function RevokeGrant({
  datasetId,
  userId,
  complete,
}: {
  datasetId: string;
  userId: string;
  complete: () => void;
}) {
  const [revoke] = useRevokePermissionMutation();
  return (
    <ActionForm
      submit="Confirm revoke"
      complete={complete}
      confirmation="I confirm removal of this dataset grant."
      action={async () => {
        await revoke({ datasetId, userId }).unwrap();
      }}
    />
  );
}
