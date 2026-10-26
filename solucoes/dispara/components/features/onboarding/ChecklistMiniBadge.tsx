'use client';

import React from 'react';
import { ClipboardList } from 'lucide-react';
import { useOnboardingProgress } from './hooks/useOnboardingProgress';

interface ChecklistMiniBadgeProps {
  onClick?: () => void;
  /** Se true, considera onboarding completo independente do localStorage */
  isOnboardingCompletedInDb?: boolean;
}

export function ChecklistMiniBadge({ onClick, isOnboardingCompletedInDb }: ChecklistMiniBadgeProps) {
  const {
    progress,
    shouldShowChecklist,
    minimizeChecklist,
  } = useOnboardingProgress();

  // Considera completo se está no banco OU no localStorage
  const isEffectivelyComplete = isOnboardingCompletedInDb || shouldShowChecklist;

  // Mostra o badge apenas se:
  // - Onboarding completo E checklist minimizado
  // Nota: O número de itens pendentes é gerenciado pelo OnboardingChecklist, não aqui
  const shouldShowBadge = isEffectivelyComplete && progress.isChecklistMinimized;

  if (!shouldShowBadge) {
    return null;
  }

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      // Se clicou e estava minimizado, expande
      if (progress.isChecklistMinimized) {
        minimizeChecklist(false);
      }
    }
  };

  return (
    <button
      onClick={handleClick}
      className="relative p-2 rounded-lg transition-colors text-amber-400 hover:text-amber-300 hover:bg-[var(--ds-bg-hover)]"
      title="Expandir checklist de configuração"
    >
      <ClipboardList className="w-5 h-5" />

      {/* Indicador de que há itens pendentes */}
      <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-500" />
    </button>
  );
}
