'use client'

/**
 * AIAgentCompactCard - Card minimalista para agentes secundários
 * Usado na seção colapsável "Outros agentes"
 */

import React from 'react'
import { Star, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { AIAgent } from '@/types'

export interface AIAgentCompactCardProps {
  agent: AIAgent
  onEdit: (agent: AIAgent) => void
  onDelete: (agent: AIAgent) => void
  onSetDefault: (agent: AIAgent) => void
  onToggleActive: (agent: AIAgent, isActive: boolean) => void
  isUpdating?: boolean
  disabled?: boolean
}

// Gera iniciais do nome
function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase()
}

export function AIAgentCompactCard({
  agent,
  onEdit,
  onDelete,
  onSetDefault,
  onToggleActive,
  isUpdating,
  disabled,
}: AIAgentCompactCardProps) {
  return (
    <div
      className={cn(
        'group flex items-center gap-3 p-3 rounded-xl transition-all',
        'bg-[var(--ds-bg-elevated)] hover:bg-[var(--ds-bg-hover)]',
        'border border-[var(--ds-border-subtle)] hover:border-[var(--ds-border-subtle)]',
        !agent.is_active && 'opacity-60'
      )}
    >
      {/* Avatar pequeno */}
      <div
        className={cn(
          'flex items-center justify-center w-10 h-10 rounded-lg text-sm font-semibold flex-shrink-0',
          agent.is_active
            ? 'bg-[var(--ds-bg-surface)] text-[var(--ds-text-secondary)]'
            : 'bg-[var(--ds-bg-surface)] text-[var(--ds-text-muted)]'
        )}
      >
        {getInitials(agent.name)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h4 className="font-medium text-[var(--ds-text-primary)] truncate">{agent.name}</h4>
          {/* Status dot */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => onToggleActive(agent, !agent.is_active)}
                disabled={isUpdating || disabled}
                className={cn(
                  'w-2 h-2 rounded-full transition-all flex-shrink-0',
                  agent.is_active
                    ? 'bg-primary-400 shadow-[0_0_6px] shadow-primary-400/50'
                    : 'bg-[var(--ds-text-muted)] hover:bg-[var(--ds-text-secondary)]'
                )}
              />
            </TooltipTrigger>
            <TooltipContent>
              {agent.is_active ? 'Ativo - Clique para desativar' : 'Inativo - Clique para ativar'}
            </TooltipContent>
          </Tooltip>
        </div>
        <p className="text-xs text-[var(--ds-text-muted)]">
          {agent.is_active ? 'Ativo' : 'Inativo'}
        </p>
      </div>

      {/* Ações - aparecem no hover */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSetDefault(agent)}
              disabled={isUpdating || disabled}
              className="h-8 px-2 text-xs text-[var(--ds-text-secondary)] hover:text-primary-400"
            >
              <Star className="h-3.5 w-3.5 mr-1" />
              Tornar principal
            </Button>
          </TooltipTrigger>
          <TooltipContent>Definir como agente principal</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onEdit(agent)}
              disabled={isUpdating || disabled}
              className="h-8 w-8 text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)]"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Editar</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete(agent)}
              disabled={isUpdating || disabled}
              className="h-8 w-8 text-[var(--ds-text-secondary)] hover:text-red-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Excluir</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
