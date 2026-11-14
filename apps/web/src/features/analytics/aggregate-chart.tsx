'use client';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { chartRows, countText, type Bucket } from './presentation';

export default function AggregateChart({
  rows,
  temporal,
  title,
}: {
  rows: Bucket[];
  temporal: boolean;
  title: string;
}) {
  const data = chartRows(rows);
  if (!data)
    return (
      <p className="text-sm text-muted-foreground">
        Counts exceed chart precision. Exact values are available in the data
        table.
      </p>
    );
  const horizontal = !temporal && data.length > 15;
  const axes = (
    <>
      <CartesianGrid stroke="var(--border)" vertical={false} />
      <XAxis
        dataKey={horizontal ? 'count' : 'label'}
        type={horizontal ? 'number' : 'category'}
        allowDecimals={false}
        tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
        minTickGap={24}
        tickFormatter={(value: string | number) =>
          String(value).length > 14
            ? `${String(value).slice(0, 13)}…`
            : String(value)
        }
      />
      <YAxis
        type={horizontal ? 'category' : 'number'}
        dataKey={horizontal ? 'label' : 'count'}
        allowDecimals={false}
        width={horizontal ? 115 : 60}
        tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
        tickFormatter={(value: string | number) =>
          horizontal
            ? String(value).slice(0, 18)
            : new Intl.NumberFormat('en-US', { notation: 'compact' }).format(
                Number(value),
              )
        }
      />
      <Tooltip
        formatter={(value) => [
          countText(String(value)),
          temporal ? 'Count per UTC day' : 'Count',
        ]}
        contentStyle={{
          background: 'var(--surface)',
          borderColor: 'var(--border)',
          color: 'var(--foreground)',
        }}
      />
    </>
  );
  return (
    <div
      className="max-h-96 min-w-0 overflow-y-auto"
      aria-label={`${title} chart`}
    >
      <div
        style={{ height: horizontal ? Math.max(256, data.length * 30) : 256 }}
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          {temporal ? (
            <LineChart
              data={data}
              accessibilityLayer
              title={title}
              margin={{ top: 12, right: 12, bottom: 12 }}
            >
              {axes}
              <Line
                name="Count"
                type="linear"
                dataKey="count"
                stroke="var(--primary)"
                strokeWidth={2}
                dot={data.length < 32}
                isAnimationActive={false}
              />
            </LineChart>
          ) : (
            <BarChart
              data={data}
              layout={horizontal ? 'vertical' : 'horizontal'}
              accessibilityLayer
              title={title}
              margin={{ top: 12, right: 12, bottom: 12 }}
            >
              {axes}
              <Bar
                name="Count"
                dataKey="count"
                fill="var(--primary)"
                maxBarSize={56}
                isAnimationActive={false}
              />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
