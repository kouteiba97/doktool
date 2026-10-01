'use client';

import { useSyncExternalStore } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

/** Series colours, in order (tokens: brand, teal, viz-3, viz-5; previous period is viz-4). */
export const SERIES_TOKENS = ['--brand', '--teal', '--viz-3', '--viz-5'] as const;
const PREVIOUS_TOKEN = '--viz-4';
const CHROME_TOKENS = ['--chart-grid', '--chart-axis', '--surface', '--border', '--ink'] as const;

export interface Series {
  key: string;
  label: string;
  /** Previous-period series: dashed `viz-4` (section 16). */
  previous?: boolean;
}

function readTokens(): Record<string, string> {
  const style = getComputedStyle(document.documentElement);
  return Object.fromEntries(
    [...SERIES_TOKENS, PREVIOUS_TOKEN, ...CHROME_TOKENS].map((name) => [
      name,
      style.getPropertyValue(name).trim(),
    ]),
  );
}

let cached: Record<string, string> | null = null;
const subscribe = () => () => undefined;
/** Token colours resolved once in the browser (SVG attributes cannot read CSS variables everywhere). */
function useTokens(): Record<string, string> | null {
  return useSyncExternalStore(
    subscribe,
    () => (cached ??= readTokens()),
    () => null,
  );
}

function colorOf(tokens: Record<string, string>, series: Series[], index: number): string {
  const item = series[index]!;
  if (item.previous) return tokens[PREVIOUS_TOKEN]!;
  const plain = series.slice(0, index).filter((entry) => !entry.previous).length;
  return tokens[SERIES_TOKENS[plain % SERIES_TOKENS.length]!]!;
}

interface ChartProps<T> {
  /** Accessible name; also the caption of the hidden data table. */
  label: string;
  data: T[];
  xKey: keyof T & string;
  series: Series[];
  formatX?: (value: string) => string;
  formatY?: (value: number) => string;
  /** Short labels for the value axis (e.g. « 23 k »); the tooltip and the table use `formatY`. */
  formatAxis?: (value: number) => string;
  height?: number;
}

/** The chart's data as a table for screen readers (every chart has one, section 16). */
function DataTableFallback<T>({ label, data, xKey, series, formatX, formatY }: ChartProps<T>) {
  return (
    <table className="sr-only">
      <caption>{label}</caption>
      <thead>
        <tr>
          <th scope="col">{xKey}</th>
          {series.map((item) => (
            <th key={item.key} scope="col">
              {item.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row, index) => {
          const record = row as Record<string, unknown>;
          return (
            <tr key={index}>
              <th scope="row">{formatX ? formatX(String(record[xKey])) : String(record[xKey])}</th>
              {series.map((item) => {
                const value = record[item.key];
                return (
                  <td key={item.key}>
                    {typeof value === 'number' ? (formatY ? formatY(value) : value) : '—'}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function axes<T>(tokens: Record<string, string>, props: ChartProps<T>) {
  const tick = { fill: tokens['--chart-axis'], fontSize: 12 };
  return [
    <CartesianGrid key="grid" stroke={tokens['--chart-grid']} vertical={false} />,
    <XAxis
      key="x"
      dataKey={String(props.xKey)}
      tick={tick}
      tickLine={false}
      axisLine={{ stroke: tokens['--chart-grid'] }}
      tickFormatter={props.formatX}
    />,
    <YAxis
      key="y"
      tick={tick}
      tickLine={false}
      axisLine={false}
      tickFormatter={props.formatAxis ?? props.formatY}
      width={72}
    />,
    <Tooltip
      key="tooltip"
      labelFormatter={(value) => (props.formatX ? props.formatX(String(value)) : String(value))}
      formatter={(value) =>
        typeof value === 'number' && props.formatY ? props.formatY(value) : String(value)
      }
      contentStyle={{
        background: tokens['--surface'],
        border: `1px solid ${tokens['--border']}`,
        color: tokens['--ink'],
      }}
    />,
    <Legend key="legend" wrapperStyle={{ fontSize: 12 }} />,
  ];
}

/** Bars only or lines only (section 07): no pies, no areas. */
export function BarSeriesChart<T>(props: ChartProps<T> & { stacked?: boolean }) {
  const tokens = useTokens();
  return (
    <figure aria-label={props.label} className="m-0">
      <div aria-hidden style={{ height: props.height ?? 240 }}>
        {tokens ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={props.data}>
              {axes(tokens, props)}
              {props.series.map((item, index) => (
                <Bar
                  key={item.key}
                  dataKey={item.key}
                  name={item.label}
                  fill={colorOf(tokens, props.series, index)}
                  stackId={props.stacked ? 'stack' : undefined}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        ) : null}
      </div>
      <DataTableFallback {...props} />
    </figure>
  );
}

export function LineSeriesChart<T>(props: ChartProps<T>) {
  const tokens = useTokens();
  return (
    <figure aria-label={props.label} className="m-0">
      <div aria-hidden style={{ height: props.height ?? 240 }}>
        {tokens ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={props.data}>
              {axes(tokens, props)}
              {props.series.map((item, index) => (
                <Line
                  key={item.key}
                  dataKey={item.key}
                  name={item.label}
                  stroke={colorOf(tokens, props.series, index)}
                  strokeWidth={2}
                  strokeDasharray={item.previous ? '6 4' : undefined}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : null}
      </div>
      <DataTableFallback {...props} />
    </figure>
  );
}
