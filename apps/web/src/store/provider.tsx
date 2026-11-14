'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { setupListeners } from '@reduxjs/toolkit/query';
import { Provider } from 'react-redux';
import type { CurrentUser } from '@datascope/contracts';
import { makeStore, type AppStore } from './store.ts';

export function StoreProvider({
  initialUser,
  children,
}: {
  initialUser: CurrentUser | null;
  children: ReactNode;
}) {
  const storeRef = useRef<AppStore | null>(null);
  const effectVersion = useRef(0);
  if (!storeRef.current) storeRef.current = makeStore(initialUser);
  useEffect(() => {
    const store = storeRef.current;
    if (!store) return;
    const version = ++effectVersion.current;
    const unsubscribe = setupListeners(store.dispatch);
    return () => {
      unsubscribe();
      // Strict Mode replays setup/cleanup synchronously in development. A real
      // unmount still clears private state, after any immediate replay can cancel it.
      queueMicrotask(() => {
        if (effectVersion.current === version) store.clearApi();
      });
    };
  }, []);
  return <Provider store={storeRef.current}>{children}</Provider>;
}
