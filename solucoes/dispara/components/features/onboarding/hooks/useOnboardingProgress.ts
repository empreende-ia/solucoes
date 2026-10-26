'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

// ============================================================================
// Types
// ============================================================================

export type OnboardingStep =
  | 'welcome'             // Escolha do caminho
  | 'requirements'        // Passo 1 - requisitos
  | 'create-app'          // Passo 2 - criar app Meta
  | 'add-whatsapp'        // Passo 3 - adicionar WhatsApp
  | 'credentials'         // Passo 4 - copiar credenciais
  | 'test-connection'     // Passo 5 - testar (usado no modo normal)
  | 'configure-webhook'   // Passo 6 - configurar webhook
  | 'create-permanent-token' // Passo 7 - token permanente (opcional)
  | 'direct-credentials'  // Caminho B - input direto
  | 'complete';           // Concluído

export type OnboardingPath = 'guided' | 'direct' | null;

// Estado do wizard (localStorage) - apenas UI temporária
export interface OnboardingProgress {
  // Estado do wizard
  currentStep: OnboardingStep;
  path: OnboardingPath;
  completedSteps: OnboardingStep[];

  // UI state do checklist
  isChecklistMinimized: boolean;
  isChecklistDismissed: boolean;

  // Timestamp de início (apenas para UX)
  startedAt: string | null;

  // REMOVIDO: completedAt - agora vem apenas do banco de dados
  // O banco de dados é a única fonte de verdade para "onboarding completo"
}

const STORAGE_KEY = 'dispara_onboarding_progress_v2'; // v2 para ignorar localStorage antigo

const DEFAULT_PROGRESS: OnboardingProgress = {
  currentStep: 'welcome',
  path: null,
  completedSteps: [],
  isChecklistMinimized: false,
  isChecklistDismissed: false,
  startedAt: null,
};

// ============================================================================
// Hook
// ============================================================================

export function useOnboardingProgress() {
  const [progress, setProgress] = useState<OnboardingProgress>(DEFAULT_PROGRESS);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as OnboardingProgress;
        // Migração: remove campos antigos (completedAt, checklistItems)
        const { completedAt, checklistItems, ...cleanProgress } = parsed as OnboardingProgress & {
          checklistItems?: unknown;
          completedAt?: unknown; // campo removido na v2
        };
        setProgress(cleanProgress as OnboardingProgress);
      }
    } catch (error) {
      console.error('Failed to load onboarding progress:', error);
    }
    setIsLoaded(true);
  }, []);

  // Save to localStorage on change
  useEffect(() => {
    if (isLoaded) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
      } catch (error) {
        console.error('Failed to save onboarding progress:', error);
      }
    }
  }, [progress, isLoaded]);

  // ============================================================================
  // Actions
  // ============================================================================

  const startOnboarding = useCallback((path: OnboardingPath) => {
    setProgress(prev => ({
      ...prev,
      path,
      currentStep: path === 'guided' ? 'requirements' : 'direct-credentials',
      startedAt: prev.startedAt || new Date().toISOString(),
    }));
  }, []);

  const goToStep = useCallback((step: OnboardingStep) => {
    setProgress(prev => ({
      ...prev,
      currentStep: step,
    }));
  }, []);

  const completeStep = useCallback((step: OnboardingStep) => {
    setProgress(prev => ({
      ...prev,
      completedSteps: prev.completedSteps.includes(step)
        ? prev.completedSteps
        : [...prev.completedSteps, step],
    }));
  }, []);

  const nextStep = useCallback(() => {
    setProgress(prev => {
      // Fluxo simplificado: removidos sync-templates e send-first-message
      const guidedSteps: OnboardingStep[] = [
        'requirements',
        'create-app',
        'add-whatsapp',
        'credentials',
        'test-connection',
        'configure-webhook',
        'create-permanent-token',
        'complete',
      ];

      // Marcar step atual como completo
      const updatedCompleted = prev.completedSteps.includes(prev.currentStep)
        ? prev.completedSteps
        : [...prev.completedSteps, prev.currentStep];

      // Se path é 'guided' OU step atual está na sequência guiada (ex: aberto via menu de ajuda)
      const isInGuidedSequence = guidedSteps.includes(prev.currentStep);
      if (prev.path === 'guided' || isInGuidedSequence) {
        const currentIndex = guidedSteps.indexOf(prev.currentStep);
        const nextStepValue = guidedSteps[currentIndex + 1] || 'complete';

        return {
          ...prev,
          currentStep: nextStepValue,
          completedSteps: updatedCompleted,
          // NOTA: "completo" é marcado no BANCO, não aqui
        };
      }

      // Path direto vai direto para complete
      return {
        ...prev,
        currentStep: 'complete',
        completedSteps: updatedCompleted,
      };
    });
  }, []);

  const previousStep = useCallback(() => {
    setProgress(prev => {
      // Fluxo simplificado: removidos sync-templates e send-first-message
      const guidedSteps: OnboardingStep[] = [
        'welcome',
        'requirements',
        'create-app',
        'add-whatsapp',
        'credentials',
        'test-connection',
        'configure-webhook',
        'create-permanent-token',
      ];

      if (prev.path === 'guided') {
        const currentIndex = guidedSteps.indexOf(prev.currentStep);
        const prevStep = guidedSteps[Math.max(0, currentIndex - 1)];
        return { ...prev, currentStep: prevStep };
      }

      // Se aberto via menu de ajuda (path null mas em guided sequence), fecha o modal
      const isInGuidedSequence = guidedSteps.includes(prev.currentStep);
      if (isInGuidedSequence) {
        return { ...prev, currentStep: 'complete' };
      }

      // Path direto volta para welcome
      return { ...prev, currentStep: 'welcome', path: null };
    });
  }, []);

  // Marca o wizard local como "completo" (apenas UI)
  // O estado real de "onboarding completo" é gerenciado pelo banco de dados
  const completeOnboarding = useCallback(() => {
    setProgress(prev => ({
      ...prev,
      currentStep: 'complete',
    }));
  }, []);

  // ============================================================================
  // Checklist UI Actions
  // ============================================================================

  const minimizeChecklist = useCallback((minimized: boolean) => {
    setProgress(prev => ({
      ...prev,
      isChecklistMinimized: minimized,
    }));
  }, []);

  const dismissChecklist = useCallback(() => {
    setProgress(prev => ({
      ...prev,
      isChecklistDismissed: true,
    }));
  }, []);

  const resetOnboarding = useCallback(() => {
    setProgress(DEFAULT_PROGRESS);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // ============================================================================
  // Computed Values
  // ============================================================================

  // NOTA: Este valor indica apenas se o wizard LOCAL chegou ao step 'complete'.
  // A fonte de verdade para "onboarding completo" é o banco de dados.
  // Use `isOnboardingCompletedInDb` do DashboardShell para lógica de negócio.
  const isWizardAtComplete = useMemo(() => {
    return progress.currentStep === 'complete';
  }, [progress.currentStep]);

  // DEPRECADO: shouldShowOnboardingModal não deve mais ser usado.
  // O DashboardShell controla a exibição do modal baseado no banco de dados.
  const shouldShowOnboardingModal = useMemo(() => {
    // Sempre retorna false - a decisão agora é do DashboardShell via banco
    return false;
  }, []);

  const shouldShowChecklist = useMemo(() => {
    // Mostra checklist se:
    // 1. Wizard local chegou ao step 'complete'
    // 2. Usuário não dismissou o checklist
    return isWizardAtComplete && !progress.isChecklistDismissed;
  }, [isWizardAtComplete, progress.isChecklistDismissed]);

  const currentStepNumber = useMemo(() => {
    // Fluxo simplificado: 7 passos
    const guidedSteps: OnboardingStep[] = [
      'requirements',
      'create-app',
      'add-whatsapp',
      'credentials',
      'test-connection',
      'configure-webhook',
      'create-permanent-token',
    ];
    const index = guidedSteps.indexOf(progress.currentStep);
    return index >= 0 ? index + 1 : 0;
  }, [progress.currentStep]);

  const totalSteps = 7;

  // Progresso do checklist (usado pelo ChecklistMiniBadge)
  const checklistProgress = useMemo(() => {
    const total = totalSteps;
    const completed = progress.completedSteps.length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, percentage };
  }, [progress.completedSteps.length, totalSteps]);

  return {
    // State
    progress,
    isLoaded,

    // Computed
    isWizardAtComplete, // novo nome - indica apenas estado do wizard local
    isOnboardingComplete: isWizardAtComplete, // alias para compatibilidade (deprecado)
    shouldShowOnboardingModal, // deprecado - sempre false, usar banco
    shouldShowChecklist,
    currentStepNumber,
    totalSteps,
    checklistProgress,

    // Actions
    startOnboarding,
    goToStep,
    completeStep,
    nextStep,
    previousStep,
    completeOnboarding,

    // Checklist UI
    minimizeChecklist,
    dismissChecklist,

    // Reset
    resetOnboarding,
  };
}
