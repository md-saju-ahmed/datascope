'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './button';

// shadcn Sheet composition; Radix supplies modal focus trapping and restoration.
export function Sheet({
  trigger,
  children,
  open,
  onOpenChange,
}: {
  trigger: ReactNode;
  children: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-foreground/40" />
        <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[90vw] flex-col overflow-y-auto scrollbar-sleek border-r border-border bg-surface p-4 shadow-xl">
          <div className="mb-6 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold">
              DataScope
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" aria-label="Close navigation">
                <X size={20} />
              </Button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            Application navigation
          </Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
