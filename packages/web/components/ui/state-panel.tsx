import * as React from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

export function EmptyState({
  className,
  title,
  description,
  icon,
  action,
}: {
  className?: string;
  title: string;
  description: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'monitor-panel flex min-h-[220px] flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-border/70 px-6 py-10 text-center',
        className
      )}
    >
      {icon ? <div className="mb-4 text-muted-foreground">{icon}</div> : null}
      <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-foreground">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function LoadingState({
  rows = 4,
  className,
  rowClassName,
}: {
  rows?: number;
  className?: string;
  rowClassName?: string;
}) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className={cn('h-16 w-full rounded-[1rem]', rowClassName)} />
      ))}
    </div>
  );
}
