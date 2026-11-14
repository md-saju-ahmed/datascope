'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { useRef } from 'react';
import { useGetRecordQuery } from '@/store/api/datasets-api';
import { Button } from '@/components/ui/button';
import {
  DataLoading,
  DataFailure,
  displayValue,
} from '@/features/datasets/data-state';

export function RecordPeek({
  datasetId,
  recordId,
  close,
}: {
  datasetId: string;
  recordId: string;
  close: () => void;
}) {
  const result = useGetRecordQuery({ datasetId, recordId });
  const opener = useRef(document.activeElement);
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-foreground/40" />
        <Dialog.Content
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (opener.current instanceof HTMLElement) opener.current.focus();
          }}
          className="fixed inset-y-0 right-0 z-50 w-full max-w-xl overflow-y-auto border-l border-border bg-surface p-6 shadow-xl"
        >
          <div className="flex items-center justify-between gap-3">
            <Dialog.Title className="text-xl font-semibold">
              Record details
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="outline">Close details</Button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="my-4 text-sm text-muted-foreground">
            Complete record information loaded separately from the table.
          </Dialog.Description>
          {result.isError ? (
            <DataFailure
              error={result.error}
              retry={() => {
                void result.refetch();
              }}
            />
          ) : !result.currentData ? (
            <DataLoading />
          ) : (
            <dl className="space-y-4">
              {Object.entries(result.currentData.data).map(([key, value]) => (
                <div key={key} className="border-b border-border pb-4">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {key}
                  </dt>
                  <dd className="mt-2 whitespace-pre-wrap break-words text-sm">
                    {displayValue(value)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
