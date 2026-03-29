import React from 'react';

interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  width?: string;
  sortable?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  compact?: boolean;
}

export function DataTable<T extends { id?: string }>({
  columns,
  data,
  onRowClick,
  emptyMessage = 'No data found',
  compact = false,
}: DataTableProps<T>) {
  return (
    <div className="overflow-x-auto admin-scrollbar">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-admin-border">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`${compact ? 'px-3 py-2' : 'px-4 py-3'} text-xs font-semibold uppercase tracking-wider text-admin-text-dim
                  ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}
                  ${col.sortable ? 'cursor-pointer hover:text-admin-text-muted select-none' : ''}
                `}
                style={col.width ? { width: col.width } : undefined}
              >
                <span className="inline-flex items-center gap-1">
                  {col.header}
                  {col.sortable && (
                    <svg className="w-3 h-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                    </svg>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="text-center py-12 text-admin-text-dim">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, idx) => (
              <tr
                key={(row as any).id || idx}
                onClick={() => onRowClick?.(row)}
                className={`admin-table-row border-b border-admin-border/50 transition-colors
                  ${onRowClick ? 'cursor-pointer' : ''}
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
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
