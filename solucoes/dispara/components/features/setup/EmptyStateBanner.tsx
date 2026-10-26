'use client';

import { AlertTriangle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyStateBannerProps {
  onConnect: () => void;
  onHelp: () => void;
}

export function EmptyStateBanner({ onConnect, onHelp }: EmptyStateBannerProps) {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-start gap-3 flex-1">
          <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h3 className="font-semibold text-amber-200">
              WhatsApp não conectado
            </h3>
            <p className="text-sm text-amber-200/70 mt-0.5">
              Para enviar mensagens, conecte suas credenciais do WhatsApp Business API.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="text-amber-200/70 hover:text-amber-200 hover:bg-amber-500/10"
            onClick={onHelp}
          >
            <ExternalLink className="w-4 h-4 mr-1.5" />
            Não tenho credenciais
          </Button>
          <Button
            size="sm"
            className="bg-amber-500 hover:bg-amber-600 text-black font-medium"
            onClick={onConnect}
          >
            Conectar WhatsApp
          </Button>
        </div>
      </div>
    </div>
  );
}
