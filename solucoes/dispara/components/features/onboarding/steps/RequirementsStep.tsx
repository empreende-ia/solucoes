'use client';

import React from 'react';
import { ArrowLeft, ArrowRight, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StepHeader } from './StepHeader';

interface RequirementsStepProps {
  onNext: () => void;
  onBack: () => void;
  stepNumber: number;
  totalSteps: number;
}

export function RequirementsStep({ onNext, onBack, stepNumber, totalSteps }: RequirementsStepProps) {
  return (
    <div className="space-y-6">
      <StepHeader
        stepNumber={stepNumber}
        totalSteps={totalSteps}
        title="O que você vai precisar"
        onBack={onBack}
      />

      <div className="space-y-4">
        {/* Requisito 1: Conta Facebook */}
        <div className="flex items-start gap-3 p-3 rounded-lg bg-[var(--ds-bg-surface)]">
          <CheckCircle2 className="w-5 h-5 text-primary-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium text-[var(--ds-text-primary)]">Conta no Facebook</p>
            <p className="text-sm text-[var(--ds-text-secondary)]">Pode criar uma nova se não tiver</p>
          </div>
        </div>

        {/* Requisito 2: Número dedicado */}
        <div className="flex items-start gap-3 p-3 rounded-lg bg-[var(--ds-bg-surface)]">
          <CheckCircle2 className="w-5 h-5 text-primary-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium text-[var(--ds-text-primary)]">Um número de telefone dedicado</p>
            <p className="text-sm text-[var(--ds-text-secondary)]">Celular ou fixo, que possa receber SMS ou ligação</p>
          </div>
        </div>

        {/* Requisito 3: CNPJ e documentos */}
        <div className="flex items-start gap-3 p-3 rounded-lg bg-[var(--ds-bg-surface)]">
          <CheckCircle2 className="w-5 h-5 text-primary-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium text-[var(--ds-text-primary)]">CNPJ e documentos da empresa</p>
            <p className="text-sm text-[var(--ds-text-secondary)]">Necessários para a verificação da empresa na Meta</p>
          </div>
        </div>
      </div>

      {/* Verificação da empresa é necessária */}
      <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium text-blue-200 mb-2">Verificação da empresa</p>
            <p className="text-sm text-blue-200/80">
              É preciso <strong>verificar sua empresa</strong> no Gerenciador de Negócios da Meta.
              Tenha o CNPJ e os documentos da empresa em mãos — sem a verificação, a conta opera
              com limites e restrições.
            </p>
          </div>
        </div>
      </div>

      {/* Aviso importante */}
      <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium text-amber-200 mb-1">Atenção sobre o número</p>
            <p className="text-sm text-amber-200/80">
              O número <strong>não pode estar no WhatsApp pessoal</strong>. Se estiver, você precisará
              desconectá-lo primeiro (suas conversas pessoais serão apagadas).
            </p>
            <p className="text-sm text-amber-200/80 mt-2">
              <strong>Recomendação:</strong> use um chip extra ou número virtual dedicado para negócios.
            </p>
          </div>
        </div>
      </div>

      {/* Ações */}
      <div className="flex justify-between pt-2">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar
        </Button>
        <Button onClick={onNext}>
          Tenho tudo isso
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
