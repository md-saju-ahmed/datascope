'use client';
import { useState } from 'react';
import type { RecordDetail, DatasetField } from '@datascope/contracts';
import { Button } from '@/components/ui/button';
import { displayValue } from '@/features/datasets/data-state';

function LongValue({ value }: { value: unknown }) {
  const [length, setLength] = useState(2000);
  const text = displayValue(value);
  return (
    <>
      <pre className="max-w-full whitespace-pre-wrap break-words font-sans text-sm [overflow-wrap:anywhere]">
        {text.slice(0, length)}
      </pre>
      {text.length > length && (
        <Button
          variant="outline"
          onClick={() => {
            setLength(length + 4000);
          }}
        >
          Show more ({text.length - length} characters remaining)
        </Button>
      )}
    </>
  );
}
function Attributes({ value }: { value: Record<string, unknown> }) {
  const [page, setPage] = useState(1);
  const keys = Object.keys(value);
  return (
    <div className="space-y-4">
      {!keys.length && (
        <p className="text-sm text-muted-foreground">
          No additional attributes.
        </p>
      )}
      {keys.slice((page - 1) * 25, page * 25).map((key) => (
        <details
          key={key}
          className="min-w-0 rounded-md border border-border p-3"
        >
          <summary className="cursor-pointer break-words text-sm font-medium">
            {key}
          </summary>
          <ExpandedAttribute value={value[key]} />
        </details>
      ))}
      {keys.length > 25 && (
        <nav
          aria-label="Attribute pages"
          className="flex flex-wrap items-center gap-3"
        >
          <Button
            variant="outline"
            disabled={page === 1}
            onClick={() => {
              setPage(page - 1);
            }}
          >
            Previous attributes
          </Button>
          <span className="text-sm">
            Page {page} of {Math.ceil(keys.length / 25)}
          </span>
          <Button
            variant="outline"
            disabled={page * 25 >= keys.length}
            onClick={() => {
              setPage(page + 1);
            }}
          >
            Next attributes
          </Button>
        </nav>
      )}
    </div>
  );
}
function ExpandedAttribute({ value }: { value: unknown }) {
  // Values are formatted only when their disclosure is opened.
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 min-w-0">
      {open ? (
        <LongValue value={value} />
      ) : (
        <Button
          variant="ghost"
          onClick={() => {
            setOpen(true);
          }}
        >
          Show value
        </Button>
      )}
    </div>
  );
}
export function RecordFields({
  record,
  fields = [],
}: {
  record: RecordDetail;
  fields?: DatasetField[];
}) {
  return (
    <dl className="min-w-0 space-y-4">
      {Object.entries(record)
        .filter(([key]) => key !== 'attributes')
        .map(([key, value]) => (
          <div key={key} className="min-w-0 border-b border-border pb-4">
            <dt className="text-xs font-semibold tracking-wide text-muted-foreground">
              {fields.find((f) => f.fieldKey === key)?.label ?? key}
              {['createdAt', 'updatedAt'].includes(key) ? ' (UTC)' : ''}
            </dt>
            <dd className="mt-2 min-w-0">
              <LongValue value={value} />
            </dd>
          </div>
        ))}
      <div className="min-w-0">
        <dt className="mb-3 font-semibold">Additional attributes</dt>
        <dd>
          <Attributes value={record.attributes} />
        </dd>
      </div>
    </dl>
  );
}
