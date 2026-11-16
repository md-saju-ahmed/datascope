'use client';
import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import Link from 'next/link';
import { ArrowRight, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import {
  loginRequestSchema,
  registerRequestSchema,
} from '@datascope/contracts';
import { useLoginMutation, useRegisterMutation } from '@/store/api/auth-api';
import { Button } from '@/components/ui/button';
import { safeReturnPath } from './navigation';
import { authError } from './errors';
import { DemoCredentials, type DemoAccount } from './demo-credentials';

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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  useEffect(() => {
    if (failure) summary.current?.focus();
  }, [failure]);
  const busy = useRef(false);
  const summary = useRef<HTMLDivElement>(null);
  const destination = safeReturnPath(returnTo);
  const loginHref = `/login?returnTo=${encodeURIComponent(destination)}`;

  function handleFillDemo(account: DemoAccount) {
    setEmail(account.email);
    setPassword(account.password);
    setErrors({});
    setFailure('');
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const formEmail = values.get('email');
    const formPassword = values.get('password');
    const formConfirm = values.get('confirm');
    const input = {
      email:
        typeof formEmail === 'string' && formEmail.length > 0
          ? formEmail
          : email,
      password:
        typeof formPassword === 'string' && formPassword.length > 0
          ? formPassword
          : password,
    };
    const confirmValue =
      typeof formConfirm === 'string' && formConfirm.length > 0
        ? formConfirm
        : confirm;

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
    if (registration && input.password !== confirmValue)
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
        setEmail('');
        setPassword('');
        setConfirm('');
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
        className="rounded-2xl border border-border bg-surface p-6 sm:p-10 shadow-xl shadow-black/5"
      >
        <div className="mb-5 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ShieldCheck className="size-6 text-primary" aria-hidden="true" />
        </div>
        <h1 id="created-title" className="text-2xl font-bold tracking-tight">
          Account created
        </h1>
        <p role="status" className="my-5 leading-7 text-muted-foreground">
          Your Viewer account is ready. Sign in to start your session. Dataset
          access is managed by your administrator.
        </p>
        <Button asChild>
          <Link href={loginHref}>
            Continue to sign in <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </Button>
      </section>
    );

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-xl shadow-black/5">
      <div className="border-b border-border bg-muted/30 p-6 sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {registration ? 'Create your account' : 'Sign in to DataScope'}
        </h1>
        {registration ? (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-primary/25 bg-primary/5 p-3.5 text-xs leading-relaxed text-foreground">
            <ShieldCheck
              className="mt-0.5 size-4 shrink-0 text-primary"
              aria-hidden="true"
            />
            <div>
              <span className="font-semibold text-primary">Role Notice:</span>{' '}
              <span>
                Start with Viewer access. Your administrator manages roles and
                dataset permissions.
              </span>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Pick up where you left off. Your workspace follows your permissions.
          </p>
        )}
      </div>

      <form
        noValidate
        onSubmit={(event) => {
          void submit(event);
        }}
        aria-busy={pending}
        className="space-y-5 p-6 sm:p-8"
      >
        {failure && (
          <div
            ref={summary}
            role="alert"
            tabIndex={-1}
            className="rounded-lg border border-destructive/30 bg-destructive/10 p-3.5 text-sm font-medium text-destructive"
          >
            {failure}
          </div>
        )}

        {!registration && (
          <>
            <DemoCredentials onFill={handleFillDemo} disabled={pending} />
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-surface px-3 font-medium text-muted-foreground">
                  Or sign in manually
                </span>
              </div>
            </div>
          </>
        )}

        <fieldset disabled={pending} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-foreground"
            >
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              maxLength={254}
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
              }}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'email-error' : undefined}
              className="mt-1.5 block min-h-10 w-full rounded-lg border border-border bg-background px-3.5 text-sm text-foreground placeholder:text-muted-foreground shadow-xs transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {errors.email && (
              <p
                id="email-error"
                className="mt-1.5 text-xs font-medium text-destructive"
              >
                {errors.email}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-foreground"
            >
              Password
            </label>
            <div className="relative mt-1.5">
              <input
                id="password"
                name="password"
                type={visible ? 'text' : 'password'}
                autoComplete={
                  registration ? 'new-password' : 'current-password'
                }
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                }}
                aria-invalid={!!errors.password}
                aria-describedby="password-help password-error"
                className="block min-h-10 w-full rounded-lg border border-border bg-background pl-3.5 pr-11 text-sm text-foreground placeholder:text-muted-foreground shadow-xs transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                type="button"
                aria-label={visible ? 'Hide password' : 'Show password'}
                aria-pressed={visible}
                onClick={() => {
                  setVisible(!visible);
                }}
                className="absolute right-0 top-0 flex size-10 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              >
                {visible ? (
                  <EyeOff size={16} aria-hidden="true" />
                ) : (
                  <Eye size={16} aria-hidden="true" />
                )}
              </button>
            </div>
            <p
              id="password-help"
              className="mt-1.5 text-xs leading-normal text-muted-foreground"
            >
              {registration
                ? 'At least 16 characters; at most 128 UTF-8 bytes. Spaces and pasted passwords are welcome.'
                : 'Use your account password. Password managers and paste are supported.'}
            </p>
            {errors.password && (
              <p
                id="password-error"
                className="mt-1.5 text-xs font-medium text-destructive"
              >
                {errors.password}
              </p>
            )}
          </div>
          {registration && (
            <div>
              <label
                htmlFor="confirm"
                className="block text-sm font-medium text-foreground"
              >
                Confirm password
              </label>
              <input
                id="confirm"
                name="confirm"
                type={visible ? 'text' : 'password'}
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
                }}
                aria-invalid={!!errors.confirm}
                aria-describedby={errors.confirm ? 'confirm-error' : undefined}
                className="mt-1.5 block min-h-10 w-full rounded-lg border border-border bg-background px-3.5 text-sm text-foreground placeholder:text-muted-foreground shadow-xs transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {errors.confirm && (
                <p
                  id="confirm-error"
                  className="mt-1.5 text-xs font-medium text-destructive"
                >
                  {errors.confirm}
                </p>
              )}
            </div>
          )}
        </fieldset>
        <Button
          type="submit"
          disabled={pending}
          className="min-h-11 w-full cursor-pointer rounded-lg bg-primary font-medium text-primary-foreground shadow-xs hover:bg-primary/90 transition-colors"
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
          <Link
            className="inline-flex min-h-11 items-center font-medium text-primary hover:underline underline-offset-4"
            href={
              registration
                ? loginHref
                : `/register?returnTo=${encodeURIComponent(destination)}`
            }
          >
            {registration ? 'Sign in' : 'Create an account'}
          </Link>
        </p>
      </form>
    </section>
  );
}
