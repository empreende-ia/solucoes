'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { X, ArrowRight, Send, BarChart3, Webhook, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface TourStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  action?: {
    label: string;
    path?: string;
    onClick?: () => void;
  };
  highlight?: string; // selector CSS para highlight (futuro)
}

interface GuidedTourProps {
  onComplete: () => void;
  onSkip: () => void;
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'send-message',
    title: 'Envie sua primeira mensagem!',
    description: 'Crie uma campanha de teste para ver o Dispara em ação. Leva menos de 2 minutos.',
    icon: <Send className="w-6 h-6" />,
    action: {
      label: 'Criar campanha',
      path: '/campaigns/new',
    },
  },
  {
    id: 'view-results',
    title: 'Acompanhe os resultados',
    description: 'Veja em tempo real quantas mensagens foram entregues, lidas e respondidas.',
    icon: <BarChart3 className="w-6 h-6" />,
    action: {
      label: 'Ver dashboard',
      path: '/',
    },
  },
  {
    id: 'configure-webhook',
    title: 'Receba notificações (opcional)',
    description: 'Configure o webhook para receber alertas de entrega no seu sistema.',
    icon: <Webhook className="w-6 h-6" />,
    action: {
      label: 'Configurar depois',
    },
  },
];

const STORAGE_KEY = 'dispara_guided_tour_completed';

export function GuidedTour({ onComplete, onSkip }: GuidedTourProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  const step = TOUR_STEPS[currentStep];
  const isLastStep = currentStep === TOUR_STEPS.length - 1;
  const progress = ((currentStep + 1) / TOUR_STEPS.length) * 100;

  const handleNext = useCallback(() => {
    if (isLastStep) {
      localStorage.setItem(STORAGE_KEY, 'true');
      setIsVisible(false);
      onComplete();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  }, [isLastStep, onComplete]);

  const handleAction = useCallback(() => {
    if (step.action?.path) {
      router.push(step.action.path);
    }
    if (step.action?.onClick) {
      step.action.onClick();
    }
    handleNext();
  }, [step, router, handleNext]);

  const handleSkip = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setIsVisible(false);
    onSkip();
  }, [onSkip]);

  if (!isVisible) return null;

  return (
    <>
      {/* Overlay escurecido */}
      <div
        className="fixed inset-0 bg-black/60 z-[200] transition-opacity duration-300"
        onClick={handleSkip}
      />

      {/* Card do Tour */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[201] w-full max-w-md px-4">
        <div className="bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-2xl shadow-2xl overflow-hidden">
          {/* Progress bar */}
          <div className="h-1 bg-[var(--ds-bg-surface)]">
            <div
              className="h-full bg-primary-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-[var(--ds-border-default)]">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary-400" />
              <span className="text-sm font-medium text-[var(--ds-text-secondary)]">
                Primeiros passos • {currentStep + 1}/{TOUR_STEPS.length}
              </span>
            </div>
            <button
              onClick={handleSkip}
              className="p-1 text-[var(--ds-text-muted)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] rounded transition-colors"
              title="Pular tour"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Icon */}
            <div className="w-14 h-14 rounded-2xl bg-primary-500/10 border border-primary-500/20 flex items-center justify-center text-primary-400 mb-4">
              {step.icon}
            </div>

            {/* Text */}
            <h3 className="text-xl font-semibold text-[var(--ds-text-primary)] mb-2">
              {step.title}
            </h3>
            <p className="text-[var(--ds-text-secondary)] text-sm leading-relaxed mb-6">
              {step.description}
            </p>

            {/* Actions */}
            <div className="flex items-center gap-3">
              {step.action && (
                <Button
                  onClick={handleAction}
                  className="flex-1 bg-primary-600 hover:bg-primary-500 text-white"
                >
                  {step.action.label}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              )}

              {!isLastStep && (
                <Button
                  variant="ghost"
                  onClick={handleNext}
                  className="text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)]"
                >
                  Depois
                </Button>
              )}

              {isLastStep && (
                <Button
                  onClick={handleNext}
                  className="flex-1 bg-primary-600 hover:bg-primary-500 text-white"
                >
                  Concluir
                  <Sparkles className="w-4 h-4 ml-2" />
                </Button>
              )}
            </div>
          </div>

          {/* Footer hint */}
          <div className="px-6 pb-4">
            <p className="text-xs text-[var(--ds-text-muted)] text-center">
              Pressione ESC ou clique fora para pular
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

// Hook para verificar se deve mostrar o tour
export function useGuidedTour() {
  const [shouldShow, setShouldShow] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);

  useEffect(() => {
    const completed = localStorage.getItem(STORAGE_KEY) === 'true';
    setShouldShow(!completed);
    setHasChecked(true);
  }, []);

  const markAsCompleted = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setShouldShow(false);
  }, []);

  const resetTour = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setShouldShow(true);
  }, []);

  return {
    shouldShow,
    hasChecked,
    markAsCompleted,
    resetTour,
  };
}
