'use client';
import { useRef, type ReactNode } from 'react';
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
  return <Provider store={storeRef.current}>{children}</Provider>;
}
