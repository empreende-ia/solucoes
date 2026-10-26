'use client';

import React from 'react';
import { AlertCircle } from 'lucide-react';

export function FinalCheckWarning() {
  return (
    <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 flex gap-3">
      <AlertCircle className="text-amber-500 shrink-0" size={20} />
      <div className="text-xs text-amber-200/70">
        <p className="font-bold text-amber-500 mb-1">Checagem Final</p>
        <p>
          Ao clicar em disparar, você confirma que todos os destinatários
          aceitaram receber mensagens do seu negócio.
        </p>
      </div>
    </div>
  );
}
