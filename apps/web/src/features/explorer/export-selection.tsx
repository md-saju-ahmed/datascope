'use client';
import { useEffect, useRef, useState } from 'react';
import { selectedExportSchema } from '@datascope/contracts';
import { Button } from '@/components/ui/button';
import { useExportSelectedMutation } from '@/store/api/search-api';

export function ExportSelection({
  datasetId,
  recordIds,
  columns,
}: {
  datasetId: string;
  recordIds: string[];
  columns: string[];
}) {
  const [exportSelected, { isLoading, reset }] = useExportSelectedMutation();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const active = useRef(false);
  const pending = useRef<ReturnType<typeof exportSelected> | null>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      pending.current?.abort();
    };
  }, []);
  async function download() {
    if (pending.current) return;
    const selection = selectedExportSchema.safeParse({ recordIds, columns });
    if (!selection.success) {
      setError('Select between 1 and 1,000 records and at least one column.');
      return;
    }
    setError('');
    setMessage('');
    const request = exportSelected({ datasetId, selection: selection.data });
    pending.current = request;
    try {
      const csv = await request.unwrap();
      if (!active.current) return;
      const url = URL.createObjectURL(
        new Blob([csv], { type: 'text/csv;charset=utf-8' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = 'datascope-selected.csv';
      document.body.appendChild(link);
      try {
        link.click();
        setMessage(
          `CSV download started for ${String(selection.data.recordIds.length)} selected records.`,
        );
      } finally {
        link.remove();
        // Allow the browser to consume the download before releasing its URL.
        window.setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 1000);
      }
    } catch (failure: unknown) {
      if (!active.current) return;
      const status =
        typeof failure === 'object' && failure !== null && 'status' in failure
          ? failure.status
          : undefined;
      const data =
        typeof failure === 'object' && failure !== null && 'data' in failure
          ? failure.data
          : undefined;
      const code =
        typeof data === 'object' && data !== null && 'code' in data
          ? data.code
          : undefined;
      setError(
        code === 'EXPORT_LIMIT'
          ? 'This selection exceeds the configured export limit. Select fewer records and try again.'
          : status === 403 || status === 404
            ? 'Export access or selected records are unavailable. Refresh records and check your dataset permissions.'
            : status === 400
              ? 'This selection could not be exported. Refresh records, select fewer rows and try again.'
              : 'Unable to download CSV. Check your connection and try again.',
      );
    } finally {
      pending.current = null;
      if (active.current) reset();
    }
  }
  return (
    <div className="space-y-2" aria-busy={isLoading}>
      <Button
        variant="outline"
        disabled={isLoading || recordIds.length === 0}
        onClick={() => {
          void download();
        }}
      >
        {isLoading ? 'Preparing CSV...' : 'Export selected'}
      </Button>
      {error && (
        <p role="alert" className="max-w-lg text-sm text-destructive">
          {error}
        </p>
      )}
      <p role="status" className="text-sm text-muted-foreground">
        {isLoading ? 'Preparing selected records for download...' : message}
      </p>
    </div>
  );
}
