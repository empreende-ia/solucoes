import { NextRequest, NextResponse } from 'next/server'
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'
import { getMetaAppCredentials } from '@/lib/meta-app-credentials'
import { fetchWithTimeout, safeJson } from '@/lib/server-http'

type GraphApiError = {
  message?: string
  type?: string
  code?: number
  error_subcode?: number
  fbtrace_id?: string
}

type GraphGetResult<T> =
  | { ok: true; json: T }
  | { ok: false; json: any; graphError: GraphApiError | null }

async function graphGetJson<T>(
  path: string,
  accessToken: string,
  params?: Record<string, string | number | boolean | undefined | null>
): Promise<GraphGetResult<T>> {
  const sp = new URLSearchParams()
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue
      sp.set(k, String(v))
    }
  }

  const url = `https://graph.facebook.com/v24.0/${path.replace(/^\//, '')}${sp.toString() ? `?${sp.toString()}` : ''}`
  const res = await fetchWithTimeout(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
    timeoutMs: 4500,
  })
  const json = (await safeJson<any>(res)) ?? {}
  if (!res.ok) {
    return { ok: false, json, graphError: normalizeGraphApiError(json) }
  }
  return { ok: true, json }
}

async function wabaHasPhoneNumber(opts: {
  wabaId: string
  phoneNumberId: string
  accessToken: string
}): Promise<{
  ok: boolean
  matches: boolean | null
  graphError: GraphApiError | null
  raw?: any
}> {
  const result = await graphGetJson<{ data?: Array<{ id?: string }> }>(
    `/${encodeURIComponent(opts.wabaId)}/phone_numbers`,
    opts.accessToken,
    { fields: 'id', limit: 200 }
  )

  if (!result.ok) {
    return {
      ok: false,
      matches: null,
      graphError: result.graphError,
      raw: (result.json as any)?.error || result.json,
    }
  }

  const ids = Array.isArray((result.json as any)?.data) ? (result.json as any).data : []
  const matches = ids.some((x: any) => String(x?.id || '') === String(opts.phoneNumberId))
  return { ok: true, matches, graphError: null }
}

function normalizeGraphApiError(payload: any): GraphApiError | null {
  const err = payload?.error || payload
  if (!err || typeof err !== 'object') return null
  return {
    message: typeof err.message === 'string' ? err.message : undefined,
    type: typeof err.type === 'string' ? err.type : undefined,
    code: typeof err.code === 'number' ? err.code : undefined,
    error_subcode: typeof err.error_subcode === 'number' ? err.error_subcode : undefined,
    fbtrace_id: typeof err.fbtrace_id === 'string' ? err.fbtrace_id : undefined,
  }
}

function buildConnectionTroubleshooting(opts: {
  graphError: GraphApiError | null
  phoneNumberId: string
  businessAccountIdInput?: string
}) {
  const ge = opts.graphError
  const msg = (ge?.message || '').toLowerCase()

  // Campo inexistente (mudança de API / query inválida)
  if (msg.includes('tried accessing nonexisting field') && msg.includes('whatsapp_business_account')) {
    return {
      kind: 'invalid_fields' as const,
      title: 'Consulta inválida (campo não existe no Graph)'
      ,
      summary:
        'A query pediu um campo que não existe nesse tipo de objeto (isso pode acontecer por mudança de versão do Graph API ou exemplo desatualizado).',
      nextSteps: [
        'Tente novamente sem o campo whatsapp_business_account e valide o vínculo Phone↔WABA via /{WABA_ID}/phone_numbers.',
        'No Dispara, use o Diagnóstico Meta (settings/meta-diagnostics) para verificar acesso ao Phone e ao WABA.',
      ],
      docs: 'https://developers.facebook.com/docs/graph-api',
    }
  }

  // Meta-side: App arquivado/desativado
  if (msg.includes('api access deactivated') || msg.includes('to unarchive') || msg.includes('unarchive')) {
    return {
      kind: 'meta_app_deactivated' as const,
      title: 'API da Meta desativada (App arquivado)'
      ,
      summary:
        'A Meta desativou o acesso à API para o App que emitiu este token (geralmente porque o App foi arquivado).',
      nextSteps: [
        'Acesse https://developers.facebook.com/apps e faça login.',
        'Vá em “My Apps” e verifique se o App está “Archived”.',
        'Desarquive/reative o App e gere um novo token.',
        'Depois, volte no Dispara e clique em “Testar Conexão”.',
      ],
      docs: 'https://developers.facebook.com/docs/graph-api',
    }
  }

  // Token inválido/expirado
  if (ge?.code === 190 || msg.includes('error validating access token') || msg.includes('session has expired')) {
    return {
      kind: 'token_invalid' as const,
      title: 'Token inválido ou expirado',
      summary:
        'O token foi rejeitado pela Meta (expirado/invalidado ou copiado incorretamente).',
      nextSteps: [
        'Gere um novo token (recomendado: System User no Business Manager).',
        'Garanta os escopos whatsapp_business_management e whatsapp_business_messaging.',
        'Atribua os ativos (WABA + Phone Number) ao System User antes de gerar o token.',
      ],
      docs: 'https://developers.facebook.com/docs/facebook-login/access-tokens/debugging-and-error-handling',
    }
  }

  // Erro clássico: objeto não existe / sem permissão / operação não suportada
  // (frequente quando o usuário colocou o ID errado ou não atribuiu o ativo ao token)
  const isUnsupportedGet = msg.includes('unsupported get request')
  const isObjMissingOrNoPerm = isUnsupportedGet || ge?.code === 100 || ge?.error_subcode === 33
  if (isObjMissingOrNoPerm) {
    const providedWaba = (opts.businessAccountIdInput || '').trim()
    return {
      kind: 'object_missing_or_no_permission' as const,
      title: 'ID incorreto ou token sem acesso ao ativo',
      summary:
        'A Meta não conseguiu carregar o objeto informado (Phone Number ID). Isso acontece quando o ID está errado, o token não tem acesso ao ativo, ou o App/token não tem permissão para essa operação.',
      nextSteps: [
        `Confirme se o Phone Number ID está correto (o valor atual é ${opts.phoneNumberId}).`,
        providedWaba ? `Confirme se o WABA ID está correto (o valor atual é ${providedWaba}).` : 'Confirme também o WABA ID (Business Account ID).',
        'Se estiver usando System User, atribua os ativos (WABA + Phone Number) ao System User no Business Manager.',
        'Gere novamente o token com os escopos whatsapp_business_management e whatsapp_business_messaging.',
        'Depois, rode “Diagnóstico Meta” em /settings/meta-diagnostics para ver “provas” (WABA acessível, Phone acessível, etc.).',
      ],
      docs: 'https://developers.facebook.com/docs/whatsapp/cloud-api',
    }
  }

  return {
    kind: 'unknown' as const,
    title: 'Falha ao testar conexão',
    summary: 'A Meta rejeitou a chamada, mas não conseguimos classificar o motivo com segurança.',
    nextSteps: [
      'Abra o Diagnóstico Meta em /settings/meta-diagnostics e copie o “Support Packet”.',
      'Verifique se o token tem os escopos whatsapp_business_management e whatsapp_business_messaging.',
      'Verifique se o token tem acesso ao WABA e ao Phone Number configurados.',
    ],
    docs: 'https://developers.facebook.com/docs/graph-api',
  }
}

function isMaskedToken(token: unknown): boolean {
  if (typeof token !== 'string') return false
  const t = token.trim()
  return t === '' || t === '***configured***' || t === '••••••••••'
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const phoneNumberIdInput = (body as any)?.phoneNumberId as string | undefined
    const businessAccountIdInput = (body as any)?.businessAccountId as string | undefined
    const accessTokenInput = (body as any)?.accessToken as string | undefined

    // Se o frontend não tem token (ex: já conectado e mascarado), usamos credenciais salvas.
    let phoneNumberId = (phoneNumberIdInput || '').trim()
    let businessAccountId = (businessAccountIdInput || '').trim()
    let accessToken = (accessTokenInput || '').trim()

    const shouldUseStoredCreds = !phoneNumberId || isMaskedToken(accessToken)

    if (shouldUseStoredCreds) {
      const creds = await getWhatsAppCredentials()
      if (!creds) {
        return NextResponse.json(
          { ok: false, error: 'Credenciais do WhatsApp não configuradas' },
          { status: 400 }
        )
      }
      phoneNumberId = creds.phoneNumberId
      businessAccountId = creds.businessAccountId
      accessToken = creds.accessToken
    }

    if (!phoneNumberId || !accessToken) {
      return NextResponse.json(
        { ok: false, error: 'Preencha Phone Number ID e Access Token para testar.' },
        { status: 400 }
      )
    }

    // 1) Teste real na Graph API: puxa campos leves do Phone e confirma autorização.
    const phoneRes = await graphGetJson<any>(
      `/${encodeURIComponent(phoneNumberId)}`,
      accessToken,
      { fields: 'display_phone_number,verified_name,quality_rating' }
    )

    if (!phoneRes.ok) {
      const ge = phoneRes.graphError
      const message = ge?.message || 'Meta API rejeitou as credenciais'
      const code = ge?.code
      const errorSubcode = ge?.error_subcode
      const troubleshooting = buildConnectionTroubleshooting({
        graphError: ge,
        phoneNumberId,
        businessAccountIdInput,
      })

      return NextResponse.json(
        {
          ok: false,
          error: message,
          code,
          errorSubcode,
          details: {
            hintTitle: troubleshooting.title,
            hint: troubleshooting.summary,
            nextSteps: troubleshooting.nextSteps,
            docs: troubleshooting.docs,
            fbtraceId: ge?.fbtrace_id || null,
            raw: (phoneRes.json as any)?.error || phoneRes.json,
          },
        },
        { status: 401 }
      )
    }

    const phoneData = phoneRes.json

    // 2) Valida ou tenta inferir WABA
    const businessIdProvided = (businessAccountIdInput || '').trim()

    let wabaId: string | null = null
    let wabaCandidates: string[] = []
    let wabaInference: { attempted: boolean; method: 'provided' | 'debug_token' | 'none'; note?: string } = {
      attempted: false,
      method: 'none',
    }

    if (businessIdProvided) {
      wabaInference = { attempted: true, method: 'provided' }

      // Validar formato do WABA (deve ser numérico, 10-25 dígitos)
      if (!/^\d{10,25}$/.test(businessIdProvided)) {
        return NextResponse.json(
          {
            ok: false,
            error: 'O Business Account ID (WABA) tem formato inválido. Deve conter apenas números.',
            details: {
              providedBusinessAccountId: businessIdProvided,
              hint: 'O WABA ID geralmente tem 15-20 dígitos numéricos. Verifique no Meta Business Manager.',
            },
          },
          { status: 400 }
        )
      }

      const link = await wabaHasPhoneNumber({
        wabaId: businessIdProvided,
        phoneNumberId,
        accessToken,
      })

      if (link.ok && link.matches === true) {
        wabaId = businessIdProvided
      } else if (link.ok && link.matches === false) {
        return NextResponse.json(
          {
            ok: false,
            error: 'O Phone Number ID não pertence ao WABA informado.',
            details: {
              providedBusinessAccountId: businessIdProvided,
              phoneNumberId,
              hint: 'Verifique se o Business Account ID está correto. Pode ser que você tenha copiado o Phone Number ID no lugar errado.',
            },
          },
          { status: 400 }
        )
      } else {
        // Não conseguimos validar o vínculo - erro na chamada à API
        // Não assumir que está ok - retornar warning mas não confirmar
        wabaId = null // Não confirmar o WABA
        wabaInference.note = link.graphError?.message
          || 'Não foi possível validar se o Phone Number pertence a este WABA. Verifique se o ID está correto.'
      }
    } else {
      // Tentativa best-effort: /debug_token (precisa META_APP_ID + META_APP_SECRET)
      const appCreds = await getMetaAppCredentials()
      if (appCreds?.appId && appCreds?.appSecret) {
        wabaInference = { attempted: true, method: 'debug_token' }
        const appAccessToken = `${appCreds.appId}|${appCreds.appSecret}`
        const dbg = await graphGetJson<any>('/debug_token', appAccessToken, { input_token: accessToken })

        if (dbg.ok) {
          const granular = Array.isArray(dbg.json?.data?.granular_scopes) ? dbg.json.data.granular_scopes : []
          const targets = new Set<string>()
          for (const g of granular) {
            const ids = Array.isArray(g?.target_ids) ? g.target_ids : []
            for (const id of ids) {
              if (id == null) continue
              const s = String(id)
              if (s && s !== String(phoneNumberId)) targets.add(s)
            }
          }

          wabaCandidates = Array.from(targets)

          // Heurística segura: procura um candidato que contenha este phone em /{waba}/phone_numbers
          // Executa todas as verificações em paralelo para evitar waterfall
          if (wabaCandidates.length > 0) {
            const linkResults = await Promise.all(
              wabaCandidates.map(async (candidate) => ({
                candidate,
                result: await wabaHasPhoneNumber({
                  wabaId: candidate,
                  phoneNumberId,
                  accessToken,
                }),
              }))
            )

            // Encontra o primeiro candidato válido
            const validLink = linkResults.find(
              ({ result }) => result.ok && result.matches === true
            )
            if (validLink) {
              wabaId = validLink.candidate
            }
          }

          if (!wabaId) {
            wabaInference.note = wabaCandidates.length
              ? 'Encontramos candidatos via /debug_token, mas não conseguimos confirmar o vínculo via /{waba}/phone_numbers.'
              : 'O /debug_token não trouxe target_ids (granular_scopes) suficientes para inferir o WABA.'
          }
        } else {
          wabaInference.note = 'Não foi possível chamar /debug_token para inferir o WABA (best-effort).'
        }
      } else {
        wabaInference = {
          attempted: true,
          method: 'none',
          note: 'Para inferir WABA automaticamente, configure META_APP_ID e META_APP_SECRET (ou metaAppId/metaAppSecret nas settings).',
        }
      }
    }

    return NextResponse.json(
      {
        ok: true,
        phoneNumberId,
        businessAccountId: businessAccountId || wabaId || null,
        displayPhoneNumber: (phoneData as any)?.display_phone_number || null,
        verifiedName: (phoneData as any)?.verified_name || null,
        qualityRating: (phoneData as any)?.quality_rating || null,
        wabaId: wabaId || null,
        wabaCandidates: wabaCandidates.length ? wabaCandidates : null,
        wabaInference,
        usedStoredCredentials: shouldUseStoredCreds,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    )
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Erro inesperado ao testar conexão',
      },
      { status: 500 }
    )
  }
}
