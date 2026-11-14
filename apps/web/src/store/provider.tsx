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
  if (!storeRef.current) storeRef.current = makeStore(initialUser);
  useEffect(() => {
    const store = storeRef.current;
    if (!store) return;
    const unsubscribe = setupListeners(store.dispatch);
    return () => {
      unsubscribe();
      store.clearApi();
    };
  }, []);
  return <Provider store={storeRef.current}>{children}</Provider>;
}
