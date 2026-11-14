'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { useRef } from 'react';
import Link from 'next/link';
import { useGetRecordQuery } from '@/store/api/datasets-api';
import { Button } from '@/components/ui/button';
import { DataLoading, DataFailure } from '@/features/datasets/data-state';
import { RecordFields } from './record-fields';

export function RecordPeek({
  datasetId,
  recordId,
  close,
  returnQuery,
}: {
  datasetId: string;
  recordId: string;
  close: () => void;
  returnQuery: string;
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
            <>
              <Link
                prefetch={false}
                className="mb-5 inline-flex min-h-11 items-center text-primary underline"
                href={`/datasets/${datasetId}/records/${recordId}?return=${encodeURIComponent(returnQuery)}`}
              >
                Open full record
              </Link>
              <RecordFields record={result.currentData.data} />
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
