'use client';
import { useRef, useState, type ReactNode } from 'react';
import { apiErrorSchema } from '@datascope/contracts';
import { Button } from '@/components/ui/button';

export const control =
  'mt-2 min-h-11 w-full min-w-0 rounded-md border border-border bg-surface px-3 py-2 text-sm';
export function mutationMessage(error: unknown) {
  if (typeof error === 'object' && error !== null && 'data' in error) {
    const parsed = apiErrorSchema.safeParse(error.data);
    if (parsed.success) {
      if (parsed.data.code === 'LAST_ADMIN')
        return 'At least one active administrator is required. This change was not saved.';
      if ('status' in error && error.status === 409)
        return 'This change conflicts with existing data. Check unique names/keys and try again.';
      if ('status' in error && (error.status === 403 || error.status === 404))
        return 'This resource is unavailable or your access changed. Refresh to verify access.';
      if ('status' in error && error.status === 400)
        return 'The server rejected this configuration. Check field types, operators, IDs and values.';
    }
  }
  if (typeof error === 'object' && error !== null && 'issues' in error)
    return 'Check the form values against the supported fields and limits.';
  return 'Unable to save this change. Check your connection and try again.';
}
export function ActionForm({
  action,
  children,
  submit,
  confirmation,
  success = 'Changes saved.',
  complete,
}: {
  action: () => Promise<void>;
  children?: ReactNode;
  submit: string;
  confirmation?: string;
  success?: string;
  complete?: () => void;
}) {
  const lock = useRef(false),
    errorRef = useRef<HTMLParagraphElement>(null);
  const [pending, setPending] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (lock.current) return;
        lock.current = true;
        setPending(true);
        setError('');
        setMessage('');
        void (async () => {
          try {
            await action();
            setMessage(success);
            complete?.();
          } catch (reason) {
            setError(mutationMessage(reason));
            requestAnimationFrame(() => {
              errorRef.current?.focus();
            });
          } finally {
            lock.current = false;
            setPending(false);
          }
        })();
      }}
    >
      {error && (
        <p
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="rounded-md border border-destructive p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <fieldset disabled={pending} className="min-w-0 space-y-5">
        {children}
        {confirmation && (
          <label className="flex min-h-11 items-start gap-3 rounded-md border border-border p-3 text-sm">
            <input type="checkbox" required className="mt-1 size-5 shrink-0" />
            {confirmation}
          </label>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving...' : submit}
        </Button>
      </fieldset>
      {message && (
        <p role="status" className="text-sm text-primary">
          {message}
        </p>
      )}
    </form>
  );
}
