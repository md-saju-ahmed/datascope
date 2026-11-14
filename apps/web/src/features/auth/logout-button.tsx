'use client';
import { useRef, useState } from 'react';
import { useLogoutMutation } from '@/store/api/auth-api';
import { Button } from '@/components/ui/button';
import { authError } from './errors';

export function LogoutButton() {
  const [logout] = useLogoutMutation();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  async function leave() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError('');
    try {
      await logout(undefined).unwrap();
      window.location.replace('/login');
    } catch (failure) {
      if (
        typeof failure === 'object' &&
        failure !== null &&
        'status' in failure &&
        failure.status === 401
      )
        window.location.replace('/login');
      else setError(authError(failure));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <div>
      <Button
        variant="outline"
        disabled={pending}
        onClick={() => {
          void leave();
        }}
      >
        {pending ? 'Signing out…' : 'Sign out'}
      </Button>
      {error && (
        <p role="alert" className="mt-2 max-w-xs text-sm text-destructive">
          Sign out failed. {error}
        </p>
      )}
    </div>
  );
}
