import { type ReactNode } from 'react'
import { SkeletonRow } from './Skeleton'
import { cn } from '../../lib/utils'

export interface Column<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  align?: 'left' | 'right' | 'center'
  className?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  loading?: boolean
  onRowClick?: (row: T) => void
  emptyState?: ReactNode
}

// DataTable is a minimal, accessible table. It handles loading (skeleton rows)
// and empty states; sorting/pagination can be layered on later.
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  onRowClick,
  emptyState,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-surface p-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    )
  }

  if (rows.length === 0 && emptyState) {
    return <div className="rounded-xl border border-border bg-surface">{emptyState}</div>
  }

  const alignClass = (a?: 'left' | 'right' | 'center') =>
    a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left'

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn(
                  'px-4 py-3 font-medium text-text-secondary',
                  alignClass(col.align),
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                'border-b border-border last:border-0',
                onRowClick && 'cursor-pointer hover:bg-surface-raised',
              )}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn('px-4 py-3 text-text', alignClass(col.align), col.className)}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
