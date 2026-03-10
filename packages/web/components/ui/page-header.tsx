import * as React from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}

export function PageHeader({ eyebrow, title, description, children, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'monitor-panel flex flex-col gap-5 rounded-[1.5rem] p-6 lg:flex-row lg:items-end lg:justify-between',
        className
      )}
    >
      <div className="max-w-3xl">
        {eyebrow && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-primary">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{title}</h1>
        {description && (
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">{description}</p>
        )}
      </div>
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </div>
  );
}

interface SummaryStatProps {
  label: string;
  value: React.ReactNode;
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
}

const toneMap = {
  default: 'text-foreground',
  primary: 'text-primary',
  success: 'text-emerald-400',
  warning: 'text-amber-300',
  danger: 'text-red-400',
};

export function SummaryStat({ label, value, tone = 'default' }: SummaryStatProps) {
  return (
    <div className="monitor-panel rounded-[1.25rem] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
        {label}
      </p>
      <div className={cn('metric-text mt-2 text-3xl font-semibold', toneMap[tone])}>{value}</div>
    </div>
  );
}
