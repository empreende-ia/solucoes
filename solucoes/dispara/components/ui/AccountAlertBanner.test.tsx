import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { AccountAlert } from '@/app/api/account/alerts/route'

const state = vi.hoisted(() => ({
  criticalAlert: null as null | Record<string, unknown>,
  alerts: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/hooks/useAccountAlerts', () => ({
  useAccountAlerts: () => ({
    criticalAlert: state.criticalAlert,
    alerts: state.alerts,
    dismiss: vi.fn(),
    isDismissing: false,
  }),
}))

import { AccountAlertBanner } from './AccountAlertBanner'

function alert(partial: Partial<AccountAlert>): AccountAlert {
  return {
    id: 'a1',
    type: 'system',
    code: null,
    message: 'mensagem',
    details: null,
    dismissed: false,
    created_at: '2026-10-11T12:00:00.000Z',
    ...partial,
  }
}

beforeEach(() => {
  state.criticalAlert = null
  state.alerts = []
})

describe('AccountAlertBanner', () => {
  it("mostra o aviso 'meta_integration' quando não há alerta crítico", () => {
    const meta = alert({
      id: 'alert_meta_signature_1',
      type: 'meta_integration',
      message: 'App Secret salvo ainda não foi confirmado',
      details: JSON.stringify({ action: 'Confira o App Secret' }),
    })
    state.alerts = [meta]

    render(<AccountAlertBanner />)
    expect(screen.getByText('Integração com a Meta')).toBeTruthy()
    expect(screen.getByText('App Secret salvo ainda não foi confirmado')).toBeTruthy()
    expect(screen.getByText('Abrir Diagnósticos da Meta')).toBeTruthy()
  })

  it('CENÁRIO DO ACHADO: aviso de assinatura (mais recente) NÃO esconde um alerta auth real', () => {
    const realAuth = alert({ id: 'alert_190_1', type: 'auth', code: 190, message: 'Token expirado' })
    const meta = alert({
      id: 'alert_meta_signature_2',
      type: 'meta_integration',
      message: 'Requisições rejeitadas por assinatura inválida',
      created_at: '2026-10-11T13:00:00.000Z',
    })
    state.criticalAlert = realAuth
    state.alerts = [meta, realAuth]

    render(<AccountAlertBanner />)
    expect(screen.getByText('Token expirado')).toBeTruthy()
    expect(screen.queryByText('Requisições rejeitadas por assinatura inválida')).toBeNull()
  })

  it('outros tipos não críticos continuam fora do banner', () => {
    state.alerts = [alert({ type: 'system', message: 'erro qualquer' })]
    const { container } = render(<AccountAlertBanner />)
    expect(container.innerHTML).toBe('')
  })
})
