'use client'

import React from 'react'
import { Container } from '@/components/ui/container'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spec } from '../types'

interface AuthenticationPanelProps {
  spec: Spec
  update: (patch: Partial<Spec>) => void
}

export function AuthenticationPanel({ spec, update }: AuthenticationPanelProps) {
  const handleTtlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    update({
      message_send_ttl_seconds: e.target.value ? Number(e.target.value) : undefined,
    })
  }

  const handleSecurityChange = (v: string) => {
    update({ add_security_recommendation: v === 'true' })
  }

  const handleExpirationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    update({
      code_expiration_minutes: e.target.value ? Number(e.target.value) : undefined,
    })
  }

  return (
    <Container variant="subtle" padding="md" className="space-y-3">
      <div className="text-sm font-semibold text-[var(--ds-text-primary)]">Autenticacao (Auth)</div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <label className="text-xs font-medium text-[var(--ds-text-secondary)]">message_send_ttl_seconds</label>
          <Input
            value={spec.message_send_ttl_seconds ?? ''}
            onChange={handleTtlChange}
            className="bg-[var(--ds-bg-elevated)] border-[var(--ds-border-default)] text-[var(--ds-text-primary)]"
            placeholder="ex: 300"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-[var(--ds-text-secondary)]">add_security_recommendation</label>
          <Select
            value={String(!!spec.add_security_recommendation)}
            onValueChange={handleSecurityChange}
          >
            <SelectTrigger className="w-full bg-[var(--ds-bg-elevated)] border-[var(--ds-border-default)] text-[var(--ds-text-primary)]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">true</SelectItem>
              <SelectItem value="false">false</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-[var(--ds-text-secondary)]">code_expiration_minutes</label>
          <Input
            value={spec.code_expiration_minutes ?? ''}
            onChange={handleExpirationChange}
            className="bg-[var(--ds-bg-elevated)] border-[var(--ds-border-default)] text-[var(--ds-text-primary)]"
            placeholder="ex: 10"
          />
        </div>
      </div>
    </Container>
  )
}
