'use client'

/**
 * T063: AIAgentTestChat
 * Live chat interface to test AI agent before activation
 */

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { Send, Loader2, Bot, User, RefreshCw, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { AIAgent } from '@/types'

interface TestMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  latencyMs?: number
  error?: string
}

export interface AIAgentTestChatProps {
  agent: AIAgent | null
  onClose?: () => void
}

async function testAgent(agentId: string, message: string): Promise<{ response: string; latency_ms: number }> {
  const response = await fetch(`/api/ai-agents/${agentId}/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Erro ao testar agente')
  }

  return response.json()
}

export function AIAgentTestChat({ agent, onClose }: AIAgentTestChatProps) {
  const [messages, setMessages] = useState<TestMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus()
  }, [agent])

  // Reset chat when agent changes
  useEffect(() => {
    setMessages([])
    setInput('')
  }, [agent?.id])

  const handleSend = useCallback(async () => {
    if (!agent || !input.trim() || isLoading) return

    const userMessage: TestMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      const result = await testAgent(agent.id, userMessage.content)

      const assistantMessage: TestMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: result.response,
        timestamp: new Date(),
        latencyMs: result.latency_ms,
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch (error) {
      const errorMessage: TestMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: error instanceof Error ? error.message : 'Erro desconhecido',
        timestamp: new Date(),
        error: 'true',
      }

      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
      textareaRef.current?.focus()
    }
  }, [agent, input, isLoading])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  const handleClearChat = useCallback(() => {
    setMessages([])
    setInput('')
    textareaRef.current?.focus()
  }, [])

  if (!agent) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="text-base">Testar Agente</CardTitle>
          <CardDescription>
            Selecione um agente para testar suas respostas
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-64">
          <p className="text-sm text-[var(--ds-text-muted)]">Nenhum agente selecionado</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary-500/10">
              <Bot className="h-5 w-5 text-primary-400" />
            </div>
            <div>
              <CardTitle className="text-base">Testar: {agent.name}</CardTitle>
              <CardDescription>
                Modelo: {agent.model} • Temp: {agent.temperature}
              </CardDescription>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={handleClearChat} disabled={messages.length === 0}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      {/* Messages area */}
      <CardContent className="flex-1 overflow-y-auto space-y-4 min-h-[200px] max-h-[400px]">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <Bot className="h-12 w-12 text-[var(--ds-text-muted)] mb-3" />
            <p className="text-sm text-[var(--ds-text-secondary)] mb-1">
              Envie uma mensagem para testar o agente
            </p>
            <p className="text-xs text-[var(--ds-text-muted)]">
              O agente responderá usando o prompt e configurações definidas
            </p>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'flex gap-3',
                  message.role === 'user' && 'flex-row-reverse'
                )}
              >
                {/* Avatar */}
                <div
                  className={cn(
                    'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
                    message.role === 'user'
                      ? 'bg-primary-500/20'
                      : message.error
                      ? 'bg-red-500/20'
                      : 'bg-[var(--ds-bg-surface)]'
                  )}
                >
                  {message.role === 'user' ? (
                    <User className="h-4 w-4 text-primary-400" />
                  ) : message.error ? (
                    <AlertCircle className="h-4 w-4 text-red-400" />
                  ) : (
                    <Bot className="h-4 w-4 text-[var(--ds-text-secondary)]" />
                  )}
                </div>

                {/* Message content */}
                <div
                  className={cn(
                    'flex flex-col max-w-[80%]',
                    message.role === 'user' && 'items-end'
                  )}
                >
                  <div
                    className={cn(
                      'px-4 py-2 rounded-2xl text-sm',
                      message.role === 'user'
                        ? 'bg-primary-500 text-white rounded-tr-sm'
                        : message.error
                        ? 'bg-red-500/10 text-red-300 border border-red-500/30 rounded-tl-sm'
                        : 'bg-[var(--ds-bg-surface)] text-[var(--ds-text-primary)] rounded-tl-sm'
                    )}
                  >
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  </div>

                  {/* Metadata */}
                  <div className="flex items-center gap-2 mt-1 px-1">
                    <span className="text-xs text-[var(--ds-text-muted)]">
                      {message.timestamp.toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {message.latencyMs !== undefined && (
                      <span className="text-xs text-[var(--ds-text-muted)]">
                        • {message.latencyMs}ms
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--ds-bg-surface)] flex items-center justify-center">
                  <Loader2 className="h-4 w-4 text-[var(--ds-text-secondary)] animate-spin" />
                </div>
                <div className="bg-[var(--ds-bg-surface)] text-[var(--ds-text-secondary)] px-4 py-2 rounded-2xl rounded-tl-sm text-sm">
                  Pensando...
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </CardContent>

      {/* Input area */}
      <div className="p-4 border-t border-[var(--ds-border-default)]">
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite sua mensagem..."
            className="min-h-[44px] max-h-[120px] resize-none"
            disabled={isLoading}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="h-[44px] px-4"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-[var(--ds-text-muted)] mt-2">
          Pressione Enter para enviar, Shift+Enter para nova linha
        </p>
      </div>
    </Card>
  )
}
