'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Play, ChevronRight, Smartphone } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { flowsService, type FlowRow } from '@/services/flowsService'
import { settingsService } from '@/services/settingsService'
import { cn } from '@/lib/utils'

export function SendFlowDialog(props: {
  flows?: FlowRow[]
  isLoadingFlows?: boolean
  onRefreshFlows?: () => void
  triggerLabel?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  prefillFlowId?: string
  hideTrigger?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [selectedDraftId, setSelectedDraftId] = useState<string>('')
  const [to, setTo] = useState('')
  const [flowId, setFlowId] = useState('')
  const [flowToken, setFlowToken] = useState('')
  const [body, setBody] = useState('Vamos começar?')
  const [ctaText, setCtaText] = useState('Abrir')
  const [footer, setFooter] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [hasTestContact, setHasTestContact] = useState(false)

  const flowsWithMetaId = useMemo(() => {
    const rows = props.flows || []
    return rows.filter((f) => !!f.meta_flow_id)
  }, [props.flows])

  const selectedDraft = useMemo(() => {
    if (!selectedDraftId) return null
    return (props.flows || []).find((f) => f.id === selectedDraftId) || null
  }, [props.flows, selectedDraftId])

  const isOpen = props.open ?? open
  const setOpenState = props.onOpenChange ?? setOpen

  // Carregar contato de teste
  useEffect(() => {
    if (!isOpen) return
    let isMounted = true
    settingsService
      .getTestContact()
      .then((contact) => {
        if (!isMounted) return
        if (contact?.phone) {
          if (!to.trim()) setTo(contact.phone)
          setHasTestContact(true)
        }
      })
      .catch(() => null)
    return () => {
      isMounted = false
    }
  }, [isOpen, to])

  // Gerar token automaticamente
  useEffect(() => {
    if (!isOpen) return
    if (flowToken.trim()) return
    if (!flowId.trim()) return
    const nonce = Math.random().toString(36).slice(2, 8)
    setFlowToken(`dispara:${flowId.trim()}:${Date.now()}:${nonce}`)
  }, [isOpen, flowId, flowToken])

  // Preencher flow se veio por prop
  useEffect(() => {
    if (!isOpen) return
    if (!props.prefillFlowId) return
    setFlowId(props.prefillFlowId)
    const found = (props.flows || []).find(
      (flow) => String(flow.meta_flow_id || '') === String(props.prefillFlowId)
    )
    if (found) setSelectedDraftId(found.id)
  }, [isOpen, props.prefillFlowId, props.flows])

  const handleSend = async () => {
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
      toast.success('MiniApp enviado com sucesso!')
      setOpenState(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao enviar MiniApp')
    } finally {
      setIsSending(false)
    }
  }

  const canSend = to.trim() && flowId.trim() && flowToken.trim()

  return (
    <Dialog open={isOpen} onOpenChange={setOpenState}>
      {!props.hideTrigger && (
        <DialogTrigger asChild>
          <Button variant="secondary">
            <Play className="h-4 w-4" />
            {props.triggerLabel || 'Testar MiniApp'}
          </Button>
        </DialogTrigger>
      )}

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <div className="p-1.5 rounded-lg bg-primary-500/10">
              <Smartphone className="h-4 w-4 text-primary-400" />
            </div>
            Testar MiniApp
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Campo principal: MiniApp */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-slate-200">MiniApp</Label>
            <Select
              value={selectedDraftId}
              onValueChange={(v) => {
                setSelectedDraftId(v)
                const found = (props.flows || []).find((f) => f.id === v)
                if (found?.meta_flow_id) {
                  setFlowId(found.meta_flow_id)
                  // Reset token para gerar um novo
                  setFlowToken('')
                }
              }}
            >
              <SelectTrigger className="w-full h-11 bg-[var(--ds-bg-elevated)] border-[var(--ds-border-subtle)]">
                <SelectValue
                  placeholder={
                    props.isLoadingFlows ? 'Carregando…' : 'Selecione um MiniApp'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {flowsWithMetaId.length === 0 ? (
                  <SelectItem value="__none__" disabled>
                    Nenhum MiniApp publicado na Meta
                  </SelectItem>
                ) : (
                  flowsWithMetaId.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      <span className="flex items-center gap-2">
                        <Smartphone className="h-3.5 w-3.5 text-slate-400" />
                        {f.name}
                      </span>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Campo principal: Telefone */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-slate-200">Enviar para</Label>
            <Input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="+55 11 99999-9999"
              className="h-11 bg-[var(--ds-bg-elevated)] border-[var(--ds-border-subtle)]"
            />
            {hasTestContact && to && (
              <p className="text-xs text-primary-400/80">
                ✓ Contato de teste configurado
              </p>
            )}
          </div>

          {/* Accordion: Opções avançadas */}
          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <CollapsibleTrigger className="flex items-center gap-2 w-full py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors group">
              <ChevronRight
                className={cn(
                  'h-4 w-4 transition-transform duration-200',
                  showAdvanced && 'rotate-90'
                )}
              />
              <span>Personalizar mensagem</span>
              {!showAdvanced && (
                <span className="text-xs text-slate-600 ml-auto">
                  body, botão, rodapé
                </span>
              )}
            </CollapsibleTrigger>

            <CollapsibleContent className="pt-3 space-y-4">
              <div className="p-4 rounded-xl bg-slate-900/30 border border-[var(--ds-border-subtle)] space-y-4">
                {/* Texto da mensagem */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-slate-400">
                    Texto da mensagem
                  </Label>
                  <Textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Vamos começar?"
                    className="min-h-[60px] bg-[var(--ds-bg-elevated)] border-[var(--ds-border-subtle)] resize-none"
                  />
                </div>

                {/* Texto do botão */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-slate-400">
                    Texto do botão
                  </Label>
                  <Input
                    value={ctaText}
                    onChange={(e) => setCtaText(e.target.value)}
                    placeholder="Abrir"
                    className="h-9 bg-[var(--ds-bg-elevated)] border-[var(--ds-border-subtle)]"
                  />
                </div>

                {/* Rodapé */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-slate-400">
                    Rodapé{' '}
                    <span className="text-slate-600 font-normal">(opcional)</span>
                  </Label>
                  <Input
                    value={footer}
                    onChange={(e) => setFooter(e.target.value)}
                    placeholder="Texto pequeno no rodapé"
                    className="h-9 bg-[var(--ds-bg-elevated)] border-[var(--ds-border-subtle)]"
                  />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* Botão de enviar - centralizado e proeminente */}
        <div className="pt-2">
          <Button
            onClick={handleSend}
            disabled={isSending || !canSend}
            className="w-full h-11 bg-primary-600 hover:bg-primary-500 text-white font-medium"
          >
            {isSending ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Enviando...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Play className="h-4 w-4" />
                Enviar Teste
              </span>
            )}
          </Button>

          {!canSend && selectedDraftId && to && (
            <p className="text-xs text-amber-400/80 text-center mt-2">
              Aguardando configuração do MiniApp...
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
