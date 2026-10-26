'use client'

/**
 * ConversationHeader - Compact Inline Header
 *
 * Design Philosophy:
 * - Minimal height, maximum utility
 * - No heavy borders (subtle bottom line only)
 * - Compact action buttons
 * - Mode toggle integrated naturally
 */

import React, { useState } from 'react'
import { useAIAgentsGlobalToggle } from '@/hooks/useAIAgents'
import {
  Bot,
  User,
  MoreVertical,
  X,
  RotateCcw,
  Tag,
  AlertCircle,
  UserCheck,
  PauseCircle,
  PlayCircle,
  Clock,
  Trash2,
  Settings2,
  Brain,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type {
  InboxConversation,
  InboxLabel,
  ConversationMode,
  ConversationPriority,
} from '@/types'
import { ContactMemoriesSheet } from './ContactMemoriesSheet'
import { formatPhoneNumberDisplay } from '@/lib/phone-formatter'

export interface ConversationHeaderProps {
  conversation: InboxConversation
  labels: InboxLabel[]
  onModeToggle: () => void
  onClose: () => void
  onReopen: () => void
  onPriorityChange: (priority: ConversationPriority) => void
  onLabelToggle: (labelId: string) => void
  /** Transfer conversation to human agent (with optional reason/summary) */
  onHandoff?: (params?: { reason?: string; summary?: string; pauseMinutes?: number }) => void
  /** Return conversation to bot mode */
  onReturnToBot?: () => void
  /** T067: Pause automation for X minutes */
  onPause?: (params: { duration_minutes: number; reason?: string }) => void
  /** T067: Resume automation immediately */
  onResume?: () => void
  /** Delete conversation permanently */
  onDelete?: () => void
  /** Configure the AI agent for this conversation */
  onConfigureAgent?: () => void
  isUpdating?: boolean
  isHandingOff?: boolean
  isReturningToBot?: boolean
  isPausing?: boolean
  isResuming?: boolean
  isDeleting?: boolean
}

const priorityLabels: Record<ConversationPriority, { label: string; color: string }> = {
  low: { label: 'Baixa', color: 'text-[var(--ds-text-secondary)]' },
  normal: { label: 'Normal', color: 'text-[var(--ds-text-primary)]' },
  high: { label: 'Alta', color: 'text-amber-400' },
  urgent: { label: 'Urgente', color: 'text-red-400' },
}

// Pause duration options in minutes
const pauseDurations = [
  { value: 5, label: '5 minutos' },
  { value: 15, label: '15 minutos' },
  { value: 30, label: '30 minutos' },
  { value: 60, label: '1 hora' },
  { value: 120, label: '2 horas' },
  { value: 240, label: '4 horas' },
  { value: 480, label: '8 horas' },
  { value: 1440, label: '24 horas' },
]

export function ConversationHeader({
  conversation,
  labels,
  onModeToggle,
  onClose,
  onReopen,
  onPriorityChange,
  onLabelToggle,
  onHandoff,
  onReturnToBot,
  onPause,
  onResume,
  onDelete,
  onConfigureAgent,
  isUpdating,
  isHandingOff,
  isReturningToBot,
  isPausing,
  isResuming,
  isDeleting,
}: ConversationHeaderProps) {
  const { phone, contact, mode, status, priority, labels: conversationLabels, automation_paused_until, human_mode_expires_at, ai_agent } = conversation

  // Delete confirmation dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  // Memories sheet state
  const [showMemoriesSheet, setShowMemoriesSheet] = useState(false)

  // Check if AI agents are globally enabled
  const { enabled: aiGlobalEnabled } = useAIAgentsGlobalToggle()

  const displayName = contact?.name || phone
  const agentName = ai_agent?.name
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const isOpen = status === 'open'
  const isBotMode = mode === 'bot'
  const currentPriority = priority || 'normal'
  const priorityConfig = priorityLabels[currentPriority]

  // T067: Check if automation is paused
  const isPaused = automation_paused_until && new Date(automation_paused_until) > new Date()
  const pausedUntilDate = automation_paused_until ? new Date(automation_paused_until) : null

  // Human mode expiration
  const humanModeExpiresAt = human_mode_expires_at ? new Date(human_mode_expires_at) : null
  const hasHumanModeExpiration = humanModeExpiresAt && humanModeExpiresAt > new Date()

  // Format remaining time (reusable)
  const formatTimeRemaining = (targetDate: Date | null) => {
    if (!targetDate) return ''
    const now = new Date()
    const diff = targetDate.getTime() - now.getTime()
    if (diff <= 0) return 'expirado'
    const minutes = Math.ceil(diff / (1000 * 60))
    if (minutes < 60) return `${minutes}min`
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}min` : `${hours}h`
  }

  // Format remaining pause time
  const formatPauseRemaining = () => formatTimeRemaining(pausedUntilDate) + ' restantes'

  // Format human mode expiration
  const formatHumanModeExpiration = () => formatTimeRemaining(humanModeExpiresAt)

  // Check if a label is assigned
  const isLabelAssigned = (labelId: string) =>
    conversationLabels?.some((l) => l.id === labelId) ?? false

  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)]">
      {/* Contact info - compact */}
      <div className="flex items-center gap-2.5">
        {/* Simple avatar */}
        <div className="h-8 w-8 rounded-full bg-[var(--ds-bg-surface)] flex items-center justify-center shrink-0">
          <span className="text-[11px] font-medium text-[var(--ds-text-secondary)]">{initials}</span>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="text-[13px] font-medium text-[var(--ds-text-primary)] truncate">{displayName}</h3>
            {!isOpen && (
              <span className="text-[9px] text-[var(--ds-text-muted)] bg-[var(--ds-bg-surface)] px-1.5 py-0.5 rounded">
                fechada
              </span>
            )}
            {/* Pause indicator - minimal */}
            {isPaused && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex items-center gap-1 text-[9px] text-orange-400/80 bg-orange-500/10 px-1.5 py-0.5 rounded">
                    <PauseCircle className="h-2.5 w-2.5" />
                    pausa
                  </span>
                </TooltipTrigger>
                <TooltipContent className="text-xs">
                  {formatPauseRemaining()}
                </TooltipContent>
              </Tooltip>
            )}
            {/* Priority indicator - just icon */}
            {currentPriority !== 'normal' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <AlertCircle
                    className={cn('h-3 w-3', priorityConfig.color)}
                  />
                </TooltipTrigger>
                <TooltipContent className="text-xs">
                  {priorityConfig.label}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          <span className="text-[10px] text-[var(--ds-text-muted)]">{formatPhoneNumberDisplay(phone, 'e164')}</span>
        </div>
      </div>

      {/* Actions - compact */}
      <div className="flex items-center gap-1">
        {/* Memories quick access */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setShowMemoriesSheet(true)}
              className="h-7 w-7 flex items-center justify-center text-violet-400 hover:text-violet-300 rounded-lg hover:bg-violet-500/10 transition-colors"
            >
              <Brain className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Ver memórias do contato
          </TooltipContent>
        </Tooltip>

        {/* Mode toggle - colored pill */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onModeToggle}
              disabled={isUpdating || !isOpen}
              className={cn(
                'h-6 px-2 rounded-full text-[10px] font-medium flex items-center gap-1 transition-all',
                isUpdating || !isOpen ? 'opacity-50 cursor-not-allowed' : '',
                isBotMode
                  ? aiGlobalEnabled
                    ? 'bg-primary-500/15 text-primary-400 hover:bg-primary-500/25'
                    : 'bg-slate-500/15 text-[var(--ds-text-secondary)] hover:bg-slate-500/25'
                  : 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
              )}
            >
              {isBotMode ? (
                <>
                  <Bot className="h-2.5 w-2.5" />
                  <span className="max-w-[60px] truncate">
                    {aiGlobalEnabled ? (agentName || 'Bot') : 'IA off'}
                  </span>
                </>
              ) : (
                <>
                  <User className="h-2.5 w-2.5" />
                  <span>Humano</span>
                  {hasHumanModeExpiration && (
                    <span className="text-[8px] opacity-70">({formatHumanModeExpiration()})</span>
                  )}
                </>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs max-w-[200px]">
            {isBotMode
              ? aiGlobalEnabled
                ? 'Assumir controle (volta ao bot em 24h)'
                : 'IA desativada globalmente - Assumir controle'
              : hasHumanModeExpiration
                ? `Volta ao bot em ${formatHumanModeExpiration()}. Clique para ativar bot agora.`
                : aiGlobalEnabled
                  ? 'Ativar bot'
                  : 'IA desativada globalmente'}
          </TooltipContent>
        </Tooltip>

        {/* More actions menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="h-7 w-7 flex items-center justify-center text-[var(--ds-text-muted)] hover:text-[var(--ds-text-secondary)] rounded-lg hover:bg-[var(--ds-bg-hover)] transition-colors">
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {/* Priority submenu */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <AlertCircle className="h-4 w-4 mr-2" />
                Prioridade
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={currentPriority}
                  onValueChange={(v) => onPriorityChange(v as ConversationPriority)}
                >
                  {(Object.entries(priorityLabels) as [ConversationPriority, typeof priorityConfig][]).map(
                    ([value, config]) => (
                      <DropdownMenuRadioItem
                        key={value}
                        value={value}
                        className={config.color}
                      >
                        {config.label}
                      </DropdownMenuRadioItem>
                    )
                  )}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            {/* Labels submenu */}
            {labels.length > 0 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Tag className="h-4 w-4 mr-2" />
                  Etiquetas
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {labels.map((label) => (
                    <DropdownMenuItem
                      key={label.id}
                      onClick={() => onLabelToggle(label.id)}
                    >
                      <div
                        className="h-3 w-3 rounded-full mr-2"
                        style={{ backgroundColor: label.color }}
                      />
                      {label.name}
                      {isLabelAssigned(label.id) && (
                        <span className="ml-auto text-primary-400">✓</span>
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}

            {/* Configure AI Agent */}
            {ai_agent && onConfigureAgent && (
              <DropdownMenuItem onClick={onConfigureAgent}>
                <Settings2 className="h-4 w-4 mr-2" />
                Configurar agente
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />

            {/* Handoff / Return to bot */}
            {isOpen && isBotMode && onHandoff && (
              <DropdownMenuItem
                onClick={() => onHandoff()}
                disabled={isHandingOff}
                className="text-amber-400"
              >
                <UserCheck className="h-4 w-4 mr-2" />
                {isHandingOff ? 'Transferindo...' : 'Transferir para atendente'}
              </DropdownMenuItem>
            )}
            {isOpen && !isBotMode && onReturnToBot && (
              <DropdownMenuItem
                onClick={onReturnToBot}
                disabled={isReturningToBot}
                className="text-blue-400"
              >
                <Bot className="h-4 w-4 mr-2" />
                {isReturningToBot ? 'Retornando...' : 'Retornar ao bot'}
              </DropdownMenuItem>
            )}

            {/* T067: Pause/Resume automation */}
            {isOpen && isBotMode && onPause && !isPaused && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger disabled={isPausing}>
                  <PauseCircle className="h-4 w-4 mr-2" />
                  {isPausing ? 'Pausando...' : 'Pausar automação'}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuLabel className="text-xs text-[var(--ds-text-muted)]">
                    <Clock className="h-3 w-3 inline mr-1" />
                    Por quanto tempo?
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {pauseDurations.map(({ value, label }) => (
                    <DropdownMenuItem
                      key={value}
                      onClick={() => onPause({ duration_minutes: value })}
                    >
                      {label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            {isOpen && isPaused && onResume && (
              <DropdownMenuItem
                onClick={onResume}
                disabled={isResuming}
                className="text-primary-400"
              >
                <PlayCircle className="h-4 w-4 mr-2" />
                {isResuming ? 'Resumindo...' : 'Retomar automação'}
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />

            {/* Close/Reopen */}
            {isOpen ? (
              <DropdownMenuItem
                onClick={onClose}
                className="text-amber-400"
              >
                <X className="h-4 w-4 mr-2" />
                Fechar conversa
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={onReopen}
                className="text-green-400"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reabrir conversa
              </DropdownMenuItem>
            )}

            {/* Delete conversation */}
            {onDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setShowDeleteDialog(true)}
                  disabled={isDeleting}
                  className="text-red-400 focus:text-red-400 focus:bg-red-500/10"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {isDeleting ? 'Excluindo...' : 'Excluir conversa'}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Delete confirmation dialog */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir conversa?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser desfeita. Todas as mensagens desta conversa
                com <strong>{displayName}</strong> serão permanentemente removidas.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  onDelete?.()
                  setShowDeleteDialog(false)
                }}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Contact memories sheet */}
        <ContactMemoriesSheet
          open={showMemoriesSheet}
          onOpenChange={setShowMemoriesSheet}
          phone={phone}
          contactName={displayName}
        />
      </div>
    </div>
  )
}
