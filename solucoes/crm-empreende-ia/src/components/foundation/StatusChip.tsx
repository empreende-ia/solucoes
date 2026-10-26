import React from 'react';
import { cn } from '@/lib/utils';

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'brand';

const TONES: Record<StatusTone, string> = {
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-destructive/10 text-destructive',
  info: 'bg-primary/10 text-primary',
  neutral: 'bg-muted text-muted-foreground',
  brand: 'bg-accent/10 text-accent',
};

interface StatusChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone;
  /** Ponto colorido à esquerda (padrão: true) */
  dot?: boolean;
}

/** Chip de status semântico — única forma permitida de badge de status no app. */
export const StatusChip: React.FC<StatusChipProps> = ({
  tone = 'neutral',
  dot = true,
  className,
  children,
  ...props
}) => (
  <span
    className={cn(
      'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium',
      TONES[tone],
      className
    )}
    {...props}
  >
    {dot && <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-80" />}
    {children}
  </span>
);

export default StatusChip;
