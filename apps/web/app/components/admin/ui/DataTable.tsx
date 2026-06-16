import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

type SortDirection = 'asc' | 'desc';
type SortValue = string | number | Date | null | undefined;

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  width?: string;
  sortable?: boolean;
  sortValue?: (row: T) => SortValue;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  getRowKey?: (row: T) => React.Key;
  emptyMessage?: string;
  compact?: boolean;
}

function compareValues(a: SortValue, b: SortValue): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;

  const left = a instanceof Date ? a.getTime() : a;
  const right = b instanceof Date ? b.getTime() : b;

  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }

  return String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

export function DataTable<T extends { id?: React.Key }>({
  columns,
  data,
  onRowClick,
  getRowKey,
  emptyMessage = 'No data found',
  compact = false,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; direction: SortDirection } | null>(null);

  const sortedData = useMemo(() => {
    if (!sort) return data;

    const column = columns.find((candidate) => candidate.key === sort.key);
    if (!column?.sortable) return data;

    return [...data].sort((a, b) => {
      const left = column.sortValue ? column.sortValue(a) : (a as Record<string, SortValue>)[column.key];
      const right = column.sortValue ? column.sortValue(b) : (b as Record<string, SortValue>)[column.key];
      const comparison = compareValues(left, right);
      return sort.direction === 'asc' ? comparison : -comparison;
    });
  }, [columns, data, sort]);

  const toggleSort = (key: string) => {
    setSort((current) => {
      if (current?.key !== key) return { key, direction: 'asc' };
      return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
    });
  };

  return (
    <div className="overflow-x-auto admin-scrollbar">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-admin-border">
            {columns.map((col) => {
              const isSorted = sort?.key === col.key;
              const SortIcon = !isSorted ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;

              return (
                <th
                  key={col.key}
                  aria-sort={isSorted ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={`${compact ? 'px-3 py-2' : 'px-4 py-3'} text-xs font-semibold uppercase tracking-wider text-admin-text-dim
                    ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}
                  `}
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className={`inline-flex items-center gap-1 hover:text-admin-text select-none ${
                        col.align === 'right' ? 'ml-auto' : col.align === 'center' ? 'mx-auto' : ''
                      }`}
                    >
                      {col.header}
                      <SortIcon className={`w-3 h-3 ${isSorted ? 'opacity-100' : 'opacity-40'}`} aria-hidden="true" />
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedData.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="text-center py-12 text-admin-text-dim">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            sortedData.map((row, idx) => {
              const rowKey = getRowKey?.(row) ?? row.id ?? `row-${idx}`;
              return (
                <tr
                  key={rowKey}
                  onClick={() => onRowClick?.(row)}
                  onKeyDown={(event) => {
                    if (onRowClick && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault();
                      onRowClick(row);
                    }
                  }}
                  tabIndex={onRowClick ? 0 : undefined}
                  className={`admin-table-row border-b border-admin-border/50 transition-colors
                    ${onRowClick ? 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/60' : ''}
                  `}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`${compact ? 'px-3 py-2' : 'px-4 py-3'} text-admin-text
                        ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}
                      `}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
