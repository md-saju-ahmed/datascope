'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useRef, useState } from 'react';
import type { DatasetField, SearchRequest } from '@datascope/contracts';
import { Button } from '@/components/ui/button';
import { useAppDispatch, useAppSelector, useAppStore } from '@/store/hooks';
import { searchApi } from '@/store/api/search-api';
import { searchConfigSlice } from '@/store/slices/search-config-slice';
import { ConditionEditor, controlClass } from './condition-editor';
import { conditionError, queryConfig } from './query-validation';
import { readExplorerQuery, writeExplorerQuery } from './url-state';

export function SearchControls({
  datasetId,
  fields,
  query,
  advanced,
  initialAdvanced,
  change,
}: {
  datasetId: string;
  fields: DatasetField[];
  query: SearchRequest;
  advanced: boolean;
  initialAdvanced: boolean;
  change: (query: SearchRequest) => void;
}) {
  const dispatch = useAppDispatch(),
    store = useAppStore();
  const draft = useAppSelector((s) => s.searchConfig.draft);
  const [text, setText] = useState(query.q);
  const [open, setOpen] = useState(initialAdvanced && advanced);
  const [builderAdvanced, setBuilderAdvanced] = useState(
    initialAdvanced && advanced,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const serial = useRef(0);
  const scope = writeExplorerQuery(query);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const active = useRef<ReturnType<
    ReturnType<typeof searchApi.endpoints.executeSearch.initiate>
  > | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => {
    setText(query.q);
    dispatch(
      searchConfigSlice.actions.draftReplaced({
        datasetId,
        config: queryConfig(query),
      }),
    );
    serial.current++;
    active.current?.abort();
    setPending(false);
    return () => {
      serial.current++;
      if (timer.current) clearTimeout(timer.current);
      active.current?.abort();
    };
  }, [scope, datasetId, dispatch]); // URL is canonical; every navigation discards stale drafts/work.
  const apply = async (next: SearchRequest) => {
    cancelTimer();
    try {
      readExplorerQuery(writeExplorerQuery(next), fields);
    } catch {
      setError(
        'Correct the filter values or shorten the query to fit the 8,000-character URL limit.',
      );
      return;
    }
    const ticket = ++serial.current;
    active.current?.abort();
    const before = currentScope.current;
    setPending(true);
    setError('');
    const args = { datasetId, query: next };
    const request = dispatch(searchApi.endpoints.executeSearch.initiate(args));
    active.current = request;
    try {
      const data = await request.unwrap();
      if (
        ticket !== serial.current ||
        before !== currentScope.current ||
        searchApi.endpoints.executeSearch.select(request.requestId)(
          store.getState(),
        ).data !== data
      )
        return;
      await dispatch(
        searchApi.util.upsertQueryData('searchRecords', args, data),
      );
      if (
        ticket !== serial.current ||
        searchApi.endpoints.executeSearch.select(request.requestId)(
          store.getState(),
        ).data !== data
      )
        return;
      change(next);
      setOpen(false);
    } catch {
      if (ticket === serial.current)
        setError(
          'Search could not be applied. Check your access, values and connection, then try again.',
        );
    } finally {
      if (ticket === serial.current) setPending(false);
      request.reset();
    }
  };
  const reset = () => {
    setText('');
    void apply({ ...query, q: '', conditions: [], page: 1 });
  };
  const invalid = draft.conditions.some((c) => conditionError(c, fields));
  return (
    <section
      aria-label="Search controls"
      className="space-y-4 rounded-xl border border-border bg-surface p-4 sm:p-5"
    >
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void apply({ ...query, q: text.trim(), page: 1 });
        }}
      >
        <label
          className="min-w-0 flex-1 text-sm font-medium"
          htmlFor="global-search"
        >
          Search indexed fields
          <input
            id="global-search"
            className={`${controlClass} mt-2`}
            type="search"
            value={text}
            maxLength={200}
            aria-describedby="search-coverage"
            onChange={(event) => {
              const value = event.target.value;
              setText(value);
              cancelTimer();
              serial.current++;
              active.current?.abort();
              setPending(false);
              if (value.trim() !== query.q)
                timer.current = setTimeout(() => {
                  void apply({ ...query, q: value.trim(), page: 1 });
                }, 350);
            }}
          />
        </label>
        <Button type="submit" disabled={pending}>
          Apply search
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={reset}
          disabled={pending}
        >
          Clear all
        </Button>
      </form>
      <p id="search-coverage" className="text-xs text-muted-foreground">
        Full-text search over indexed text fields:{' '}
        {fields
          .filter(
            (f) => f.isSearchable && ['string', 'enum'].includes(f.dataType),
          )
          .map((f) => f.label)
          .join(', ')}
        . Text applies after 350 ms or Enter.
      </p>
      <Dialog.Root
        open={open}
        onOpenChange={(value) => {
          cancelTimer();
          dispatch(
            searchConfigSlice.actions.draftReplaced({
              datasetId,
              config: queryConfig(query),
            }),
          );
          setOpen(value);
        }}
      >
        <div className="flex flex-wrap gap-3">
          <Dialog.Trigger asChild>
            <Button
              variant="outline"
              onClick={() => {
                setBuilderAdvanced(false);
              }}
            >
              Basic filters
            </Button>
          </Dialog.Trigger>
          {advanced && (
            <Dialog.Trigger asChild>
              <Button
                variant="outline"
                onClick={() => {
                  setBuilderAdvanced(true);
                }}
              >
                Advanced builder
              </Button>
            </Dialog.Trigger>
          )}
        </div>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-foreground/40" />
          <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col overflow-y-auto bg-surface p-5 shadow-xl sm:p-6">
            <Dialog.Title className="text-xl font-semibold">
              {builderAdvanced ? 'Advanced filters' : 'Basic filters'}
            </Dialog.Title>
            <Dialog.Description className="my-3 text-sm text-muted-foreground">
              Draft changes stay unapplied until Apply filters. Cancel restores
              the current results.
            </Dialog.Description>
            <form
              className="min-w-0 space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                if (!invalid)
                  void apply({
                    ...query,
                    conditions: draft.conditions,
                    page: 1,
                  });
              }}
            >
              <ConditionEditor
                fields={fields}
                conditions={draft.conditions}
                basic={!builderAdvanced}
                change={(conditions) =>
                  dispatch(
                    searchConfigSlice.actions.draftReplaced({
                      datasetId,
                      config: { ...draft, conditions },
                    }),
                  )
                }
              />
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <div className="sticky bottom-0 flex flex-wrap gap-3 border-t border-border bg-surface py-4">
                <Button disabled={invalid || pending}>Apply filters</Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    dispatch(
                      searchConfigSlice.actions.draftReplaced({
                        datasetId,
                        config: queryConfig(query),
                      }),
                    )
                  }
                >
                  Reset draft
                </Button>
                <Dialog.Close asChild>
                  <Button type="button" variant="ghost">
                    Cancel
                  </Button>
                </Dialog.Close>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <div className="flex flex-wrap gap-2" aria-label="Applied filters">
        {query.q && (
          <Button
            variant="outline"
            aria-label="Remove search text"
            onClick={() => {
              setText('');
              void apply({ ...query, q: '', page: 1 });
            }}
          >
            Search: {query.q} ×
          </Button>
        )}
        {query.conditions.map((c, i) => (
          <Button
            key={JSON.stringify(c) + String(i)}
            variant="outline"
            className="h-auto max-w-full whitespace-normal break-words text-left"
            aria-label={`Remove filter ${String(i + 1)}`}
            onClick={() => {
              void apply({
                ...query,
                conditions: query.conditions.filter((_, index) => index !== i),
                page: 1,
              });
            }}
          >
            {fields.find((f) => f.fieldKey === c.field)?.label ?? c.field}{' '}
            {c.op}{' '}
            {Array.isArray(c.value) ? c.value.join(' – ') : String(c.value)} ×
          </Button>
        ))}
      </div>
      {pending && (
        <p role="status" className="text-sm text-muted-foreground">
          Applying search...
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
