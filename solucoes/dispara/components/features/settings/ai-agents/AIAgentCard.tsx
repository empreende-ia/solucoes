'use client'

/**
 * AIAgentCard - Display single AI agent with clean, minimal design
 * Redesign: Removed technical metrics, added semantic description, cleaner layout
 */

import React from 'react'
import {
  Pencil,
  Trash2,
  Star,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { AIAgent } from '@/types'

export interface AIAgentCardProps {
  agent: AIAgent
  onEdit: (agent: AIAgent) => void
  onDelete: (agent: AIAgent) => void
  onSetDefault: (agent: AIAgent) => void
  onToggleActive: (agent: AIAgent, isActive: boolean) => void
  isUpdating?: boolean
  disabled?: boolean
}

// Extrai descrição curta do system prompt (primeira frase ou função principal)
function getAgentDescription(prompt: string): string {
  // Tenta extrair a função do agente (padrões comuns em português)
  const patterns = [
    /(?:você|vc)?\s*(?:ajuda|auxilia|responde|atende)\s*([^.!?\n]{10,50})/i,
    /(?:sua função é|seu papel é|você deve)\s*([^.!?\n]{10,50})/i,
    /assistente\s+(?:de|para|virtual)\s*([^.!?\n]{5,40})/i,
  ]

  for (const pattern of patterns) {
    const match = prompt.match(pattern)
    if (match) {
      const desc = match[0].trim()
        .replace(/^você\s+/i, '')
        .replace(/^vc\s+/i, '')
      if (desc.length > 60) return desc.slice(0, 57) + '...'
      return desc
    }
  }

  // Fallback: primeira frase até 60 chars
  const firstSentence = prompt.split(/[.!?\n]/)[0]?.trim()
  if (!firstSentence) return 'Assistente virtual'
  if (firstSentence.length > 60) return firstSentence.slice(0, 57) + '...'
  return firstSentence
}

// Gera iniciais do nome (até 2 letras)
function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase()
}

export function AIAgentCard({
  agent,
  onEdit,
  onDelete,
  onSetDefault,
  onToggleActive,
  isUpdating,
  disabled,
}: AIAgentCardProps) {
  return (
    <Card
      className={cn(
        'group relative overflow-hidden transition-all duration-200',
        'hover:shadow-lg hover:shadow-primary-500/5',
        !agent.is_active && 'opacity-50',
        agent.is_default && 'ring-1 ring-primary-500/30'
      )}
    >
      {/* Status bar no topo */}
      <div className="flex items-center justify-between px-4 py-2 bg-[var(--ds-bg-elevated)] border-b border-[var(--ds-border-default)]">
        <div className="flex items-center gap-2">
          {/* Indicador de status clicável */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => onToggleActive(agent, !agent.is_active)}
                disabled={isUpdating || disabled}
                className={cn(
                  'w-2 h-2 rounded-full transition-all cursor-pointer',
                  'disabled:cursor-not-allowed',
                  agent.is_active
                    ? 'bg-primary-400 shadow-[0_0_8px] shadow-primary-400/50'
                    : 'bg-[var(--ds-text-muted)] hover:bg-[var(--ds-text-secondary)]'
                )}
                aria-label={agent.is_active ? 'Desativar agente' : 'Ativar agente'}
              />
            </TooltipTrigger>
            <TooltipContent>
              {agent.is_active ? 'Ativo - Clique para desativar' : 'Inativo - Clique para ativar'}
            </TooltipContent>
          </Tooltip>

          <span className="text-[10px] uppercase tracking-wider text-[var(--ds-text-muted)]">
            {agent.is_active ? 'Ativo' : 'Inativo'}
          </span>
        </div>

        {agent.is_default && (
          <Badge
            variant="secondary"
            className="h-5 text-[10px] bg-primary-500/10 text-primary-400 border-0"
          >
            <Star className="h-2.5 w-2.5 mr-1" />
            Padrão
          </Badge>
        )}
      </div>

      {/* Conteúdo principal */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Avatar com inicial */}
          <div
            className={cn(
              'flex items-center justify-center w-10 h-10 rounded-xl text-sm font-semibold transition-colors flex-shrink-0',
              agent.is_active
                ? 'bg-gradient-to-br from-primary-500/20 to-primary-600/10 text-primary-400'
                : 'bg-[var(--ds-bg-surface)] text-[var(--ds-text-muted)]'
            )}
          >
            {getInitials(agent.name)}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-[var(--ds-text-primary)] truncate">{agent.name}</h3>
            <p className="text-xs text-[var(--ds-text-muted)] mt-0.5 line-clamp-2">
              {getAgentDescription(agent.system_prompt)}
            </p>
          </div>
        </div>
      </div>

      {/* Ações sempre visíveis no footer */}
      <div
        className={cn(
          'flex items-center justify-end gap-1 px-4 py-2 border-t border-[var(--ds-border-subtle)]',
          'bg-[var(--ds-bg-surface)]'
        )}
      >
        {!agent.is_default && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSetDefault(agent)}
                disabled={isUpdating || disabled}
                className="h-7 text-xs text-[var(--ds-text-secondary)] hover:text-primary-400"
              >
                <Star className="h-3 w-3 mr-1" />
                Tornar padrão
              </Button>
            </TooltipTrigger>
            <TooltipContent>Definir como agente principal</TooltipContent>
          </Tooltip>
        )}

        <div className="flex-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onEdit(agent)}
              disabled={isUpdating || disabled}
              className="h-7 w-7 text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)]"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Editar</TooltipContent>
        </Tooltip>

        {!agent.is_default && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDelete(agent)}
                disabled={isUpdating || disabled}
                className="h-7 w-7 text-[var(--ds-text-secondary)] hover:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Excluir</TooltipContent>
          </Tooltip>
        )}
      </div>
    </Card>
  )
}
