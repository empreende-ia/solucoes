import { createContext, useContext } from 'react';
import type { useCrmOnboarding } from '@/hooks/useCrmOnboarding';
import type { SetupStepId } from './setup-state';

export interface CrmOnboardingContextValue extends ReturnType<typeof useCrmOnboarding> {
  open: boolean;
  stepId: SetupStepId;
  openGuide: (stepId?: SetupStepId) => void;
  closeGuide: () => void;
  selectStep: (stepId: SetupStepId) => void;
}
export const CrmOnboardingContext = createContext<CrmOnboardingContextValue | null>(null);
export const useOnboardingGuide = () => useContext(CrmOnboardingContext);
