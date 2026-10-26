'use client'

import { MessageSquare, RefreshCw } from 'lucide-react'

export function InboxErrorFallback() {
  const handleReload = () => window.location.reload()

  return (
    <div className="h-full flex items-center justify-center bg-[var(--ds-bg-base)]">
      <div className="max-w-md text-center px-4">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-500/10 flex items-center justify-center">
          <MessageSquare className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="text-xl font-semibold text-[var(--ds-text-primary)] mb-2">
          Erro ao carregar o Inbox
        </h2>
        <p className="text-[var(--ds-text-secondary)] mb-6">
          Não foi possível carregar as conversas. Isso pode ser um problema temporário.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={handleReload}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors font-medium"
          >
            <RefreshCw className="w-4 h-4" />
            Tentar novamente
          </button>
        </div>
        <p className="mt-6 text-xs text-[var(--ds-text-muted)]">
          Se o problema persistir, verifique sua conexão ou entre em contato com o suporte.
        </p>
      </div>
    </div>
  )
}
