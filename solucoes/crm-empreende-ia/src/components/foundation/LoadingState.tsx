import React from 'react';
import { cn } from '@/lib/utils';

interface LoadingStateProps {
  label?: string;
  className?: string;
}

/** Loading padrão: três pontos pulsando (nunca spinner solto). */
export const LoadingState: React.FC<LoadingStateProps> = ({ label = 'Carregando…', className }) => (
  <div className={cn('flex flex-col items-center justify-center gap-3 py-12', className)}>
    <div className="flex items-center gap-1.5" aria-hidden>
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="h-2 w-2 animate-pulse rounded-full bg-primary"
          style={{ animationDelay: `${i * 180}ms`, animationDuration: '900ms' }}
        />
      ))}
    </div>
    <p className="text-sm text-muted-foreground">{label}</p>
  </div>
);

export default LoadingState;
