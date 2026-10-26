'use client'

import React from 'react'
import { AlertTriangle } from 'lucide-react'

import { IssuesAlertProps } from './types'

export function IssuesAlert({ issues }: IssuesAlertProps) {
  if (issues.length === 0) {
    return null
  }

  return (
    <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 flex items-start gap-2">
      <AlertTriangle className="h-4 w-4 mt-0.5" />
      <div>
        <div className="font-medium">Ajustes necessários</div>
        <ul className="mt-1 list-disc pl-4 text-[11px] text-amber-200/80">
          {issues.slice(0, 6).map((issue, idx) => (
            <li key={`${issue}__${idx}`}>{issue}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
