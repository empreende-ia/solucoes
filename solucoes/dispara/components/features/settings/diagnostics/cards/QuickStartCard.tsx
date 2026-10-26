'use client'

import * as React from 'react'
import { ListChecks, Wand2 } from 'lucide-react'
import type { MetaDiagnosticsAction } from '@/services/metaDiagnosticsService'
import type { MetaDiagnosticsCheck } from '../types'
import { StatusBadge } from '../StatusBadge'
import { isProblemStatus, bestApiAction, firstNextSteps, scrollToCheck, getFriendlyCopy } from '../utils'
import { Container } from '@/components/ui/container'

export interface QuickStartCardProps {
  checks: MetaDiagnosticsCheck[]
  onRunAction: (a: MetaDiagnosticsAction) => void
  isActing: boolean
  lockedNow: boolean
  lockedReason?: string
  simpleMode?: boolean
}

export function QuickStartCard(props: QuickStartCardProps) {
  const problems = React.useMemo(() => {
    const p = (props.checks || []).filter((c) => isProblemStatus(c.status))
    // ja vem ordenado pelo controller, mas garantimos stable.
    return p
  }, [props.checks])

  const items = problems.slice(0, 3)

  if (problems.length === 0) {
    return (
      <Container variant="glass" padding="md">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs text-[var(--ds-text-muted)]">O que fazer agora</div>
            <div className="mt-2 text-sm text-[var(--ds-text-primary)] font-medium">Tudo certo por aqui</div>
            <div className="mt-2 text-sm text-[var(--ds-text-secondary)]">
              Nao encontramos falhas/alertas no diagnostico. Se ainda assim "nao envia", use o Support Packet e envie pro suporte.
            </div>
          </div>
          <div className="text-[var(--ds-text-secondary)]">
            <ListChecks size={18} />
          </div>
        </div>
      </Container>
    )
  }

  return (
    <Container variant="glass" padding="md">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs text-[var(--ds-text-muted)]">O que fazer agora</div>
          <div className="mt-2 text-sm text-[var(--ds-text-primary)] font-medium">Siga estes passos (ordem recomendada)</div>
          <div className="mt-2 text-sm text-[var(--ds-text-secondary)]">
            Pegamos os itens que mais destravam alunos (falhas/atencoes) e colocamos em ordem.
          </div>
        </div>
        <div className="text-[var(--ds-text-secondary)]">
          <ListChecks size={18} />
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {items.map((c, idx) => {
          const action = bestApiAction(c.actions)
          const steps = firstNextSteps(c.details as Record<string, unknown> | undefined)
          const friendly = props.simpleMode ? getFriendlyCopy(c) : { title: c.title, message: c.message }
          return (
            <div key={c.id} className="bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-subtle)] rounded-xl p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-xs text-[var(--ds-text-muted)]">Passo {idx + 1}</div>
                    <StatusBadge status={c.status} />
                  </div>
                  <div className="mt-2 text-sm text-[var(--ds-text-primary)] font-semibold truncate">{friendly.title}</div>
                  <div className="mt-1 text-sm text-[var(--ds-text-secondary)]">{friendly.message}</div>

                  {steps.length > 0 && (
                    <ul className="mt-2 list-disc pl-5 space-y-1 text-sm text-[var(--ds-text-primary)]">
                      {steps.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="shrink-0 flex flex-col items-end gap-2">
                  {action && (
                    <button
                      type="button"
                      onClick={() => props.onRunAction(action)}
                      disabled={props.isActing || props.lockedNow}
                      className="px-3 py-2 rounded-lg bg-primary-500 hover:bg-primary-400 text-black font-medium transition-colors text-sm inline-flex items-center gap-2 disabled:opacity-50"
                      title={props.lockedNow ? (props.lockedReason || 'Bloqueado pela Meta') : undefined}
                    >
                      <Wand2 size={14} /> {action.label}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => scrollToCheck(c.id)}
                    className="px-3 py-2 rounded-lg bg-[var(--ds-bg-hover)] text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] border border-[var(--ds-border-subtle)] hover:border-[var(--ds-border-default)] transition-all text-sm font-medium"
                  >
                    Ver detalhes
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {problems.length > 3 && (
        <div className="mt-4 text-xs text-[var(--ds-text-muted)]">
          Mais itens: {problems.length - 3}. Use o filtro "Problemas" ou "Com acoes" abaixo.
        </div>
      )}
    </Container>
  )
}
