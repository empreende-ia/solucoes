'use client'

import { Code2 } from 'lucide-react'
import { useDevMode } from '@/components/providers/DevModeProvider'

interface DevModeToggleProps {
  /** Classe CSS adicional */
  className?: string
}

/**
 * Toggle para ativar/desativar o Modo Desenvolvedor
 * Exibe ferramentas de debug e painéis avançados quando ativo
 */
export function DevModeToggle({ className = '' }: DevModeToggleProps) {
  const { isDevMode, toggleDevMode } = useDevMode()

  return (
    <button
      onClick={toggleDevMode}
      className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors
        ${isDevMode
          ? 'border-primary-500/50 bg-primary-500/10 text-primary-500'
          : 'border-transparent text-[var(--ds-text-secondary)] hover:border-[var(--ds-border-default)] hover:bg-[var(--ds-bg-hover)] hover:text-[var(--ds-text-primary)]'
        }
        ${className}`}
      aria-label={isDevMode ? 'Desativar modo desenvolvedor' : 'Ativar modo desenvolvedor'}
      title={isDevMode ? 'Modo Dev: Ativo' : 'Modo Dev: Inativo'}
    >
      <Code2 className="h-4 w-4" />
    </button>
  )
}
