'use client'

import * as React from 'react'
import { Wand2 } from 'lucide-react'
import { metaDiagnosticsService, type Simulate10033Response } from '@/services/metaDiagnosticsService'
import { StatusBadge } from '../StatusBadge'
import { Pill } from '../Pill'
import { formatJsonMaybe } from '../utils'
import { Container } from '@/components/ui/container'

export function Simulate10033Card() {
  const [isRunning, setIsRunning] = React.useState(false)
  const [result, setResult] = React.useState<Simulate10033Response | null>(null)

  const run = React.useCallback(async () => {
    setIsRunning(true)
    try {
      const response = await metaDiagnosticsService.simulate10033()
      setResult(response)
    } catch (e) {
      setResult({
        ok: false,
        error: 'Falha ao simular (rede/navegador).',
        details: { message: e instanceof Error ? e.message : String(e) },
      })
    } finally {
      setIsRunning(false)
    }
  }, [])

  const normalized = (result as { result?: { normalizedError?: Record<string, unknown> } })?.result?.normalizedError || null

  return (
    <Container variant="glass" padding="md">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs text-[var(--ds-text-muted)]">Simulador</div>
          <div className="mt-2 text-sm text-[var(--ds-text-primary)] font-medium">Reproduzir erro 100/33 (sem enviar mensagem)</div>
          <div className="mt-2 text-sm text-[var(--ds-text-secondary)]">
            Util pra aula/suporte: dispara o erro classico de "ID/permissao" sem risco de mandar mensagem.
          </div>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={isRunning}
          className="px-3 py-2 rounded-lg bg-[var(--ds-bg-hover)] text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] border border-[var(--ds-border-subtle)] hover:border-[var(--ds-border-default)] transition-all text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"
          title="Executa um POST invalido em /{WABA_ID}/messages para gerar 100/33"
        >
          <Wand2 size={14} /> {isRunning ? 'Simulando...' : 'Simular agora'}
        </button>
      </div>

      {result && (
        <div className="mt-4 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-subtle)] rounded-xl p-4">
          {result.ok === false ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-[var(--ds-text-primary)] font-semibold">Falhou</div>
                <StatusBadge status="fail" />
              </div>
              <div className="mt-2 text-sm text-[var(--ds-text-primary)]">{result.error}</div>
              {result.details && (
                <pre className="mt-3 text-xs text-[var(--ds-text-secondary)] overflow-auto whitespace-pre-wrap">{formatJsonMaybe(result.details)}</pre>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-[var(--ds-text-primary)] font-semibold">Resultado</div>
                <StatusBadge status="pass" />
              </div>
              <div className="mt-2 text-sm text-[var(--ds-text-primary)]">
                Endpoint testado: <span className="font-mono">/{'{'}WABA_ID{'}'}/messages</span> · status HTTP: <span className="font-mono">{String((result as { attempt?: { status?: number } })?.attempt?.status ?? '—')}</span>
              </div>
              {normalized?.message && (
                <div className="mt-3 text-sm text-[var(--ds-text-primary)]">
                  <div><span className="text-[var(--ds-text-secondary)]">Mensagem:</span> {String(normalized.message)}</div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <Pill tone="neutral">code: {String(normalized.code ?? '—')}</Pill>
                    <Pill tone="neutral">subcode: {String(normalized.subcode ?? '—')}</Pill>
                    {normalized.fbtraceId ? <Pill tone="neutral">fbtrace_id: {String(normalized.fbtraceId)}</Pill> : null}
                  </div>
                </div>
              )}
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-[var(--ds-text-primary)] underline">Ver resposta bruta da Meta</summary>
                <pre className="mt-3 text-xs text-[var(--ds-text-secondary)] overflow-auto whitespace-pre-wrap">{formatJsonMaybe((result as { result?: unknown })?.result || null)}</pre>
              </details>
            </>
          )}
        </div>
      )}
    </Container>
  )
}
