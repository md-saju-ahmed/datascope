'use client';

import { useState } from 'react';
import {
  Sparkles,
  Zap,
  Copy,
  Check,
  Eye,
  EyeOff,
  ShieldCheck,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DEMO_ACCOUNTS, type DemoAccount } from './demo-accounts';
export { DEMO_ACCOUNTS, type DemoAccount };

interface DemoCredentialsProps {
  onFill: (account: DemoAccount) => void;
  onQuickLogin: (account: DemoAccount) => void;
  disabled?: boolean;
  pendingQuickLoginRole?: string | null;
}

export function DemoCredentials({
  onFill,
  onQuickLogin,
  disabled = false,
  pendingQuickLoginRole = null,
}: DemoCredentialsProps) {
  const [selectedId, setSelectedId] = useState<'analyst' | 'admin' | 'viewer'>(
    'analyst',
  );
  const [showPassword, setShowPassword] = useState(false);
  const [copiedField, setCopiedField] = useState<'email' | 'password' | null>(
    null,
  );
  const [appliedRole, setAppliedRole] = useState<string | null>(null);

  const selected: DemoAccount =
    DEMO_ACCOUNTS.find((item) => item.id === selectedId) ??
    (DEMO_ACCOUNTS[0] as DemoAccount);

  async function handleCopy(text: string, field: 'email' | 'password') {
    try {
      if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard &&
        window.isSecureContext
      ) {
        await navigator.clipboard.writeText(text);
      } else if (typeof document !== 'undefined') {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedField(field);
      setTimeout(() => {
        setCopiedField((curr) => (curr === field ? null : curr));
      }, 2000);
    } catch {
      // Fallback
    }
  }

  function handleSelect(account: DemoAccount) {
    setSelectedId(account.id);
    setShowPassword(false);
    onFill(account);
    setAppliedRole(account.role);
    setTimeout(() => {
      setAppliedRole((curr) => (curr === account.role ? null : curr));
    }, 2500);
  }

  const isCurrentRolePending = pendingQuickLoginRole === selected.id;

  return (
    <div
      aria-labelledby="demo-credentials-title"
      className="rounded-lg border border-primary/20 bg-primary/[0.03] p-4 text-foreground transition-all"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" aria-hidden="true" />
          <h2
            id="demo-credentials-title"
            className="text-sm font-semibold tracking-tight text-foreground"
          >
            Recruiter & Demo Access
          </h2>
        </div>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
          Instant Evaluation
        </span>
      </div>

      <p className="mb-3 text-xs leading-5 text-muted-foreground">
        Select a pre-configured role below to auto-fill or sign in with 1 click:
      </p>

      {/* Role selector tabs */}
      <div
        role="tablist"
        aria-label="Demo role options"
        className="grid grid-cols-3 gap-1.5"
      >
        {DEMO_ACCOUNTS.map((account) => {
          const isSelected = account.id === selectedId;
          return (
            <button
              key={account.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              disabled={disabled}
              onClick={() => handleSelect(account)}
              className={cn(
                'flex flex-col items-center justify-center rounded-md border p-2 text-center transition-colors cursor-pointer',
                isSelected
                  ? 'border-primary bg-primary text-primary-foreground shadow-xs font-semibold'
                  : 'border-border bg-surface text-muted-foreground hover:bg-muted hover:text-foreground',
                disabled && 'pointer-events-none opacity-50',
              )}
            >
              <span className="text-xs">{account.role}</span>
              <span
                className={cn(
                  'text-[10px] font-normal leading-tight opacity-90',
                  isSelected ? 'text-primary-foreground' : 'text-primary',
                )}
              >
                {account.badge}
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected role details card */}
      <div className="mt-3 space-y-2.5 rounded-md border border-border bg-surface p-3 text-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-foreground">
              {selected.role} Account
            </span>
            <span className="text-[11px] text-muted-foreground">
              ({selected.tagline})
            </span>
          </div>
        </div>

        <p className="text-muted-foreground leading-relaxed">
          {selected.description}
        </p>

        {/* Credentials rows */}
        <div className="space-y-1.5 rounded border border-border/70 bg-muted/40 p-2 font-mono">
          {/* Email row */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 overflow-hidden">
              <span className="text-[10px] uppercase font-sans text-muted-foreground select-none">
                Email:
              </span>
              <span className="truncate text-foreground select-all font-medium">
                {selected.email}
              </span>
            </div>
            <button
              type="button"
              aria-label={`Copy ${selected.role} email`}
              disabled={disabled}
              onClick={() => void handleCopy(selected.email, 'email')}
              className="inline-flex size-6 shrink-0 items-center justify-center rounded border border-border bg-surface text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              {copiedField === 'email' ? (
                <Check className="size-3 text-primary" aria-hidden="true" />
              ) : (
                <Copy className="size-3" aria-hidden="true" />
              )}
            </button>
          </div>

          {/* Password row */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 overflow-hidden">
              <span className="text-[10px] uppercase font-sans text-muted-foreground select-none">
                Password:
              </span>
              <span className="truncate text-foreground select-all font-medium">
                {showPassword ? selected.password : '••••••••••••••••••••••••'}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label={
                  showPassword
                    ? 'Hide demo password'
                    : 'Show demo password'
                }
                disabled={disabled}
                onClick={() => setShowPassword(!showPassword)}
                className="inline-flex size-6 shrink-0 items-center justify-center rounded border border-border bg-surface text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                {showPassword ? (
                  <EyeOff className="size-3" aria-hidden="true" />
                ) : (
                  <Eye className="size-3" aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                aria-label={`Copy ${selected.role} password`}
                disabled={disabled}
                onClick={() => void handleCopy(selected.password, 'password')}
                className="inline-flex size-6 shrink-0 items-center justify-center rounded border border-border bg-surface text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                {copiedField === 'password' ? (
                  <Check className="size-3 text-primary" aria-hidden="true" />
                ) : (
                  <Copy className="size-3" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Copy/Fill live announcement */}
        {copiedField && (
          <p role="status" className="text-[11px] text-primary font-medium">
            ✓ Copied {copiedField} to clipboard.
          </p>
        )}
        {appliedRole && !copiedField && (
          <p role="status" className="text-[11px] text-primary font-medium">
            ✓ {appliedRole} credentials filled into form below.
          </p>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            disabled={disabled || isCurrentRolePending}
            onClick={() => {
              onFill(selected);
              setAppliedRole(selected.role);
              setTimeout(() => {
                setAppliedRole((curr) =>
                  curr === selected.role ? null : curr,
                );
              }, 2500);
            }}
            className="min-h-9 flex-1 text-xs cursor-pointer"
          >
            Fill Form
          </Button>

          <Button
            type="button"
            disabled={disabled || isCurrentRolePending}
            onClick={() => onQuickLogin(selected)}
            className="min-h-9 flex-1 text-xs font-semibold cursor-pointer shadow-xs"
          >
            {isCurrentRolePending ? (
              'Signing in…'
            ) : (
              <>
                <Zap className="size-3.5 fill-current" aria-hidden="true" />
                1-Click Sign In
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
