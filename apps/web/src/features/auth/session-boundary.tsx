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
import { Skeleton } from '@/components/ui/skeleton';
import { RouteLoading } from '@/components/layout/route-state';
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
    user ? 'ready' : 'checking',
  );
  const busy = useRef(false);
  const check = useCallback(
    async (isBackground = false) => {
      if (busy.current) return;
      busy.current = true;
      if (!isBackground) {
        setState('checking');
      }
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
    },
    [dispatch],
  );
  useEffect(() => {
    void check(!publicAuth && !!user);
    const recover = () => {
      if (!publicAuth && document.visibilityState === 'visible') {
        void check(true);
      }
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
  if (state === 'checking' || changed || (publicAuth && user)) {
    if (publicAuth) {
      return (
        <div
          role="status"
          aria-busy="true"
          aria-label="Checking your session"
          className="w-full overflow-hidden rounded-2xl border border-border bg-surface shadow-xl shadow-black/5"
        >
          <span className="sr-only">Checking your session…</span>
          {/* Header Skeleton */}
          <div className="border-b border-border bg-muted/30 p-6 sm:p-8 space-y-3">
            <Skeleton className="h-7 w-48 rounded-md" />
            <Skeleton className="h-4 w-72 rounded-md" />
          </div>

          {/* Form Skeleton */}
          <div className="space-y-5 p-6 sm:p-8">
            {/* Demo tabs placeholder */}
            <div className="rounded-xl border border-primary/10 bg-primary/[0.02] p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <Skeleton className="h-3.5 w-24 rounded" />
                <Skeleton className="h-4 w-20 rounded-full" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Skeleton className="h-12 rounded-lg" />
                <Skeleton className="h-12 rounded-lg" />
                <Skeleton className="h-12 rounded-lg" />
              </div>
            </div>

            {/* Email input skeleton */}
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-24 rounded" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>

            {/* Password input skeleton */}
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-20 rounded" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>

            {/* Action button skeleton */}
            <Skeleton className="mt-2 h-11 w-full rounded-lg" />

            {/* Bottom link skeleton */}
            <div className="flex justify-center pt-2">
              <Skeleton className="h-4 w-44 rounded" />
            </div>
          </div>
        </div>
      );
    }

    return <RouteLoading />;
  }
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
            void check(false);
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
