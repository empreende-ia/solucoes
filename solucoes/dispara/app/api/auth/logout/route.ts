/**
 * Logout API
 *
 * POST: Logout and clear session
 *
 * Também apaga o cookie de atendente (`dispara_attendant`): se o dono abriu um link
 * de atendente neste navegador para testar, sair do dashboard não pode deixar a PWA
 * /atendimento aberta para a próxima pessoa no mesmo computador.
 *
 * Só mexe em cookies quando a request vem da própria aplicação. A rota é pública e um
 * Route Handler não tem a checagem de Origin das Server Actions: um form POST
 * auto-submetido por outro site (navegação top-level) recebe o Set-Cookie e apagaria o
 * cookie do atendente — que só volta com um novo link ?token= do dono — e o do dono.
 * - Sec-Fetch-Site/Origin de outra origem → 403, sem Set-Cookie.
 * - Sem esses headers (cliente fora do browser) → só encerra se o cookie de sessão do
 *   dono veio junto e é válido (SameSite=Lax não o envia num POST de outro site).
 * O logout do dashboard (lib/logout-client.ts) é um fetch same-origin e passa direto.
 */

import { NextRequest, NextResponse } from 'next/server'
import { ATTENDANT_COOKIE_NAME } from '@/lib/attendant-auth'
import { logoutUser, validateSession } from '@/lib/user-auth'
import { classifyRequestOrigin } from '@/app/api/auth/logout/request-origin'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(request: NextRequest) {
  try {
    const origin = classifyRequestOrigin(request)
    if (origin === 'cross-origin') {
      return NextResponse.json({ error: 'Origem não permitida' }, { status: 403, headers: NO_STORE })
    }
    if (origin === 'unknown' && !(await validateSession())) {
      // Nenhuma sessão do dono para encerrar e nada que prove a origem: não apaga cookies.
      return NextResponse.json({ success: true }, { headers: NO_STORE })
    }

    await logoutUser()

    const response = NextResponse.json({ success: true }, { headers: NO_STORE })
    response.cookies.set(ATTENDANT_COOKIE_NAME, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    })
    return response

  } catch (error) {
    console.error('Logout error:', error)
    return NextResponse.json(
      { error: 'Erro ao fazer logout' },
      { status: 500 }
    )
  }
}
