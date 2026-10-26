import React from 'react';
import { Check } from 'lucide-react';
import type { WizardStep } from '../types';
import { WIZARD_STEPS } from '../types';

interface WizardStepperProps {
  currentStep: number;
  onStepClick: (step: number) => void;
}

export const WizardStepper: React.FC<WizardStepperProps> = ({
  currentStep,
  onStepClick,
}) => {
  return (
    <div className="flex items-center justify-between relative">
      <div
        className="absolute left-0 top-4 transform -translate-y-1/2 w-full h-0.5 bg-[var(--ds-border-default)] -z-10"
        aria-hidden="true"
      >
        <div
          className="h-full bg-primary-600 transition-all duration-500 ease-out"
          style={{ width: `${((currentStep - 1) / 2) * 100}%` }}
        />
      </div>
      {WIZARD_STEPS.map((s) => (
        <button
          type="button"
          key={s.number}
          className="flex flex-col items-center group"
          onClick={() => currentStep > s.number && onStepClick(s.number)}
          disabled={currentStep <= s.number}
          aria-current={currentStep === s.number ? 'step' : undefined}
          aria-label={`${s.title}${currentStep > s.number ? ' - concluído, clique para voltar' : currentStep === s.number ? ' - etapa atual' : ' - etapa futura'}`}
        >
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm mb-2 transition-all duration-300 border-2 ${currentStep >= s.number
              ? 'bg-[var(--ds-bg-base)] text-primary-400 border-primary-500 shadow-[0_0_15px_rgba(16,185,129,0.4)] scale-110'
              : 'bg-[var(--ds-bg-base)] text-[var(--ds-text-muted)] border-[var(--ds-border-default)] group-hover:border-[var(--ds-border-strong)]'
              }`}
            aria-hidden="true"
          >
            {currentStep > s.number ? <Check size={14} strokeWidth={3} /> : s.number}
          </div>
          <span className={`text-[10px] font-bold uppercase tracking-widest transition-colors ${currentStep >= s.number ? 'text-[var(--ds-text-primary)]' : 'text-[var(--ds-text-muted)]'}`}>
            {s.title}
          </span>
        </button>
      ))}
    </div>
  );
};
