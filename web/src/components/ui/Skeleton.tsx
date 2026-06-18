import { cn } from '../../lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-surface-raised', className)} />
}

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 space-y-3">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-7 w-40" />
      {rows > 2 && <Skeleton className="h-4 w-16" />}
    </div>
  )
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 py-3 border-b border-border">
      <Skeleton className="h-10 w-10 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-32" />
      </div>
      <Skeleton className="h-6 w-20" />
    </div>
  )
}
