import React from 'react';
import { cn } from '@/lib/utils';

interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Painel rebaixado (bg-muted) pra áreas de apoio/filtros internos */
  inset?: boolean;
}

/** Superfície padrão do app: material de vidro para agrupamentos e superfície densa para leitura. */
export const Panel = React.forwardRef<HTMLDivElement, PanelProps>(
  ({ inset = false, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'eia-panel rounded-xl border bg-card text-card-foreground',
        inset ? 'eia-panel-dense border-border/60' : 'border-border',
        className
      )}
      {...props}
    />
  )
);
Panel.displayName = 'Panel';

interface PanelHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const PanelHeader: React.FC<PanelHeaderProps> = ({ title, description, actions, className }) => (
  <div className={cn('flex items-start justify-between gap-3 border-b border-border/60 px-5 py-3.5', className)}>
    <div className="min-w-0">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description && <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>}
    </div>
    {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
  </div>
);

export const PanelBody: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn('px-5 py-4', className)} {...props} />
);

/** Label de seção fora do painel: ponto da marca + sentence case (nunca uppercase). */
export const SectionLabel: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, children, ...props }) => (
  <div
    className={cn('flex items-center gap-2 text-xs font-semibold text-muted-foreground', className)}
    {...props}
  >
    <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary" />
    {children}
  </div>
);
