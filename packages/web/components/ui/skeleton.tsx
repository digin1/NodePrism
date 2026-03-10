import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-xl border border-border/30 bg-[linear-gradient(90deg,rgba(67,77,92,0.48),rgba(95,214,255,0.12),rgba(67,77,92,0.48))]',
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
