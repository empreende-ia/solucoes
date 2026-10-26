'use client'

/**
 * T060: AI Agents Settings Page
 * Page for managing AI agents configuration
 * Includes agent list, knowledge base, and test chat
 */

import { useState, useEffect } from 'react'
import { Bot } from 'lucide-react'
import { Page, PageDescription, PageHeader, PageTitle } from '@/components/ui/page'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AIAgentsSettingsView,
  KnowledgeBasePanel,
  AIAgentTestChat,
} from '@/components/features/settings/ai-agents'
import { useAIAgentsController, useAIAgentsGlobalToggle } from '@/hooks/useAIAgents'
import { useKnowledgeBaseController } from '@/hooks/useKnowledgeBase'
import type { AIAgent } from '@/types'

export default function AIAgentsSettingsPage() {
  const controller = useAIAgentsController()
  const globalToggle = useAIAgentsGlobalToggle()
  const [selectedAgent, setSelectedAgent] = useState<AIAgent | null>(null)

  // Auto-select default agent (or first agent) when agents load
  useEffect(() => {
    if (controller.agents.length > 0 && !selectedAgent) {
      // Prefer the default agent, otherwise pick the first one
      const defaultAgent = controller.agents.find(a => a.is_default) ?? controller.agents[0]
      setSelectedAgent(defaultAgent)
    }
  }, [controller.agents, selectedAgent])

  // Knowledge base controller (uses selected agent)
  const knowledgeBase = useKnowledgeBaseController(selectedAgent?.id ?? null)

  // Handle agent selection for details view
  const handleSelectAgent = (agent: AIAgent) => {
    setSelectedAgent(agent)
  }

  return (
    <Page>
      <PageHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary-500/10">
            <Bot className="h-6 w-6 text-primary-400" />
          </div>
          <div>
            <PageTitle>Agentes IA</PageTitle>
            <PageDescription>
              Configure os agentes de atendimento automático para o inbox
            </PageDescription>
          </div>
        </div>
      </PageHeader>

      <div className="space-y-6">
        {/* Main agents list */}
        <AIAgentsSettingsView
          agents={controller.agents}
          isLoading={controller.isLoading}
          error={controller.error}
          onCreate={controller.onCreate}
          onUpdate={controller.onUpdate}
          onDelete={controller.onDelete}
          onSetDefault={controller.onSetDefault}
          onToggleActive={controller.onToggleActive}
          isCreating={controller.isCreating}
          isUpdating={controller.isUpdating}
          isDeleting={controller.isDeleting}
          globalEnabled={globalToggle.enabled}
          isGlobalToggleLoading={globalToggle.isLoading || globalToggle.isUpdating}
          onGlobalToggle={globalToggle.toggle}
        />

        {/* Agent details section (Knowledge Base + Test) */}
        {controller.agents.length > 0 && (
          <Tabs defaultValue="knowledge" className="w-full">
            <div className="flex items-center justify-between mb-4">
              <TabsList>
                <TabsTrigger value="knowledge">Base de Conhecimento</TabsTrigger>
                <TabsTrigger value="test">Testar Agente</TabsTrigger>
              </TabsList>

              {/* Agent selector */}
              <div className="flex items-center gap-2">
                <label className="text-sm text-[var(--ds-text-secondary)]">Agente:</label>
                <select
                  className="px-3 py-2 rounded-md bg-[var(--ds-bg-surface)] border border-[var(--ds-border-default)] text-sm text-[var(--ds-text-primary)] focus:outline-none focus:ring-2 focus:ring-primary-500 min-w-[200px]"
                  value={selectedAgent?.id ?? ''}
                  onChange={(e) => {
                    const agent = controller.agents.find((a) => a.id === e.target.value)
                    setSelectedAgent(agent ?? null)
                  }}
                >
                  {controller.agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name} {agent.is_default && '(Padrão)'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <TabsContent value="knowledge">
              <KnowledgeBasePanel
                agentId={selectedAgent?.id ?? null}
                files={knowledgeBase.files}
                isLoading={knowledgeBase.isLoading}
                error={knowledgeBase.error}
                onUpload={knowledgeBase.onUpload}
                onDelete={knowledgeBase.onDelete}
                isUploading={knowledgeBase.isUploading}
                isDeleting={knowledgeBase.isDeleting}
                totalSize={knowledgeBase.totalSize}
              />
            </TabsContent>

            <TabsContent value="test">
              <AIAgentTestChat agent={selectedAgent} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </Page>
  )
}
