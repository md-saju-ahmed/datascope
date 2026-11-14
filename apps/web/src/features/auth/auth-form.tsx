'use client';
import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { ArrowRight, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import {
  loginRequestSchema,
  registerRequestSchema,
} from '@datascope/contracts';
import { useLoginMutation, useRegisterMutation } from '@/store/api/auth-api';
import { Button } from '@/components/ui/button';
import { safeReturnPath } from './navigation';
import { authError } from './errors';

export function AuthForm({
  registration,
  returnTo,
}: {
  registration: boolean;
  returnTo: string;
}) {
  const [login] = useLoginMutation();
  const [register] = useRegisterMutation();
  const [pending, setPending] = useState(false);
  const [visible, setVisible] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState('');
  const [created, setCreated] = useState(false);
  useEffect(() => {
    if (failure) summary.current?.focus();
  }, [failure]);
  const busy = useRef(false);
  const summary = useRef<HTMLDivElement>(null);
  const destination = safeReturnPath(returnTo);
  const loginHref = `/login?returnTo=${encodeURIComponent(destination)}`;
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const email = values.get('email');
    const password = values.get('password');
    const input = {
      email: typeof email === 'string' ? email : '',
      password: typeof password === 'string' ? password : '',
    };
    const parsed = (
      registration ? registerRequestSchema : loginRequestSchema
    ).safeParse(input);
    const fields: Record<string, string> = {};
    if (!parsed.success)
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0]);
        fields[field] =
          field === 'email'
            ? 'Enter a valid email address (up to 254 characters).'
            : registration
              ? 'Use at least 16 characters and at most 128 UTF-8 bytes.'
              : 'Enter your password (at most 128 UTF-8 bytes).';
      }
    if (registration && input.password !== values.get('confirm'))
      fields.confirm = 'Passwords must match.';
    setErrors(fields);
    setFailure('');
    if (!parsed.success || Object.keys(fields).length) {
      const first = form.elements.namedItem(Object.keys(fields)[0] ?? 'email');
      if (first instanceof HTMLElement) first.focus();
      return;
    }
    busy.current = true;
    setPending(true);
    try {
      if (registration) {
        await register(parsed.data).unwrap();
        form.reset();
        setCreated(true);
      } else {
        await login(parsed.data).unwrap();
        window.location.replace(destination);
      }
    } catch (error) {
      setFailure(authError(error, registration));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  if (created)
    return (
      <section
        aria-labelledby="created-title"
        className="rounded-xl border border-border bg-surface p-6 sm:p-10"
      >
        <ShieldCheck className="mb-5 text-primary" aria-hidden="true" />
        <h1 id="created-title" className="text-2xl font-semibold">
          Account created
        </h1>
        <p role="status" className="my-5 leading-7 text-muted-foreground">
          Your Viewer account is ready. Sign in to start your session. Dataset
          access is managed by your administrator.
        </p>
        <Button asChild>
          <a href={loginHref}>
            Continue to sign in <ArrowRight size={16} aria-hidden="true" />
          </a>
        </Button>
      </section>
    );
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div className="border-b border-border bg-muted/40 p-6 sm:px-10 sm:py-8">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-primary">
          Your data workspace
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {registration ? 'Create your account' : 'Sign in to DataScope'}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {registration
            ? 'Start with Viewer access. Your administrator manages roles and dataset permissions.'
            : 'Pick up where you left off. Your workspace follows your permissions.'}
        </p>
      </div>
      <form
        noValidate
        onSubmit={(event) => {
          void submit(event);
        }}
        aria-busy={pending}
        className="space-y-5 p-6 sm:p-10"
      >
        {failure && (
          <div
            ref={summary}
            role="alert"
            tabIndex={-1}
            className="rounded-md border border-destructive p-3 text-sm text-destructive"
          >
            {failure}
          </div>
        )}
        <fieldset disabled={pending} className="space-y-5">
          <div>
            <label htmlFor="email" className="text-sm font-medium">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              maxLength={254}
              required
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'email-error' : undefined}
              className="mt-2 block min-h-11 w-full rounded-md border border-border bg-surface px-3 text-base"
            />
            {errors.email && (
              <p id="email-error" className="mt-2 text-sm text-destructive">
                {errors.email}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <div className="relative mt-2">
              <input
                id="password"
                name="password"
                type={visible ? 'text' : 'password'}
                autoComplete={
                  registration ? 'new-password' : 'current-password'
                }
                required
                aria-invalid={!!errors.password}
                aria-describedby="password-help password-error"
                className="block min-h-11 w-full rounded-md border border-border bg-surface pl-3 pr-14 text-base"
              />
              <button
                type="button"
                aria-label={visible ? 'Hide password' : 'Show password'}
                aria-pressed={visible}
                onClick={() => {
                  setVisible(!visible);
                }}
                className="absolute right-0 top-0 flex size-11 cursor-pointer items-center justify-center"
              >
                {visible ? (
                  <EyeOff size={18} aria-hidden="true" />
                ) : (
                  <Eye size={18} aria-hidden="true" />
                )}
              </button>
            </div>
            <p
              id="password-help"
              className="mt-2 text-xs leading-5 text-muted-foreground"
            >
              {registration
                ? 'At least 16 characters; at most 128 UTF-8 bytes. Spaces and pasted passwords are welcome.'
                : 'Use your account password. Password managers and paste are supported.'}
            </p>
            <p id="password-error" className="mt-2 text-sm text-destructive">
              {errors.password}
            </p>
          </div>
          {registration && (
            <div>
              <label htmlFor="confirm" className="text-sm font-medium">
                Confirm password
              </label>
              <input
                id="confirm"
                name="confirm"
                type={visible ? 'text' : 'password'}
                autoComplete="new-password"
                required
                aria-invalid={!!errors.confirm}
                aria-describedby={errors.confirm ? 'confirm-error' : undefined}
                className="mt-2 block min-h-11 w-full rounded-md border border-border bg-surface px-3 text-base"
              />
              {errors.confirm && (
                <p id="confirm-error" className="mt-2 text-sm text-destructive">
                  {errors.confirm}
                </p>
              )}
            </div>
          )}
        </fieldset>
        <Button
          type="submit"
          disabled={pending}
          className="min-h-11 w-full cursor-pointer"
        >
          {pending
            ? registration
              ? 'Creating account…'
              : 'Signing in…'
            : registration
              ? 'Create Viewer account'
              : 'Sign in'}
          <ArrowRight size={16} aria-hidden="true" />
        </Button>
        <p role="status" className="sr-only">
          {pending ? 'Request in progress. Please wait.' : ''}
        </p>
        <p className="text-center text-sm text-muted-foreground">
          {registration ? 'Already have an account?' : 'New to DataScope?'}{' '}
          <a
            className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4"
            href={
              registration
                ? loginHref
                : `/register?returnTo=${encodeURIComponent(destination)}`
            }
          >
            {registration ? 'Sign in' : 'Create an account'}
          </a>
        </p>
      </form>
    </section>
  );
}
