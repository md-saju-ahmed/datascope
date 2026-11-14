'use client';
import { useId } from 'react';
import type { DatasetField, SearchCondition } from '@datascope/contracts';
import { Button } from '@/components/ui/button';
import {
  conditionError,
  lastThirtyDays,
  utcInput,
  utcValue,
} from './query-validation';

const operatorNames: Record<SearchCondition['op'], string> = {
  eq: 'equals (exact)',
  neq: 'does not equal',
  contains: 'contains (partial)',
  gt: 'greater than',
  gte: 'at least',
  lt: 'less than',
  lte: 'at most',
  between: 'between (inclusive)',
  in: 'is one of',
};
export const controlClass =
  'min-h-11 w-full min-w-0 rounded-md border border-border bg-surface px-3 py-2 text-sm';
export function ConditionEditor({
  fields,
  conditions,
  change,
  basic = false,
}: {
  fields: DatasetField[];
  conditions: SearchCondition[];
  change: (conditions: SearchCondition[]) => void;
  basic?: boolean;
}) {
  const id = useId();
  const available = fields.filter(
    (f) =>
      f.isVisible &&
      f.isFilterable &&
      (!basic || ['status', 'country', 'category'].includes(f.fieldKey)),
  );
  const update = (index: number, condition: SearchCondition) => {
    change(conditions.map((c, i) => (i === index ? condition : c)));
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        All conditions must match (AND). Enter literal values; choices are not
        an exhaustive value list. Numeric and UTC date ranges include both
        endpoints.
      </p>
      {conditions.map((condition, index) => {
        const field = available.find((f) => f.fieldKey === condition.field);
        const error = conditionError(condition, fields);
        const operators =
          field?.operators.filter(
            (op) => !basic || ['eq', 'in'].includes(op),
          ) ?? [];
        const values = Array.isArray(condition.value)
          ? condition.value
          : [condition.value];
        return (
          <fieldset
            key={index}
            className="min-w-0 space-y-3 rounded-lg border border-border p-4"
          >
            <legend className="px-1 text-sm font-semibold">
              Condition {index + 1}
              {index > 0 ? ' · AND' : ''}
            </legend>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <label className="min-w-0 text-sm">
                Field {index + 1}
                <select
                  aria-label={`Field ${String(index + 1)}`}
                  className={controlClass}
                  value={condition.field}
                  onChange={(e) => {
                    const next = available.find(
                      (f) => f.fieldKey === e.target.value,
                    );
                    if (next)
                      update(index, {
                        field: next.fieldKey,
                        op:
                          next.operators.find(
                            (op) => !basic || ['eq', 'in'].includes(op),
                          ) ?? 'eq',
                        value: next.dataType === 'boolean' ? false : '',
                      });
                  }}
                >
                  {available.map((f) => (
                    <option key={f.fieldKey} value={f.fieldKey}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="min-w-0 text-sm">
                Operator {index + 1}
                <select
                  aria-label={`Operator ${String(index + 1)}`}
                  className={controlClass}
                  value={condition.op}
                  onChange={(e) => {
                    const op = operators.find(
                      (value) => value === e.target.value,
                    );
                    if (op)
                      update(index, {
                        ...condition,
                        op,
                        value:
                          op === 'between'
                            ? [values[0] ?? '', values[1] ?? '']
                            : op === 'in'
                              ? values
                              : (values[0] ?? ''),
                      });
                  }}
                >
                  {operators.map((op) => (
                    <option key={op} value={op}>
                      {operatorNames[op]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {condition.op === 'in' && field?.dataType === 'boolean' ? (
              <fieldset className="space-y-2">
                <legend className="text-sm">Values {index + 1}</legend>
                {[true, false].map((value) => (
                  <label
                    key={String(value)}
                    className="flex min-h-11 items-center gap-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={values.includes(value)}
                      onChange={() => {
                        update(index, {
                          ...condition,
                          value: values.includes(value)
                            ? values.filter((v) => v !== value)
                            : [...values, value],
                        });
                      }}
                    />
                    {value ? 'True' : 'False'}
                  </label>
                ))}
              </fieldset>
            ) : condition.op === 'in' ? (
              <label className="block text-sm">
                Values {index + 1} (one per line)
                <textarea
                  aria-label={`Values ${String(index + 1)} (one per line)`}
                  className={controlClass}
                  rows={3}
                  value={values.join('\n')}
                  aria-invalid={!!error}
                  aria-describedby={`${id}-${String(index)}-error`}
                  onChange={(e) => {
                    update(index, {
                      ...condition,
                      value: e.target.value.split('\n'),
                    });
                  }}
                />
              </label>
            ) : (
              (condition.op === 'between' ? [0, 1] : [0]).map((position) => (
                <label key={position} className="block text-sm">
                  {condition.op === 'between'
                    ? position === 0
                      ? 'From'
                      : 'To'
                    : 'Value'}{' '}
                  {index + 1}
                  {field?.dataType === 'date' ? ' (UTC)' : ''}
                  {field?.dataType === 'boolean' ? (
                    <select
                      aria-label={`Value ${String(index + 1)}`}
                      className={controlClass}
                      value={String(values[position])}
                      onChange={(e) => {
                        update(index, {
                          ...condition,
                          value: e.target.value === 'true',
                        });
                      }}
                    >
                      <option value="false">False</option>
                      <option value="true">True</option>
                    </select>
                  ) : (
                    <input
                      aria-label={`${condition.op === 'between' ? (position === 0 ? 'From' : 'To') : 'Value'} ${String(index + 1)}${field?.dataType === 'date' ? ' (UTC)' : ''}`}
                      className={controlClass}
                      type={
                        field?.dataType === 'date' ? 'datetime-local' : 'text'
                      }
                      step={field?.dataType === 'date' ? '0.001' : undefined}
                      inputMode={
                        field?.dataType === 'number' ? 'decimal' : undefined
                      }
                      value={
                        field?.dataType === 'date'
                          ? utcInput(String(values[position] ?? ''))
                          : String(values[position] ?? '')
                      }
                      aria-invalid={!!error}
                      aria-describedby={`${id}-${String(index)}-error`}
                      onChange={(e) => {
                        const value =
                          field?.dataType === 'date'
                            ? utcValue(e.target.value)
                            : e.target.value;
                        update(index, {
                          ...condition,
                          value:
                            condition.op === 'between'
                              ? values.map((v, i) =>
                                  i === position ? value : v,
                                )
                              : value,
                        });
                      }}
                    />
                  )}
                </label>
              ))
            )}
            {field?.dataType === 'date' && operators.includes('between') && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  update(index, {
                    ...condition,
                    op: 'between',
                    value: lastThirtyDays(),
                  });
                }}
              >
                Last 30 days (UTC)
              </Button>
            )}
            {error && (
              <p
                id={`${id}-${String(index)}-error`}
                className="text-sm text-destructive"
              >
                {error}
              </p>
            )}
            <Button
              type="button"
              variant="ghost"
              aria-label={`Remove condition ${String(index + 1)}`}
              onClick={() => {
                change(conditions.filter((_, i) => i !== index));
              }}
            >
              Remove condition
            </Button>
          </fieldset>
        );
      })}
      <Button
        type="button"
        variant="outline"
        disabled={conditions.length >= 12 || !available.length}
        onClick={() => {
          const field = available[0];
          if (field)
            change([
              ...conditions,
              {
                field: field.fieldKey,
                op:
                  field.operators.find(
                    (op) => !basic || ['eq', 'in'].includes(op),
                  ) ?? 'eq',
                value: field.dataType === 'boolean' ? false : '',
              },
            ]);
        }}
      >
        Add condition
      </Button>
    </div>
  );
}
