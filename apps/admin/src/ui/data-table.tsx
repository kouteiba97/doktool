'use client';

import * as RadixMenu from '@radix-ui/react-dropdown-menu';
import {
  columnVisibilityFeature,
  createColumnHelper,
  createSortedRowModel,
  type RowData,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, Check, Columns3, Inbox } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useMemo } from 'react';
import { useI18n } from '@/i18n/i18n-provider';
import { Button } from './button';
import { EmptyState } from './feedback';

/** One column of a DataTable: header, how to draw a cell, optional sort value. */
export interface Column<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Makes the column sortable by this value. */
  sortValue?: (row: T) => string | number | null;
  align?: 'start' | 'end';
  /** Can be hidden from the column chooser (non-essential columns, 1024–1439 px). */
  hideable?: boolean;
}

/** What a table shows and what a click on a row does. */
interface DataTableProps<T> {
  label: string;
  columns: Column<T>[];
  rows: T[];
  rowId: (row: T) => string;
  loading?: boolean;
  empty?: ReactNode;
  selectedId?: string | null;
  onOpen?: (row: T) => void;
  /** Toolbar content shown at the start of the table header bar (filters, search). */
  toolbar?: ReactNode;
}

/** TanStack Table features used: sorting and column visibility. */
const features = tableFeatures({
  rowSortingFeature,
  columnVisibilityFeature,
  sortedRowModel: createSortedRowModel(),
});

const LOADING_ROWS = 5;

/**
 * True when an event on a row started on a control inside it (a « Traiter » button, a link): the
 * control acts alone and the row does not open.
 */
function fromControl(event: { target: EventTarget; currentTarget: EventTarget }): boolean {
  return (
    event.target instanceof Element &&
    event.target !== event.currentTarget &&
    event.target.closest('button, a, input, select, textarea, [role="menuitem"]') !== null
  );
}

/**
 * The console's primary element (component DataTable): dense 36 px rows, sticky header, sort,
 * column chooser; a row opens the drawer, ↑/↓ move between records.
 */
export function DataTable<T extends RowData>({
  label,
  columns,
  rows,
  rowId,
  loading,
  empty,
  selectedId,
  onOpen,
  toolbar,
}: DataTableProps<T>) {
  const { t } = useI18n();
  const definitions = useMemo(() => {
    const helper = createColumnHelper<typeof features, T>();
    return columns.map((column) =>
      helper.accessor((row: T): unknown => (column.sortValue ? column.sortValue(row) : null), {
        id: column.id,
        header: column.header,
        cell: (context) => column.cell(context.row.original),
        enableSorting: column.sortValue !== undefined,
        enableHiding: column.hideable === true,
        sortUndefined: 'last',
      }),
    );
  }, [columns]);
  const byId = useMemo(() => new Map(columns.map((column) => [column.id, column])), [columns]);
  const table = useTable({
    features,
    columns: definitions,
    data: rows,
    getRowId: (row) => rowId(row),
  });
  const hideable = table.getAllLeafColumns().filter((column) => column.getCanHide());
  const visibleCount = table.getVisibleLeafColumns().length;
  const models = table.getRowModel().rows;

  // Keyboard on a row: Enter or Space opens it, ↑/↓ move to the next row (and follow with the open
  // drawer).
  const onRowKey = (event: KeyboardEvent<HTMLTableRowElement>, index: number) => {
    if (fromControl(event)) return;
    const target =
      event.key === 'ArrowDown' ? index + 1 : event.key === 'ArrowUp' ? index - 1 : null;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const row = models[index];
      if (row) onOpen?.(row.original);
      return;
    }
    if (target === null || target < 0 || target >= models.length) return;
    event.preventDefault();
    const rowElement = event.currentTarget.parentElement?.children[target];
    if (rowElement instanceof HTMLElement) rowElement.focus();
    const row = models[target];
    if (selectedId && row) onOpen?.(row.original);
  };

  return (
    <div className="dt-stack">
      {toolbar || hideable.length > 0 ? (
        <div className="flex items-center gap-2">
          <div className="dt-row-flex min-w-0 flex-1">{toolbar}</div>
          {hideable.length > 0 ? (
            <RadixMenu.Root>
              <RadixMenu.Trigger asChild>
                {/* « Colonnes »: chooses which optional columns are shown. */}
                <Button size="sm" variant="secondary">
                  <Columns3 size={14} aria-hidden />
                  {t('admin.table.columns')}
                </Button>
              </RadixMenu.Trigger>
              <RadixMenu.Portal>
                <RadixMenu.Content className="dt-menu" align="end" sideOffset={4}>
                  {hideable.map((column) => (
                    <RadixMenu.CheckboxItem
                      key={column.id}
                      className="it"
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) => column.toggleVisibility(value === true)}
                      onSelect={(event) => event.preventDefault()}
                    >
                      <span className="inline-flex w-4" aria-hidden>
                        {column.getIsVisible() ? <Check size={14} /> : null}
                      </span>
                      {byId.get(column.id)?.header}
                    </RadixMenu.CheckboxItem>
                  ))}
                </RadixMenu.Content>
              </RadixMenu.Portal>
            </RadixMenu.Root>
          ) : null}
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="dt-table" aria-label={label} aria-busy={loading || undefined}>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const column = byId.get(header.column.id);
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      className={column?.align === 'end' ? 'r' : undefined}
                      aria-sort={
                        sorted === 'asc'
                          ? 'ascending'
                          : sorted === 'desc'
                            ? 'descending'
                            : undefined
                      }
                    >
                      {header.column.getCanSort() ? (
                        // Header button: sorts by this column (ascending, descending, none).
                        <button type="button" onClick={header.column.getToggleSortingHandler()}>
                          {column?.header}
                          {sorted === 'asc' ? (
                            <ArrowUp size={12} aria-hidden />
                          ) : sorted === 'desc' ? (
                            <ArrowDown size={12} aria-hidden />
                          ) : null}
                        </button>
                      ) : (
                        column?.header
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: LOADING_ROWS }, (_, index) => (
                  <tr key={index} aria-hidden>
                    {table.getVisibleLeafColumns().map((column) => (
                      <td key={column.id}>
                        <div className="dt-skeleton" />
                      </td>
                    ))}
                  </tr>
                ))
              : models.map((row, index) => (
                  <tr
                    key={row.id}
                    tabIndex={onOpen ? 0 : undefined}
                    data-clickable={onOpen ? 'true' : undefined}
                    aria-selected={selectedId === row.id || undefined}
                    onClick={
                      onOpen
                        ? (event) => {
                            if (!fromControl(event)) onOpen(row.original);
                          }
                        : undefined
                    }
                    onKeyDown={onOpen ? (event) => onRowKey(event, index) : undefined}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className={byId.get(cell.column.id)?.align === 'end' ? 'r' : undefined}
                      >
                        {byId.get(cell.column.id)?.cell(row.original)}
                      </td>
                    ))}
                  </tr>
                ))}
            {!loading && models.length === 0 ? (
              <tr>
                <td colSpan={visibleCount}>
                  {empty ?? <EmptyState icon={Inbox} title={t('admin.table.empty')} />}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
