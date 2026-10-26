'use client'

import { formatJsonMaybe } from './utils'

export interface NextStepsProps {
  value: unknown
}

export function NextSteps({ value }: NextStepsProps) {
  const steps = Array.isArray(value) ? (value as unknown[]) : null
  if (!steps || steps.length === 0) return null

  return (
    <div className="mt-3">
      <div className="text-xs text-[var(--ds-text-secondary)]">Passo a passo sugerido</div>
      <ul className="mt-2 list-disc pl-5 space-y-1 text-sm text-[var(--ds-text-primary)]">
        {steps.map((s, idx) => (
          <li key={idx}>{typeof s === 'string' ? s : formatJsonMaybe(s)}</li>
        ))}
      </ul>
    </div>
  )
}
