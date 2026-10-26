'use client'

import { useEffect, useMemo, useState } from 'react'
import { Save, Braces, AlertTriangle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

function safeStringify(obj: unknown): string {
  try {
    return JSON.stringify(obj ?? null, null, 2)
  } catch {
    return ''
  }
}

export function FlowJsonEditorPanel(props: {
  flowId: string
  flowName: string
  value: unknown
  isSaving: boolean
  onSave: (flowJson: unknown) => void
}) {
  const initialText = useMemo(() => safeStringify(props.value), [props.value])
  const [text, setText] = useState(initialText)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    // Quando o valor muda vindo do servidor, sincroniza (se o usuário não editou)
    if (!dirty) setText(initialText)
  }, [dirty, initialText])

  function tryParse(): unknown | null {
    try {
      const parsed = JSON.parse(text)
      setError(null)
      return parsed
    } catch (e) {
      setError(e instanceof Error ? e.message : 'JSON inválido')
      return null
    }
  }

  return (
    <div className="glass-panel p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-white font-semibold flex items-center gap-2">
            <Braces className="h-4 w-4" />
            JSON da MiniApp (Meta)
          </div>
          <div className="text-sm text-slate-400">
            Edite o Flow JSON canônico da MiniApp. Este é o conteúdo que será publicado na Meta.
          </div>
        </div>

        <Button
          type="button"
          variant="secondary"
          disabled={props.isSaving}
          onClick={() => {
            const parsed = tryParse()
            if (parsed == null) return
            props.onSave(parsed)
            setDirty(false)
          }}
        >
          <Save className="h-4 w-4" />
          Salvar JSON
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5" />
          <div>
            <div className="font-medium">JSON inválido</div>
            <div className="text-xs text-red-200/80 font-mono whitespace-pre-wrap">{error}</div>
          </div>
        </div>
      ) : null}

      <Textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setDirty(true)
        }}
        className="min-h-[360px] font-mono text-xs leading-5"
        spellCheck={false}
      />

      <div className="text-[11px] text-slate-500">
        MiniApp: <span className="font-mono">{props.flowName}</span> • {dirty ? 'alterações não salvas' : 'sincronizado'}
      </div>
    </div>
  )
}
