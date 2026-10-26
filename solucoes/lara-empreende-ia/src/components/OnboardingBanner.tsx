import React from 'react';
import { Rocket, ArrowRight } from 'lucide-react';
import { Button } from '@/components/Button';
import { useOnboardingStatus } from '@/hooks/useOnboardingStatus';

interface OnboardingBannerProps {
  onOpenWizard: () => void;
}

/**
 * Atalho para o assistente de configuração. A situação real de cada item vive
 * no checklist Colocar no ar — duas listas com contagens diferentes na mesma
 * tela era o que confundia antes.
 */
export const OnboardingBanner: React.FC<OnboardingBannerProps> = ({ onOpenWizard }) => {
  const { loading, loadFailed, isComplete, isDismissed } = useOnboardingStatus();

  if (loading || loadFailed || isComplete || isDismissed) return null;

  return (
    <section className="onboarding-banner eia-card" aria-labelledby="onboarding-banner-title">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="onboarding-banner-icon">
            <Rocket aria-hidden="true" />
          </div>
          <div>
            <h2 id="onboarding-banner-title">Configurar a Lara passo a passo.</h2>
            <p className="text-sm text-muted-foreground">
              O assistente reúne identidade, canal, chave de IA e agente em uma sequência só.
            </p>
          </div>
        </div>

        <div className="shrink-0">
          <Button variant="primary" onClick={onOpenWizard} className="whitespace-nowrap">
            Abrir assistente
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </section>
  );
};
