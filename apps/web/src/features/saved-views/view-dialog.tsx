'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
export function ViewDialog({
  title,
  description,
  trigger,
  children,
}: {
  title: string;
  description: string;
  trigger: ReactNode;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-foreground/40" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl overflow-y-auto bg-surface p-5 shadow-xl sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Dialog.Title className="text-xl font-semibold">
              {title}
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost">Close dialog</Button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="my-4 text-sm text-muted-foreground">
            {description}
          </Dialog.Description>
          {open &&
            children(() => {
              setOpen(false);
            })}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
