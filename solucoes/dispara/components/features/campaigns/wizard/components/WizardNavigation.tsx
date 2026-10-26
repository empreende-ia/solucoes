import React from 'react';
import { Calendar, ChevronLeft, ChevronRight, Zap } from 'lucide-react';
import type { ScheduleMode } from '../types';

interface WizardNavigationProps {
  step: number;
  isOverLimit: boolean;
  isCreating: boolean;
  scheduleMode: ScheduleMode;
  scheduledDate: string;
  scheduledTime: string;
  onBack: () => void;
  onNext: () => void;
  onSend: (scheduledAt?: string) => void;
  variant?: 'mobile' | 'desktop';
}

export const WizardNavigation: React.FC<WizardNavigationProps> = ({
  step,
  isOverLimit,
  isCreating,
  scheduleMode,
  scheduledDate,
  scheduledTime,
  onBack,
  onNext,
  onSend,
  variant = 'desktop',
}) => {
  const isMobile = variant === 'mobile';
  const containerClasses = isMobile
    ? `flex items-center p-6 border-t border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)] mt-auto lg:hidden ${step === 1 ? 'justify-center' : 'justify-between'}`
    : `mt-4 pt-4 border-t border-[var(--ds-border-subtle)] flex items-center gap-3 ${step === 1 ? 'justify-center' : 'justify-between'}`;

  const handleSendClick = () => {
    if (scheduleMode === 'scheduled' && scheduledDate && scheduledTime) {
      const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();
      onSend(scheduledAt);
    } else {
      onSend();
    }
  };

  const isScheduleDisabled = scheduleMode === 'scheduled' && (!scheduledDate || !scheduledTime);

  // Button size classes based on variant
  const backButtonClasses = isMobile
    ? 'px-6 py-3 rounded-xl text-[var(--ds-text-secondary)] font-medium hover:text-[var(--ds-text-primary)] transition-colors flex items-center gap-2 hover:bg-[var(--ds-bg-hover)]'
    : 'px-4 py-2 rounded-xl text-[var(--ds-text-secondary)] font-medium hover:text-[var(--ds-text-primary)] transition-colors flex items-center gap-2 hover:bg-[var(--ds-bg-hover)]';

  const continueButtonClasses = isMobile
    ? `group relative bg-primary-600 text-white dark:bg-white dark:text-black font-bold hover:bg-primary-500 dark:hover:bg-neutral-100 transition-all flex items-center gap-2 shadow-lg overflow-hidden ${step === 1 ? 'px-14 py-4 rounded-2xl text-lg min-w-65 justify-center' : 'px-8 py-3 rounded-xl'}`
    : `group relative bg-primary-600 text-white dark:bg-white dark:text-black font-bold hover:bg-primary-500 dark:hover:bg-neutral-100 transition-all flex items-center gap-2 shadow-lg overflow-hidden ${step === 1 ? 'px-10 py-4 rounded-2xl text-base min-w-60 justify-center' : 'px-6 py-2.5 rounded-xl'}`;

  const sendButtonClasses = isMobile
    ? `group relative px-10 py-3 rounded-xl ${scheduleMode === 'scheduled' ? 'bg-violet-600 hover:bg-violet-500 shadow-[0_0_20px_rgba(124,58,237,0.4)] hover:shadow-[0_0_40px_rgba(124,58,237,0.6)]' : 'bg-primary-600 hover:bg-primary-500 shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:shadow-[0_0_40px_rgba(16,185,129,0.6)]'} text-white font-bold transition-all flex items-center gap-2 hover:scale-105 ${isCreating || isScheduleDisabled ? 'opacity-70 cursor-not-allowed' : ''}`
    : `group relative px-7 py-2.5 rounded-xl ${scheduleMode === 'scheduled' ? 'bg-violet-600 hover:bg-violet-500 shadow-[0_0_20px_rgba(124,58,237,0.4)] hover:shadow-[0_0_40px_rgba(124,58,237,0.6)]' : 'bg-primary-600 hover:bg-primary-500 shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:shadow-[0_0_40px_rgba(16,185,129,0.6)]'} text-white font-bold transition-all flex items-center gap-2 hover:scale-105 ${isCreating || isScheduleDisabled ? 'opacity-70 cursor-not-allowed' : ''}`;

  return (
    <div className={containerClasses}>
      {step > 1 ? (
        <button onClick={onBack} className={backButtonClasses}>
          <ChevronLeft size={18} /> Voltar
        </button>
      ) : (
        <div />
      )}

      {step < 3 ? (
        // Hide button completely if over limit on Step 2 - the cards guide the user
        step === 2 && isOverLimit ? null : (
          <button onClick={onNext} className={continueButtonClasses}>
            <span className="relative z-10 flex items-center gap-2">
              Continuar <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </span>
          </button>
        )
      ) : isOverLimit ? null : (
        <button
          onClick={handleSendClick}
          disabled={isCreating || isScheduleDisabled}
          className={sendButtonClasses}
        >
          <span className="relative z-10 flex items-center gap-2">
            {isCreating
              ? 'Processando...'
              : scheduleMode === 'scheduled'
                ? 'Agendar Campanha'
                : 'Disparar Campanha'}
            {!isCreating && (scheduleMode === 'scheduled' 
              ? <Calendar size={18} /> 
              : <Zap size={18} className="fill-white" />
            )}
          </span>
        </button>
      )}
    </div>
  );
};
