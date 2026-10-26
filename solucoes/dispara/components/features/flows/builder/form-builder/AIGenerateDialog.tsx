'use client'

import React, { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import { FlowFormSpecV1 } from '@/lib/flow-form'
import { AIGenerateDialogProps } from './types'
import { flowsService } from '@/services/flowsService'

export function AIGenerateDialog({
  open,
  onOpenChange,
  flowName,
  onGenerated,
  onActionComplete,
}: AIGenerateDialogProps) {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)

  const handleGenerate = async () => {
    if (loading) return
    if (!prompt.trim() || prompt.trim().length < 10) {
      toast.error('Descreva melhor o que você quer (mínimo 10 caracteres)')
      return
    }

    setLoading(true)
    try {
      const generatedForm = (await flowsService.generateForm({
        prompt: prompt.trim(),
        titleHint: flowName,
        maxQuestions: 10,
      })) as FlowFormSpecV1 | null

      if (!generatedForm) throw new Error('Resposta inválida da IA (form ausente)')

      onGenerated(generatedForm)
      toast.success('Formulário gerado! Revise e salve quando estiver pronto.')
      onOpenChange(false)
      onActionComplete?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao gerar formulário com IA')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-950 border-[var(--ds-border-subtle)] text-white sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Gerar MiniApp com IA</DialogTitle>
          <DialogDescription className="text-slate-400">
            Escreva em linguagem natural o que você quer coletar. A IA vai sugerir as perguntas e
            você pode editar antes de salvar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label className="block text-xs text-slate-400">O que você quer no formulário?</label>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="min-h-28 bg-slate-900 border-[var(--ds-border-subtle)] text-white"
            placeholder='Ex: "Quero um formulário de pré-cadastro para uma turma. Pergunte nome, telefone, e-mail, cidade, faixa de horário preferida e um opt-in para receber mensagens."'
          />
          <div className="text-[11px] text-slate-500">
            Observação: isso substitui as perguntas atuais do modo Formulário (você pode desfazer
            com Ctrl+Z apenas se ainda não salvou).
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="border-[var(--ds-border-subtle)] bg-slate-900 hover:bg-[var(--ds-bg-hover)]"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleGenerate}
            disabled={loading || prompt.trim().length < 10}
          >
            {loading ? 'Gerando…' : 'Gerar perguntas'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
