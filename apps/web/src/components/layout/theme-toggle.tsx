'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const syncTheme = () => {
      const stored = localStorage.getItem('datascope-theme');
      if (stored === 'dark') {
        setTheme('dark');
      } else if (stored === 'light') {
        setTheme('light');
      } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        setTheme('dark');
      } else {
        setTheme('light');
      }
    };

    syncTheme();
    window.addEventListener('datascope-theme-change', syncTheme);
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handleMedia = () => {
      if (!localStorage.getItem('datascope-theme')) {
        syncTheme();
      }
    };
    mql.addEventListener('change', handleMedia);

    return () => {
      window.removeEventListener('datascope-theme-change', syncTheme);
      mql.removeEventListener('change', handleMedia);
    };
  }, []);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('datascope-theme', next);
    if (next === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
    window.dispatchEvent(new Event('datascope-theme-change'));
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
      className={className ?? 'min-h-9 w-9 p-0'}
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
  const [mode, setMode] = useState<'system' | 'light' | 'dark'>('system');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const sync = () => {
      const stored = localStorage.getItem('datascope-theme');
      if (stored === 'dark') setMode('dark');
      else if (stored === 'light') setMode('light');
      else setMode('system');
    };
    sync();
    window.addEventListener('datascope-theme-change', sync);
    return () => {
      window.removeEventListener('datascope-theme-change', sync);
    };
  }, []);

  const change = (next: 'system' | 'light' | 'dark') => {
    setMode(next);
    if (next === 'system') {
      localStorage.removeItem('datascope-theme');
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.remove('light');
      }
    } else if (next === 'dark') {
      localStorage.setItem('datascope-theme', 'dark');
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      localStorage.setItem('datascope-theme', 'light');
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
    window.dispatchEvent(new Event('datascope-theme-change'));
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
            'flex min-h-9 items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium capitalize transition-colors',
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
