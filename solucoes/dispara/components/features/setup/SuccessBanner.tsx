'use client';

import { useState } from 'react';
import { CheckCircle2, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SuccessBannerProps {
  onSendTest: () => void;
  /** Se true, mostra versão compacta após dismiss */
  dismissible?: boolean;
}

export function SuccessBanner({ onSendTest, dismissible = true }: SuccessBannerProps) {
  const [isDismissed, setIsDismissed] = useState(false);

  if (isDismissed) {
    return null;
  }

  return (
    <div className="rounded-xl border border-primary-500/30 bg-primary-500/10 p-4 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-start gap-3 flex-1">
          <div className="w-10 h-10 rounded-lg bg-primary-500/20 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-5 h-5 text-primary-400" />
          </div>
          <div>
            <h3 className="font-semibold text-primary-200">
              WhatsApp conectado com sucesso!
            </h3>
            <p className="text-sm text-primary-200/70 mt-0.5">
              Que tal enviar sua primeira mensagem de teste?
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:flex-shrink-0">
          {dismissible && (
            <Button
              variant="ghost"
              size="sm"
              className="text-primary-200/70 hover:text-primary-200 hover:bg-primary-500/10"
              onClick={() => setIsDismissed(true)}
            >
              Depois
            </Button>
          )}
          <Button
            size="sm"
            className="bg-primary-500 hover:bg-primary-600 text-black font-medium"
            onClick={onSendTest}
          >
            <Send className="w-4 h-4 mr-1.5" />
            Enviar Mensagem de Teste
          </Button>
        </div>
      </div>

      {dismissible && (
        <button
          onClick={() => setIsDismissed(true)}
          className="absolute top-3 right-3 p-1 text-primary-200/50 hover:text-primary-200 transition-colors hidden sm:block"
          aria-label="Fechar"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
