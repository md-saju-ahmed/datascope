import { StoreProvider } from '@/store/provider';
import { SessionBoundary } from '@/features/auth/session-boundary';
import { AuthForm } from '@/features/auth/auth-form';
import { safeReturnPath } from '@/features/auth/navigation';
export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const target = safeReturnPath((await searchParams).returnTo);
  return (
    <div className="mx-auto max-w-lg">
      <StoreProvider initialUser={null}>
        <SessionBoundary publicAuth returnTo={target}>
          <AuthForm registration={true} returnTo={target} />
        </SessionBoundary>
      </StoreProvider>
    </div>
  );
}
