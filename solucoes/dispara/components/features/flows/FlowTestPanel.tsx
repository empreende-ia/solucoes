'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ChevronDown, RefreshCw, Send } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { flowsService, type FlowRow } from '@/services/flowsService'
import { settingsService } from '@/services/settingsService'

export function FlowTestPanel({
  flows,
  isLoadingFlows,
  onRefreshFlows,
  prefillFlowId,
}: {
  flows: FlowRow[]
  isLoadingFlows?: boolean
  onRefreshFlows?: () => void
  prefillFlowId?: string
}) {
  const [selectedDraftId, setSelectedDraftId] = useState('')
  const [to, setTo] = useState('')
  const [flowId, setFlowId] = useState('')
  const [flowToken, setFlowToken] = useState('')
  const [body, setBody] = useState('Vamos começar?')
  const [ctaText, setCtaText] = useState('Abrir')
  const [footer, setFooter] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [isSending, setIsSending] = useState(false)

  const flowsWithMetaId = useMemo(() => {
    const rows = flows || []
    return rows.filter((f) => !!f.meta_flow_id)
  }, [flows])

  useEffect(() => {
    if (!prefillFlowId) return
    setFlowId(prefillFlowId)
    const found = flows.find((f) => String(f.meta_flow_id || '') === String(prefillFlowId))
    if (found) setSelectedDraftId(found.id)
  }, [prefillFlowId, flows])

  useEffect(() => {
    let isMounted = true
    settingsService
      .getTestContact()
      .then((contact) => {
        if (!isMounted || !contact?.phone || to.trim()) return
        setTo(contact.phone)
      })
      .catch(() => null)
    return () => {
      isMounted = false
    }
  }, [to])

  useEffect(() => {
    if (flowToken.trim()) return
    if (!flowId.trim()) return
    const nonce = Math.random().toString(36).slice(2, 8)
    setFlowToken(`dispara:${flowId.trim()}:${Date.now()}:${nonce}`)
  }, [flowId, flowToken])

  return (
    <div id="flow-test-panel" className="rounded-2xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)] p-6 shadow-[0_12px_30px_rgba(0,0,0,0.35)] space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-white">3. Testar</div>
          <div className="text-xs text-slate-400 mt-1">Envie um MiniApp real para validar a experiência.</div>
        </div>
        {onRefreshFlows && (
          <Button
            type="button"
            variant="ghost"
            onClick={onRefreshFlows}
            disabled={!!isLoadingFlows}
            className="text-slate-300"
          >
            <RefreshCw className={cn('h-4 w-4', isLoadingFlows ? 'animate-spin' : '')} />
            Atualizar
          </Button>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-300">MiniApp do Builder (opcional)</label>
        <Select
          value={selectedDraftId}
          onValueChange={(v) => {
            setSelectedDraftId(v)
            const found = flowsWithMetaId.find((f) => f.id === v)
            if (found?.meta_flow_id) setFlowId(String(found.meta_flow_id))
          }}
        >
          <SelectTrigger className="w-full bg-[var(--ds-bg-surface)]/30 border-[var(--ds-border-subtle)] text-white">
            <SelectValue placeholder={isLoadingFlows ? 'Carregando…' : 'Escolha um MiniApp do Builder'} />
          </SelectTrigger>
          <SelectContent>
            {flowsWithMetaId.length === 0 ? (
              <SelectItem value="__none__" disabled>
                Nenhum MiniApp com ID da Meta
              </SelectItem>
            ) : (
              flowsWithMetaId.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name} · {String(f.meta_flow_id)}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <div className="text-[11px] text-slate-500">Selecionar um MiniApp preenche automaticamente o ID da MiniApp.</div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-300">Telefone (to)</label>
          <Input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="Ex: +5511999999999"
            className="bg-[var(--ds-bg-surface)]/30 border-[var(--ds-border-subtle)] text-white"
          />
          <div className="text-[11px] text-slate-500">Aceita números com ou sem + (E.164).</div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-300">ID da MiniApp (Meta)</label>
          <Input
            value={flowId}
            onChange={(e) => setFlowId(e.target.value)}
            placeholder="Ex: 1234567890"
            className="bg-[var(--ds-bg-surface)]/30 border-[var(--ds-border-subtle)] text-white"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-300">Token da MiniApp</label>
          <Input
            value={flowToken}
            onChange={(e) => setFlowToken(e.target.value)}
            placeholder="Cole o token da MiniApp"
            className="bg-[var(--ds-bg-surface)]/30 border-[var(--ds-border-subtle)] text-white"
          />
          <div className="text-[11px] text-slate-500">Esse token vem da configuração da MiniApp na Meta.</div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowAdvanced((prev) => !prev)}
        className="text-xs text-slate-400 hover:text-slate-200 inline-flex items-center gap-1"
        aria-expanded={showAdvanced}
      >
        Opções avançadas
        <ChevronDown className={cn('w-4 h-4 transition-transform', showAdvanced ? 'rotate-180' : '')} />
      </button>

      {showAdvanced && (
        <div className="grid grid-cols-1 gap-3">
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-300">Texto da mensagem</label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="bg-[var(--ds-bg-surface)]/30 border-[var(--ds-border-subtle)] text-white"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-300">Texto do botão</label>
            <Input
              value={ctaText}
              onChange={(e) => setCtaText(e.target.value)}
              placeholder="Abrir"
              className="bg-[var(--ds-bg-surface)]/30 border-[var(--ds-border-subtle)] text-white"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-300">Rodapé</label>
            <Textarea
              value={footer}
              onChange={(e) => setFooter(e.target.value)}
              placeholder="Opcional"
              className="bg-[var(--ds-bg-surface)]/30 border-[var(--ds-border-subtle)] text-white"
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          onClick={async () => {
            try {
              setIsSending(true)
              await flowsService.send({
                to,
                flowId,
                flowToken,
                body,
                ctaText,
                footer: footer.trim() || undefined,
                flowMessageVersion: '3',
              })
              toast.success('MiniApp enviado')
            } catch (e) {
              toast.error(e instanceof Error ? e.message : 'Falha ao enviar MiniApp')
            } finally {
              setIsSending(false)
            }
          }}
          disabled={isSending || !to.trim() || !flowId.trim() || !flowToken.trim()}
          className="bg-primary-500 text-black hover:bg-primary-400"
        >
          <Send className="h-4 w-4" />
          {isSending ? 'Enviando…' : 'Enviar teste'}
        </Button>
        <div className="text-[11px] text-slate-500">Os testes aparecem em "Submissões recentes".</div>
      </div>
    </div>
  )
}
