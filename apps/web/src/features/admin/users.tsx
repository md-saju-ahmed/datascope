'use client';
import { useId, useState } from 'react';
import {
  currentUserSchema,
  userPatchSchema,
  type usersResponseSchema,
} from '@datascope/contracts';
import {
  useGetUsersQuery,
  useUpdateUserMutation,
} from '@/store/api/management-api';
import { useAppSelector } from '@/store/hooks';
import { Button } from '@/components/ui/button';
import { FormDialog } from '@/components/ui/form-dialog';
import { DataFailure, DataLoading } from '@/features/datasets/data-state';
import { ActionForm, control } from '@/features/settings/form-support';
type ManagedUser = ReturnType<typeof usersResponseSchema.parse>['data'][number];
export function UsersManager() {
  const [page, setPage] = useState(1),
    [draft, setDraft] = useState(''),
    [q, setQ] = useState(''),
    [message, setMessage] = useState('');
  const result = useGetUsersQuery({ page, pageSize: 10, q });
  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">User management</h1>
        <p className="mt-3 text-muted-foreground">
          Manage roles and enabled accounts. Dataset grants remain separate from
          roles.
        </p>
      </header>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setQ(draft.trim());
        }}
      >
        <label className="min-w-0 flex-1 text-sm">
          Search users by email
          <input
            className={control}
            value={draft}
            maxLength={200}
            onChange={(e) => {
              setDraft(e.target.value);
            }}
          />
        </label>
        <Button>Search users</Button>
        <Button
          type="button"
          variant="outline"
          disabled={result.isFetching}
          onClick={() => {
            void result.refetch();
          }}
        >
          Refresh users
        </Button>
      </form>
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
            <p>No users match this search.</p>
          )}
          <div className="grid gap-4 xl:grid-cols-2">
            {result.currentData.data.map((user) => (
              <article
                key={user.id}
                className="min-w-0 space-y-3 rounded-xl border border-border bg-surface p-5"
              >
                <h2 className="break-words font-semibold">{user.email}</h2>
                <p className="text-sm">
                  {user.role} · {user.isActive ? 'Enabled' : 'Disabled'}
                </p>
                <p className="break-words text-xs text-muted-foreground">
                  User ID: {user.id}
                </p>
                <p className="text-xs text-muted-foreground">
                  Created {user.createdAt.slice(0, 10)} · Updated{' '}
                  {user.updatedAt.slice(0, 10)} (UTC)
                </p>
                <FormDialog
                  title="Change user access"
                  description={`Update ${user.email}. Disabling an account revokes its sessions.`}
                  trigger={<Button variant="outline">Change access</Button>}
                >
                  {(close) => (
                    <UserEditor
                      user={user}
                      complete={() => {
                        setMessage('User access updated.');
                        close();
                      }}
                    />
                  )}
                </FormDialog>
              </article>
            ))}
          </div>
          <nav
            aria-label="User pages"
            className="flex flex-wrap items-center gap-3"
          >
            <Button
              variant="outline"
              disabled={page === 1 || result.isFetching}
              onClick={() => {
                setPage(page - 1);
              }}
            >
              Previous users
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
              Next users
            </Button>
          </nav>
        </>
      )}
    </section>
  );
}
function UserEditor({
  user,
  complete,
}: {
  user: ManagedUser;
  complete: () => void;
}) {
  const roleId = useId();
  const [role, setRole] = useState(user.role),
    [active, setActive] = useState(user.isActive);
  const [update] = useUpdateUserMutation(),
    current = useAppSelector((s) => s.auth.user);
  return (
    <ActionForm
      submit="Save user access"
      complete={complete}
      confirmation={`I confirm this role/status change for ${user.email}.`}
      action={async () => {
        await update({
          userId: user.id,
          changes: userPatchSchema.parse({ role, isActive: active }),
        }).unwrap();
      }}
    >
      {user.id === current?.id && (
        <p className="text-sm text-destructive">
          You are changing your own account. Losing Admin access can end this
          session. The server prevents removal of the final active Admin.
        </p>
      )}
      <label htmlFor={roleId} className="block text-sm">
        Role
        <select
          id={roleId}
          aria-label="Role"
          className={control}
          value={role}
          onChange={(e) => {
            setRole(currentUserSchema.shape.role.parse(e.target.value));
          }}
        >
          {['admin', 'analyst', 'viewer'].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => {
            setActive(e.target.checked);
          }}
          className="size-5"
        />
        Account enabled
      </label>
    </ActionForm>
  );
}
