'use client'

import { useEffect, useMemo, useState } from 'react'
import { Wand2, Loader2 } from 'lucide-react'

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export function CreateFlowWithAIDialog(props: {
  isCreating: boolean
  onCreate: (input: { name: string; prompt: string }) => Promise<any>
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')

  useEffect(() => {
    if (!open) return
    // foco: não limpamos automaticamente para permitir iterar
  }, [open])

  const canSubmit = useMemo(() => {
    return name.trim().length >= 3 && prompt.trim().length >= 10 && !props.isCreating
  }, [name, prompt, props.isCreating])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" disabled={props.isCreating}>
          <Wand2 className="h-4 w-4" />
          Criar com IA
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-xl bg-slate-950 border-[var(--ds-border-subtle)] text-white">
        <DialogHeader>
          <DialogTitle>Criar MiniApp com IA</DialogTitle>
          <DialogDescription className="text-slate-400">
            Descreva o que você quer coletar. A IA sugere as perguntas e a gente já cria o MiniApp no modo “Formulário”.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="flow_ai_name">Nome</Label>
            <Input
              id="flow_ai_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: onboarding_lead"
            />
            <div className="text-[11px] text-slate-500">Dica: use snake_case e evite espaços.</div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="flow_ai_prompt">O que você quer no formulário?</Label>
            <Textarea
              id="flow_ai_prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-28 bg-slate-900 border-[var(--ds-border-subtle)] text-white"
              placeholder="Ex: Quero captar nome, telefone, e-mail, cidade, interesse (imóvel/financiamento), melhor horário para contato e um opt-in para receber novidades."
            />
            <div className="text-[11px] text-slate-500">Mínimo: 10 caracteres. Quanto mais contexto, melhor.</div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-[var(--ds-border-subtle)] bg-slate-900 hover:bg-[var(--ds-bg-hover)]"
            onClick={() => setOpen(false)}
            disabled={props.isCreating}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={async () => {
              const n = name.trim()
              const p = prompt.trim()
              if (!n || !p) return
              try {
                await props.onCreate({ name: n, prompt: p })
                setOpen(false)
                setName('')
                setPrompt('')
              } catch {
                // Errors handled by mutation toasts.
              }
            }}
            disabled={!canSubmit}
          >
            {props.isCreating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Criando…
              </>
            ) : (
              'Criar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
