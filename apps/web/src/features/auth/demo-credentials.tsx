'use client';

import { useState } from 'react';
import { Sparkles, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DEMO_ACCOUNTS, type DemoAccount } from './demo-accounts';
export { DEMO_ACCOUNTS, type DemoAccount };

interface DemoCredentialsProps {
  onFill: (account: DemoAccount) => void;
  disabled?: boolean;
}

export function DemoCredentials({
  onFill,
  disabled = false,
}: DemoCredentialsProps) {
  const [selectedId, setSelectedId] = useState<
    'analyst' | 'admin' | 'viewer' | null
  >(null);

  function handleSelect(account: DemoAccount) {
    setSelectedId(account.id);
    onFill(account);
  }

  const selected = DEMO_ACCOUNTS.find((item) => item.id === selectedId);

  return (
    <div
      aria-labelledby="demo-credentials-title"
      className="rounded-xl border border-primary/20 bg-primary/[0.03] p-4 text-foreground transition-all"
    >
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
          <h2
            id="demo-credentials-title"
            className="text-xs font-semibold tracking-tight text-foreground"
          >
            Demo Accounts
          </h2>
        </div>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
          1-Click Auto-Fill
        </span>
      </div>

      {/* Role selector tabs */}
      <div
        role="tablist"
        aria-label="Demo role options"
        className="grid grid-cols-3 gap-2"
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
              onClick={() => {
                handleSelect(account);
              }}
              className={cn(
                'group flex flex-col items-center justify-center rounded-lg border p-2 text-center transition-all cursor-pointer',
                isSelected
                  ? 'border-primary bg-primary text-primary-foreground font-semibold shadow-xs'
                  : 'border-border bg-surface text-muted-foreground hover:border-primary/40 hover:bg-muted/50 hover:text-foreground',
                disabled && 'pointer-events-none opacity-50',
              )}
            >
              <span className="text-xs font-medium">{account.role}</span>
              <span
                className={cn(
                  'mt-0.5 text-[10px] leading-tight',
                  isSelected
                    ? 'text-primary-foreground/90'
                    : 'text-primary font-medium',
                )}
              >
                {account.badge}
              </span>
            </button>
          );
        })}
      </div>

      {selected && (
        <p className="mt-2.5 flex items-center gap-1.5 text-[11px] font-medium text-primary">
          <Check size={13} aria-hidden="true" />
          <span>{selected.role} credentials loaded into form</span>
        </p>
      )}
    </div>
  );
}
