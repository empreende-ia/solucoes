import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Template, PricingInfo } from '../types';

interface WizardHeaderProps {
  step: number;
  selectedTemplate?: Template;
  recipientCount: number;
  pricing: PricingInfo;
  pricePerMessage: string;
  onGoBack: () => void;
}

export const WizardHeader: React.FC<WizardHeaderProps> = ({
  step,
  selectedTemplate,
  recipientCount,
  pricing,
  pricePerMessage,
  onGoBack,
}) => {
  return (
    <>
      {/* Title */}
      <div className="shrink-0">
        <div className="flex items-center gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onGoBack}
                aria-label="Voltar"
                className="h-8 w-8 border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)]"
              >
                <ChevronLeft size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6} className="hidden md:block">
              Voltar
            </TooltipContent>
          </Tooltip>

          <h1 className="text-3xl font-bold text-[var(--ds-text-primary)] tracking-tight flex items-center gap-3">
            Criar Campanha{' '}
            <span className="text-sm font-normal text-[var(--ds-text-muted)] bg-[var(--ds-bg-elevated)] px-3 py-1 rounded-full border border-[var(--ds-border-default)]">
              Rascunho
            </span>
          </h1>
        </div>
      </div>

      {/* Cost Info */}
      <div className="text-right hidden md:block shrink-0 min-w-30">
        {step === 1 && selectedTemplate ? (
          <>
            <p className="text-xs text-[var(--ds-text-muted)]">Custo Base</p>
            <p className="text-xl font-bold text-primary-400">{pricePerMessage}/msg</p>
            <p className="text-[10px] text-[var(--ds-text-muted)] mt-1">{selectedTemplate.category}</p>
          </>
        ) : recipientCount > 0 && selectedTemplate ? (
          <>
            <p className="text-xs text-[var(--ds-text-muted)]">Custo Estimado</p>
            <p className="text-xl font-bold text-primary-400">{pricing.totalBRLFormatted}</p>
            <p className="text-[10px] text-[var(--ds-text-muted)] mt-1">
              {pricing.pricePerMessageBRLFormatted}/msg • {selectedTemplate.category}
            </p>
          </>
        ) : (
          <>
            <p className="text-xs text-[var(--ds-text-muted)]">Custo Estimado</p>
            <p className="text-xl font-bold text-[var(--ds-text-muted)]">-</p>
          </>
        )}
      </div>
    </>
  );
};
