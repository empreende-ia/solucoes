'use client'

/**
 * AIAgentHeroCard - Destaque visual para o agente principal
 * Design: borda accent sutil na base
 */

import React from 'react'
import { Settings, Power } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { AIAgent } from '@/types'

export interface AIAgentHeroCardProps {
  agent: AIAgent
  onEdit: (agent: AIAgent) => void
  onToggleActive: (agent: AIAgent, isActive: boolean) => void
  isUpdating?: boolean
  disabled?: boolean
}

export function AIAgentHeroCard({
  agent,
  onEdit,
  onToggleActive,
  isUpdating,
  disabled,
}: AIAgentHeroCardProps) {
  const isActive = agent.is_active

  return (
    <div
      className={cn(
        'relative rounded-xl overflow-hidden transition-all duration-300',
        'bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)]',
        !isActive && 'opacity-60'
      )}
    >
      {/* Accent line na base */}
      {isActive && (
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-primary-500/80 via-primary-400 to-primary-500/80" />
      )}

      <div className="p-5">
        {/* Layout principal */}
        <div className="flex items-center justify-between">
          {/* Lado esquerdo - Info do agente */}
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div
              className={cn(
                'flex items-center justify-center w-11 h-11 rounded-xl text-base font-semibold',
                isActive
                  ? 'bg-primary-500/15 text-primary-400 border border-primary-500/20'
                  : 'bg-[var(--ds-bg-surface)] text-[var(--ds-text-muted)]'
              )}
            >
              {agent.name.charAt(0).toUpperCase()}
            </div>

            {/* Texto */}
            <div>
              <h2 className="text-base font-medium text-[var(--ds-text-primary)]">{agent.name}</h2>
              <p className="text-sm text-[var(--ds-text-muted)]">
                {isActive
                  ? 'Respondendo automaticamente'
                  : 'Desativado'
                }
              </p>
            </div>
          </div>

          {/* Lado direito - Status + Ações */}
          <div className="flex items-center gap-4">
            {/* Status indicator */}
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'w-1.5 h-1.5 rounded-full',
                  isActive ? 'bg-primary-400' : 'bg-[var(--ds-text-muted)]'
                )}
              />
              <span className={cn(
                'text-xs',
                isActive ? 'text-primary-400' : 'text-[var(--ds-text-muted)]'
              )}>
                {isActive ? 'Ativo' : 'Inativo'}
              </span>
            </div>

            {/* Ações */}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEdit(agent)}
                disabled={isUpdating || disabled}
                className="h-8 px-3 text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)]"
              >
                <Settings className="h-4 w-4 mr-1.5" />
                Configurar
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => onToggleActive(agent, !isActive)}
                disabled={isUpdating || disabled}
                className={cn(
                  'h-8 px-3 text-[var(--ds-text-secondary)]',
                  isActive
                    ? 'hover:text-red-400 hover:bg-red-500/10'
                    : 'hover:text-primary-400 hover:bg-primary-500/10'
                )}
              >
                <Power className="h-4 w-4 mr-1.5" />
                {isActive ? 'Desativar' : 'Ativar'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
