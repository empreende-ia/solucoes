import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Panel } from './Panel';

export interface StatItem {
  label: string;
  value: React.ReactNode;
  /** Variação exibida como chip (ex.: "+12%") */
  delta?: string;
  deltaUp?: boolean;
  icon?: LucideIcon;
  hint?: string;
}

interface StatStripProps {
  stats: StatItem[];
  className?: string;
}

/** KPIs em um único painel com divisórias — substitui a grade de 4 cards soltos. */
export const StatStrip: React.FC<StatStripProps> = ({ stats, className }) => (
  <Panel className={cn('overflow-hidden', className)}>
    <div className="grid grid-cols-1 divide-y divide-border/60 sm:grid-cols-2 sm:divide-y-0 lg:flex">
      {stats.map((s, i) => {
        const Icon = s.icon;
        return (
          <div
            key={s.label}
            className={cn(
              'eia-stat flex-1 px-5 py-5',
              i > 0 && 'sm:border-l sm:border-border/60'
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="eia-stat-label truncate text-xs font-medium text-muted-foreground">{s.label}</span>
              {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground/60" />}
            </div>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="eia-stat-value text-2xl font-semibold tracking-tight text-foreground tabular-nums">{s.value}</span>
              {s.delta && (
                <span
                  className={cn(
                    'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium',
                    s.deltaUp ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
                  )}
                >
                  {s.deltaUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {s.delta}
                </span>
              )}
            </div>
            {s.hint && <p className="mt-1 truncate text-xs text-muted-foreground/70">{s.hint}</p>}
          </div>
        );
      })}
    </div>
  </Panel>
);

export default StatStrip;
