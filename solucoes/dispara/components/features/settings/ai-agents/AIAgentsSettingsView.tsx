'use client'

/**
 * AIAgentsSettingsView - Interface simplificada estilo Jobs
 * Agente padrão em destaque, outros colapsados
 */

import React, { useState, useCallback, useMemo } from 'react'
import { Bot, Plus, Loader2, AlertCircle, ChevronDown, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AIAgentHeroCard } from './AIAgentHeroCard'
import { AIAgentCompactCard } from './AIAgentCompactCard'
import { AIAgentForm } from './AIAgentForm'
import { cn } from '@/lib/utils'
import type { AIAgent } from '@/types'
import type { CreateAIAgentParams, UpdateAIAgentParams } from '@/services/aiAgentService'

export interface AIAgentsSettingsViewProps {
  agents: AIAgent[]
  isLoading: boolean
  error: Error | null
  onCreate: (params: CreateAIAgentParams) => Promise<AIAgent>
  onUpdate: (id: string, params: UpdateAIAgentParams) => Promise<AIAgent>
  onDelete: (id: string) => Promise<unknown>
  onSetDefault: (id: string) => Promise<AIAgent>
  onToggleActive: (id: string, isActive: boolean) => Promise<AIAgent>
  isCreating?: boolean
  isUpdating?: boolean
  isDeleting?: boolean
  globalEnabled: boolean
  isGlobalToggleLoading?: boolean
  onGlobalToggle: (enabled: boolean) => Promise<unknown>
}

export function AIAgentsSettingsView({
  agents,
  isLoading,
  error,
  onCreate,
  onUpdate,
  onDelete,
  onSetDefault,
  onToggleActive,
  isCreating,
  isUpdating,
  isDeleting,
  globalEnabled,
  isGlobalToggleLoading,
  onGlobalToggle,
}: AIAgentsSettingsViewProps) {
  // Form state
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingAgent, setEditingAgent] = useState<AIAgent | null>(null)

  // Delete confirmation state
  const [deleteAgent, setDeleteAgent] = useState<AIAgent | null>(null)

  // Collapsible state
  const [isOthersOpen, setIsOthersOpen] = useState(false)

  // Separar agente padrão dos outros
  const defaultAgent = useMemo(
    () => agents.find((a) => a.is_default),
    [agents]
  )

  const otherAgents = useMemo(
    () => agents.filter((a) => !a.is_default),
    [agents]
  )

  // Handlers
  const handleOpenCreate = useCallback(() => {
    setEditingAgent(null)
    setIsFormOpen(true)
  }, [])

  const handleOpenEdit = useCallback((agent: AIAgent) => {
    setEditingAgent(agent)
    setIsFormOpen(true)
  }, [])

  const handleFormSubmit = useCallback(
    async (params: CreateAIAgentParams | UpdateAIAgentParams) => {
      if (editingAgent) {
        await onUpdate(editingAgent.id, params as UpdateAIAgentParams)
      } else {
        await onCreate(params as CreateAIAgentParams)
      }
      setIsFormOpen(false)
      setEditingAgent(null)
    },
    [editingAgent, onCreate, onUpdate]
  )

  const handleConfirmDelete = useCallback(async () => {
    if (deleteAgent) {
      await onDelete(deleteAgent.id)
      setDeleteAgent(null)
    }
  }, [deleteAgent, onDelete])

  const handleSetDefault = useCallback(
    async (agent: AIAgent) => {
      await onSetDefault(agent.id)
    },
    [onSetDefault]
  )

  const handleToggleActive = useCallback(
    async (agent: AIAgent, isActive: boolean) => {
      await onToggleActive(agent.id, isActive)
    },
    [onToggleActive]
  )

  const handleGlobalToggle = useCallback(
    async (checked: boolean) => {
      await onGlobalToggle(checked)
    },
    [onGlobalToggle]
  )

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Toggle global - sem header duplicado */}
        <div className="flex items-center justify-end">
          <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-[var(--ds-bg-surface)] border border-[var(--ds-border-default)]">
            <span className="text-sm text-[var(--ds-text-secondary)]">Atendimento IA</span>
            <Switch
              id="ai-agents-global"
              checked={globalEnabled}
              onCheckedChange={handleGlobalToggle}
              disabled={isGlobalToggleLoading}
              className="data-[state=checked]:bg-primary-500"
            />
          </div>
        </div>

        {/* Loading state */}
        {isLoading && (
          <Card className="border-[var(--ds-border-default)]">
            <CardContent className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
            </CardContent>
          </Card>
        )}

        {/* Error state */}
        {error && !isLoading && (
          <Card className="border-[var(--ds-border-default)]">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <AlertCircle className="h-8 w-8 text-red-400 mb-3" />
              <p className="text-sm text-[var(--ds-text-secondary)]">Erro ao carregar agentes</p>
              <p className="text-xs text-[var(--ds-text-muted)] mt-1">{error.message}</p>
            </CardContent>
          </Card>
        )}

        {/* Empty state - sem agentes */}
        {!isLoading && !error && agents.length === 0 && (
          <Card className="border-[var(--ds-border-default)] border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="p-4 rounded-2xl bg-[var(--ds-bg-surface)] mb-4">
                <Bot className="h-10 w-10 text-[var(--ds-text-muted)]" />
              </div>
              <h3 className="text-lg font-medium text-[var(--ds-text-primary)] mb-1">
                Nenhum assistente configurado
              </h3>
              <p className="text-sm text-[var(--ds-text-muted)] mb-6 max-w-sm">
                Crie seu primeiro assistente IA para começar a automatizar o atendimento aos clientes.
              </p>
              <Button onClick={handleOpenCreate} disabled={!globalEnabled}>
                <Plus className="h-4 w-4 mr-2" />
                Criar Assistente
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Conteúdo principal quando há agentes */}
        {!isLoading && !error && agents.length > 0 && (
          <div className={cn('space-y-4', !globalEnabled && 'opacity-50 pointer-events-none')}>
            {/* Hero Card - Agente Principal */}
            {defaultAgent ? (
              <AIAgentHeroCard
                agent={defaultAgent}
                onEdit={handleOpenEdit}
                onToggleActive={handleToggleActive}
                isUpdating={isUpdating}
                disabled={!globalEnabled}
              />
            ) : (
              // Sem agente padrão definido
              <Card className="border-[var(--ds-border-default)] border-dashed bg-[var(--ds-bg-elevated)]">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-sm text-[var(--ds-text-secondary)] mb-4">
                    Nenhum agente definido como principal
                  </p>
                  {otherAgents.length > 0 && (
                    <p className="text-xs text-[var(--ds-text-muted)]">
                      Defina um dos agentes abaixo como principal
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Outros Agentes - Seção Colapsável */}
            {otherAgents.length > 0 && (
              <Collapsible open={isOthersOpen} onOpenChange={setIsOthersOpen}>
                <CollapsibleTrigger asChild>
                  <button className="flex items-center justify-between w-full px-4 py-3 rounded-xl bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] hover:bg-[var(--ds-bg-hover)] transition-colors group">
                    <span className="text-sm text-[var(--ds-text-secondary)]">
                      Outros agentes ({otherAgents.length})
                    </span>
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 text-[var(--ds-text-muted)] transition-transform',
                        isOthersOpen && 'rotate-180'
                      )}
                    />
                  </button>
                </CollapsibleTrigger>

                <CollapsibleContent className="mt-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {otherAgents.map((agent) => (
                      <AIAgentCompactCard
                        key={agent.id}
                        agent={agent}
                        onEdit={handleOpenEdit}
                        onDelete={setDeleteAgent}
                        onSetDefault={handleSetDefault}
                        onToggleActive={handleToggleActive}
                        isUpdating={isUpdating}
                        disabled={!globalEnabled}
                      />
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Botão de novo agente */}
            <Button
              variant="outline"
              onClick={handleOpenCreate}
              disabled={!globalEnabled}
              className="w-full border-dashed border-[var(--ds-border-default)] bg-transparent hover:bg-[var(--ds-bg-hover)] text-[var(--ds-text-secondary)]"
            >
              <Plus className="h-4 w-4 mr-2" />
              Novo agente
            </Button>
          </div>
        )}
      </div>

      {/* Create/Edit form */}
      <AIAgentForm
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        agent={editingAgent}
        onSubmit={handleFormSubmit}
        isSubmitting={isCreating || isUpdating}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteAgent} onOpenChange={() => setDeleteAgent(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir agente?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o agente &ldquo;{deleteAgent?.name}&rdquo;?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700"
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                'Excluir'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  )
}
