import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-primary/20 bg-primary/15 text-primary hover:bg-primary/20',
        secondary: 'border-border bg-secondary/70 text-secondary-foreground hover:bg-secondary/90',
        destructive:
          'border-destructive/25 bg-destructive/15 text-destructive hover:bg-destructive/20',
        outline: 'bg-transparent text-foreground',
        success: 'border-emerald-500/25 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/20',
        warning: 'border-amber-500/25 bg-amber-500/15 text-amber-300 hover:bg-amber-500/20',
        danger: 'border-red-500/25 bg-red-500/15 text-red-400 hover:bg-red-500/20',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
