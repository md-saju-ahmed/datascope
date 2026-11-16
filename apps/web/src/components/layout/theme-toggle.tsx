'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function getStoredThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  try {
    const stored = localStorage.getItem('datascope-theme');
    if (stored === 'dark') return 'dark';
    if (stored === 'light') return 'light';
    return 'system';
  } catch {
    return 'system';
  }
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'dark') return 'dark';
  if (mode === 'light') return 'light';
  return getSystemTheme();
}

export function applyThemeToDom(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (resolved === 'dark') {
    root.classList.add('dark');
    root.classList.remove('light');
    root.style.colorScheme = 'dark';
  } else {
    root.classList.remove('dark');
    root.classList.add('light');
    root.style.colorScheme = 'light';
  }
}

export function setThemeMode(mode: ThemeMode): void {
  if (typeof window === 'undefined') return;
  try {
    if (mode === 'system') {
      localStorage.removeItem('datascope-theme');
    } else {
      localStorage.setItem('datascope-theme', mode);
    }
  } catch {
    // LocalStorage might be restricted
  }
  const resolved = resolveTheme(mode);
  applyThemeToDom(resolved);
  window.dispatchEvent(new Event('datascope-theme-change'));
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<ResolvedTheme>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const syncTheme = () => {
      const mode = getStoredThemeMode();
      const resolved = resolveTheme(mode);
      setTheme(resolved);
      applyThemeToDom(resolved);
    };

    syncTheme();
    window.addEventListener('datascope-theme-change', syncTheme);
    window.addEventListener('storage', syncTheme);
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    mql.addEventListener('change', syncTheme);

    return () => {
      window.removeEventListener('datascope-theme-change', syncTheme);
      window.removeEventListener('storage', syncTheme);
      mql.removeEventListener('change', syncTheme);
    };
  }, []);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setThemeMode(next);
  };

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        className={className ?? 'min-h-9 w-9 p-0'}
        aria-label="Toggle theme"
        disabled
      >
        <span className="size-4" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      className={className ?? 'min-h-9 w-9 p-0 cursor-pointer'}
      onClick={toggle}
      aria-label={
        theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
      }
      title={
        theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
      }
    >
      {theme === 'dark' ? (
        <Sun
          size={17}
          className="text-foreground transition-transform hover:rotate-45"
          aria-hidden="true"
        />
      ) : (
        <Moon
          size={17}
          className="text-foreground transition-transform hover:-rotate-12"
          aria-hidden="true"
        />
      )}
    </Button>
  );
}

export function ThemeSelector() {
  const [mode, setMode] = useState<ThemeMode>('system');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const sync = () => {
      setMode(getStoredThemeMode());
    };
    sync();
    window.addEventListener('datascope-theme-change', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('datascope-theme-change', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const change = (next: ThemeMode) => {
    setMode(next);
    setThemeMode(next);
  };

  if (!mounted) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {(['system', 'light', 'dark'] as const).map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => {
            change(key);
          }}
          className={cn(
            'flex min-h-9 items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium capitalize transition-colors cursor-pointer',
            mode === key
              ? 'border-primary bg-primary/10 font-semibold text-primary'
              : 'border-border bg-surface text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          {key === 'system'
            ? 'System preference'
            : key === 'light'
              ? 'Light'
              : 'Dark'}
        </button>
      ))}
    </div>
  );
}
