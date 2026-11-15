'use client';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { authApi } from '@/store/api/auth-api';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { authSlice } from '@/store/slices/auth-slice';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { safeReturnPath, signInPath } from './navigation';

export function SessionBoundary({
  children,
  publicAuth = false,
  returnTo = '/dashboard',
}: {
  children: ReactNode;
  publicAuth?: boolean;
  returnTo?: string;
}) {
  const dispatch = useAppDispatch();
  const user = useAppSelector(authSlice.selectors.selectUser);
  const initial = useRef(user);
  const [state, setState] = useState<'checking' | 'ready' | 'unavailable'>(
    'checking',
  );
  const busy = useRef(false);
  const check = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setState('checking');
    const request = dispatch(
      authApi.endpoints.getSession.initiate(undefined, {
        subscribe: false,
        forceRefetch: true,
      }),
    );
    try {
      await request.unwrap();
      setState('ready');
    } catch (error) {
      setState(
        typeof error === 'object' &&
          error !== null &&
          'status' in error &&
          error.status === 401
          ? 'ready'
          : 'unavailable',
      );
    } finally {
      busy.current = false;
    }
  }, [dispatch]);
  useEffect(() => {
    void check();
    const recover = () => {
      if (!publicAuth && document.visibilityState === 'visible') void check();
    };
    window.addEventListener('focus', recover);
    window.addEventListener('online', recover);
    window.addEventListener('pageshow', recover);
    document.addEventListener('visibilitychange', recover);
    const timer = publicAuth ? undefined : window.setInterval(recover, 60000);
    return () => {
      window.removeEventListener('focus', recover);
      window.removeEventListener('online', recover);
      window.removeEventListener('pageshow', recover);
      document.removeEventListener('visibilitychange', recover);
      if (timer) clearInterval(timer);
    };
  }, [check, publicAuth]);
  const changed =
    !!user &&
    !!initial.current &&
    (user.id !== initial.current.id ||
      user.role !== initial.current.role ||
      user.email !== initial.current.email);
  useEffect(() => {
    if (state === 'ready' && publicAuth && user)
      window.location.replace(safeReturnPath(returnTo));
    else if (changed) window.location.reload();
  }, [state, publicAuth, user, returnTo, changed]);
  if (state === 'checking' || changed || (publicAuth && user))
    return (
      <div role="status" className="mx-auto max-w-lg space-y-4 p-8">
        <div className="h-2 w-20 rounded bg-primary" />
        <p className="text-sm text-muted-foreground">Checking your session…</p>
      </div>
    );
  if (state === 'unavailable')
    return (
      <section className="mx-auto max-w-lg space-y-5 p-8">
        <h1 className="text-2xl font-semibold">
          Session verification unavailable
        </h1>
        <p className="text-muted-foreground">
          We cannot verify your session right now. Check your connection and try
          again.
        </p>
        <Button
          onClick={() => {
            void check();
          }}
        >
          Try again
        </Button>
      </section>
    );
  if (!publicAuth && !user)
    return (
      <main className="mx-auto max-w-lg space-y-5 p-8">
        <h1 className="text-2xl font-semibold">Sign in required</h1>
        <p>Your session has ended. Sign in again to continue.</p>
        <Button asChild>
          <Link
            href={signInPath(window.location.pathname + window.location.search)}
          >
            Go to sign in
          </Link>
        </Button>
      </main>
    );
  return children;
}
