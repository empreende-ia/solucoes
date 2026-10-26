import React from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme, type ThemeMode } from '@/hooks/useTheme';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const OPTIONS: Array<{ mode: ThemeMode; label: string; Icon: typeof Sun }> = [
  { mode: 'light', label: 'Tema claro', Icon: Sun },
  { mode: 'dark', label: 'Tema escuro', Icon: Moon },
  { mode: 'system', label: 'Acompanhar o sistema', Icon: Monitor },
];

/**
 * Seletor de tema em três estados. Segmentado em vez de botão que alterna:
 * 'sistema' é um estado próprio e precisa ser visível — com um botão de
 * alternância o operador não tem como saber (nem voltar) pra ele.
 *
 * `compact` empilha na vertical: os três segmentos lado a lado não cabem
 * nos 76px da sidebar recolhida.
 */
const ThemeToggle: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { mode, setMode } = useTheme();

  return (
    <TooltipProvider delayDuration={300}>
      <div
        role="radiogroup"
        aria-label="Tema da interface"
        className={`inline-flex items-center gap-0.5 border border-sidebar-border bg-sidebar-accent/40 p-0.5 ${
          compact ? 'flex-col rounded-full' : 'rounded-full'
        }`}
      >
        {OPTIONS.map(({ mode: value, label, Icon }) => {
          const active = mode === value;
          return (
            <Tooltip key={value}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={label}
                  onClick={() => setMode(value)}
                  className={`flex items-center justify-center rounded-full transition-colors ${
                    compact ? 'h-6 w-6' : 'h-7 w-7'
                  } ${
                    active
                      ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent'
                  }`}
                >
                  <Icon className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <span className="text-xs">{label}</span>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
};

export default ThemeToggle;
