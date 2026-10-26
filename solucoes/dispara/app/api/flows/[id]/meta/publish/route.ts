import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'
export const revalidate = 0

import { supabase } from '@/lib/supabase'
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'
import {
  metaCreateFlow,
  metaGetEncryptionPublicKey,
  metaSetEncryptionPublicKey,
  metaGetFlowDetails,
  metaGetFlowPreview,
  metaPublishFlow,
  metaUpdateFlowMetadata,
  metaUploadFlowJsonAsset,
} from '@/lib/meta-flows-api'
import { MetaGraphApiError } from '@/lib/meta-flows-api'
import { generateFlowJsonFromFormSpec, normalizeFlowFormSpec, validateFlowFormSpec } from '@/lib/flow-form'
import { generateBookingDynamicFlowJson, generateDynamicFlowJson, normalizeDynamicFlowSpec } from '@/lib/dynamic-flow'
import { validateMetaFlowJson } from '@/lib/meta-flow-json-validator'
import { settingsDb } from '@/lib/supabase-db'

/**
 * Detecta se o Flow JSON e dinamico (usa data_exchange)
 */
function isDynamicFlow(flowJson: unknown): boolean {
  if (!flowJson || typeof flowJson !== 'object') return false
  const json = flowJson as Record<string, unknown>
  const screens = Array.isArray((json as any).screens) ? (json as any).screens : []
  for (const s of screens) {
    const layout = s && typeof s === 'object' ? (s as any).layout : null
    const children = layout && typeof layout === 'object' && Array.isArray((layout as any).children) ? (layout as any).children : []
    const stack = [...children]
    while (stack.length) {
      const node = stack.pop()
      if (!node || typeof node !== 'object') continue
      const action = (node as any)['on-click-action']
      if (action && typeof action === 'object' && String((action as any).name || '').toLowerCase() === 'data_exchange') {
        return true
      }
      const nested = Array.isArray((node as any).children) ? (node as any).children : null
      if (nested?.length) stack.push(...nested)
    }
  }
  return false
}

const ENDPOINT_URL_SETTING = 'whatsapp_flow_endpoint_url'
const PUBLIC_KEY_SETTING = 'whatsapp_flow_public_key'

/**
 * Retorna a URL do endpoint se configurado
 * Prioridade: NEXT_PUBLIC_APP_URL > Vercel env vars > stored URL
 *
 * Para dev local, configure NEXT_PUBLIC_APP_URL com sua URL de túnel (ex: Cloudflare Tunnel)
 */
async function getFlowEndpointUrl(): Promise<string | null> {
  const privateKey = await settingsDb.get('whatsapp_flow_private_key')
  if (!privateKey) return null

  // 1. NEXT_PUBLIC_APP_URL (pode ser URL de túnel em dev)
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return `${process.env.NEXT_PUBLIC_APP_URL}/api/flows/endpoint`
  }

  // 2. Env vars (producao/preview Vercel)
  const envEndpointUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}/api/flows/endpoint`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}/api/flows/endpoint`
      : null

  // 3. Fallback: URL salva no banco
  const storedEndpointUrl = await settingsDb.get(ENDPOINT_URL_SETTING)
  const resolved = envEndpointUrl || storedEndpointUrl || null
  console.log('[publish] 📍 Endpoint URL resolvida:', resolved, '(env:', envEndpointUrl, ', stored:', storedEndpointUrl, ')')
  return resolved
}

const PublishSchema = z
  .object({
    publish: z.boolean().optional().default(true),
    categories: z.array(z.string().min(1).max(60)).optional().default(['OTHER']),
    // Se true, tenta atualizar (asset) caso já exista meta_flow_id (DRAFT).
    updateIfExists: z.boolean().optional().default(true),
  })
  .strict()

function extractFlowJson(row: any): unknown {
  const savedFlowJson = row?.flow_json
  const savedDataApiVersion =
    savedFlowJson && typeof savedFlowJson === 'object'
      ? (savedFlowJson as Record<string, unknown>).data_api_version
      : null

  const specDynamic = row?.spec?.dynamicFlow
  if (specDynamic && typeof specDynamic === 'object') {
    if ((specDynamic as any).flowJson && typeof (specDynamic as any).flowJson === 'object') {
      return (specDynamic as any).flowJson
    }
    if (Array.isArray((specDynamic as any).screens)) {
      const normalized = normalizeDynamicFlowSpec(specDynamic)
      return generateDynamicFlowJson(normalized)
    }
  }

  const specBooking = row?.spec?.booking
  if (specBooking && typeof specBooking === 'object') {
    return generateBookingDynamicFlowJson(specBooking)
  }

  // Se o flow_json salvo for dinâmico, preserve-o para não perder data_exchange.
  if (savedDataApiVersion === '3.0' && isDynamicFlow(savedFlowJson)) {
    return savedFlowJson
  }

  // Prioridade: regenerar do spec.form se existir (flows estáticos).
  // Isso garante que qualquer mudança no generateFlowJsonFromFormSpec
  // (ex: inclusão do payload no on-click-action) seja aplicada automaticamente.
  const form = row?.spec?.form
  if (form) {
    const normalized = normalizeFlowFormSpec(form, row?.name || 'Flow')
    return generateFlowJsonFromFormSpec(normalized)
  }

  // Fallback: flow_json persistido (para flows legados sem spec.form)
  if (savedFlowJson) return savedFlowJson

  // Último fallback: gerar vazio
  const emptyNormalized = normalizeFlowFormSpec({}, row?.name || 'Flow')
  return generateFlowJsonFromFormSpec(emptyNormalized)
}

function stripEditorMetadata(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(stripEditorMetadata)
  if (!input || typeof input !== 'object') return input

  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    // Remove TODAS as propriedades internas (__*) exceto __example__ (usada no schema de data)
    if (k.startsWith('__') && k !== '__example__') continue
    out[k] = stripEditorMetadata(v)
  }
  return out
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function countFormWrappers(flowJson: unknown): number {
  let count = 0
  if (!flowJson || typeof flowJson !== 'object') return count
  const json = flowJson as any
  const screens = Array.isArray(json.screens) ? json.screens : []
  for (const s of screens) {
    const layout = s && typeof s === 'object' ? s.layout : null
    const children = layout && typeof layout === 'object' && Array.isArray(layout.children) ? layout.children : []
    const stack = [...children]
    while (stack.length) {
      const node = stack.pop()
      if (!node || typeof node !== 'object') continue
      if (String((node as any).type || '') === 'Form') count += 1
      const nested = Array.isArray((node as any).children) ? (node as any).children : null
      if (nested?.length) stack.push(...nested)
    }
  }
  return count
}

/**
 * A Meta valida `${form.*}` de forma mais restritiva quando existe o wrapper `Form`
 * (ex.: "Missing Form component ${form.topics} for screen ...").
 * Para publicar com payload completo no `complete`, removemos (flatten) o wrapper `Form`
 * preservando os filhos (inclusive Footer).
 */
function flattenFormWrappers(input: unknown): unknown {
  if (Array.isArray(input)) {
    const out: unknown[] = []
    for (const item of input) {
      const flattened = flattenFormWrappers(item)
      if (Array.isArray(flattened)) out.push(...flattened)
      else out.push(flattened)
    }
    return out
  }
  if (!input || typeof input !== 'object') return input

  const obj = input as any
  if (String(obj.type || '') === 'Form' && Array.isArray(obj.children)) {
    // Flatten: retorna os filhos no lugar do wrapper
    return flattenFormWrappers(obj.children)
  }

  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    out[k] = flattenFormWrappers(v)
  }
  return out
}

function countNavigatePayloads(flowJson: unknown): { navigateWithPayload: number; totalNavigate: number } {
  let navigateWithPayload = 0
  let totalNavigate = 0
  if (!flowJson || typeof flowJson !== 'object') return { navigateWithPayload, totalNavigate }
  const json = flowJson as any
  const screens = Array.isArray(json.screens) ? json.screens : []
  for (const s of screens) {
    const layout = s && typeof s === 'object' ? s.layout : null
    const children = layout && typeof layout === 'object' && Array.isArray(layout.children) ? layout.children : []
    const stack = [...children]
    while (stack.length) {
      const node = stack.pop()
      if (!node || typeof node !== 'object') continue
      const action = (node as any)['on-click-action']
      if (action && typeof action === 'object') {
        const name = String((action as any).name || '').toLowerCase()
        if (name === 'navigate') {
          totalNavigate += 1
          const payload = (action as any).payload
          if (payload && typeof payload === 'object' && Object.keys(payload).length > 0) navigateWithPayload += 1
        }
      }
      const nested = Array.isArray((node as any).children) ? (node as any).children : null
      if (nested?.length) stack.push(...nested)
    }
  }
  return { navigateWithPayload, totalNavigate }
}

function scanForDisallowedKeys(input: unknown): { count: number; samplePaths: string[] } {
  let count = 0
  const samplePaths: string[] = []
  const stack: Array<{ node: unknown; path: string }> = [{ node: input, path: '$' }]
  while (stack.length) {
    const { node, path } = stack.pop()!
    if (!node || typeof node !== 'object') continue
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i += 1) {
        stack.push({ node: node[i], path: `${path}[${i}]` })
      }
      continue
    }
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k.startsWith('__') && k !== '__example__') {
        count += 1
        if (samplePaths.length < 5) samplePaths.push(`${path}.${k}`)
      }
      stack.push({ node: v, path: `${path}.${k}` })
    }
  }
  return { count, samplePaths }
}

function summarizeFlowJson(input: unknown): {
  screenCount: number
  screenIds: string[]
  layoutTypes: string[]
  componentTypes: string[]
  inputComponentTypes: string[]
  footerActions: Array<{
    screenId: string
    action: string
    payloadKeys: number
    payloadKeysSample: string[]
    payloadNonString: number
    payloadHasFormRef: boolean
  }>
} {
  const out = {
    screenCount: 0,
    screenIds: [] as string[],
    layoutTypes: [] as string[],
    componentTypes: [] as string[],
    inputComponentTypes: [] as string[],
    footerActions: [] as Array<{
      screenId: string
      action: string
      payloadKeys: number
      payloadKeysSample: string[]
      payloadNonString: number
      payloadHasFormRef: boolean
    }>,
  }
  if (!input || typeof input !== 'object') return out
  const json = input as any
  const screens = Array.isArray(json.screens) ? json.screens : []
  out.screenCount = screens.length
  const inputTypes = new Set([
    'TextInput',
    'TextArea',
    'Dropdown',
    'RadioButtonsGroup',
    'CheckboxGroup',
    'DatePicker',
    'CalendarPicker',
    'OptIn',
  ])
  for (const s of screens) {
    const screenId = String(s?.id || '')
    if (screenId) out.screenIds.push(screenId)
    const layoutType = s?.layout?.type ? String(s.layout.type) : ''
    if (layoutType) out.layoutTypes.push(layoutType)
    const children = Array.isArray(s?.layout?.children) ? s.layout.children : []
    const stack = [...children]
    while (stack.length) {
      const node = stack.pop()
      if (!node || typeof node !== 'object') continue
      const type = typeof (node as any).type === 'string' ? String((node as any).type) : ''
      if (type) out.componentTypes.push(type)
      if (type && inputTypes.has(type)) out.inputComponentTypes.push(type)
      const action = (node as any)['on-click-action']
      if (type === 'Footer' && action && typeof action === 'object') {
        const payload = (action as any).payload
        const payloadKeys = payload && typeof payload === 'object' ? Object.keys(payload as any).length : 0
        const payloadKeysSample =
          payload && typeof payload === 'object' ? Object.keys(payload as any).slice(0, 6).map((k) => String(k)) : []
        let payloadNonString = 0
        let payloadHasFormRef = false
        if (payload && typeof payload === 'object') {
          for (const v of Object.values(payload as any)) {
            if (typeof v === 'string') {
              if (v.includes('${form.') || v.includes('\\${form.')) payloadHasFormRef = true
            } else if (v != null) {
              payloadNonString += 1
            }
          }
        }
        out.footerActions.push({
          screenId: screenId || '(unknown)',
          action: String((action as any).name || ''),
          payloadKeys,
          payloadKeysSample,
          payloadNonString,
          payloadHasFormRef,
        })
      }
      const nested = Array.isArray((node as any).children) ? (node as any).children : null
      if (nested?.length) stack.push(...nested)
    }
  }
  out.screenIds = out.screenIds.slice(0, 6)
  out.layoutTypes = Array.from(new Set(out.layoutTypes)).slice(0, 6)
  out.componentTypes = Array.from(new Set(out.componentTypes)).slice(0, 12)
  out.inputComponentTypes = Array.from(new Set(out.inputComponentTypes)).slice(0, 8)
  out.footerActions = out.footerActions.slice(0, 6)
  return out
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  let wantsDebug = false
  const debugInfo: Record<string, unknown> = {}
  let credentials: Awaited<ReturnType<typeof getWhatsAppCredentials>> | null = null

  try {
    const input = PublishSchema.parse(await req.json().catch(() => ({})))
    wantsDebug = req.headers.get('x-debug-client') === '1'

    credentials = await getWhatsAppCredentials()
    if (!credentials?.accessToken || !credentials.businessAccountId) {
      return NextResponse.json(
        {
          error: 'WhatsApp não configurado. Defina Access Token e WABA ID nas Configurações.',
        },
        { status: 400 }
      )
    }
    if (!credentials.phoneNumberId) {
      return NextResponse.json(
        {
          error: 'WhatsApp não configurado. Defina o Phone Number ID nas Configurações.',
        },
        { status: 400 }
      )
    }

    // Busca o flow local
    const { data, error } = await supabase.from('flows').select('*').eq('id', id).limit(1)
    if (error) return NextResponse.json({ error: error.message || 'Falha ao buscar flow' }, { status: 500 })

    const row = Array.isArray(data) ? data[0] : (data as any)
    if (!row) return NextResponse.json({ error: 'Flow não encontrado' }, { status: 404 })

    let flowJson = extractFlowJson(row)
    const flowJsonObj = flowJson && typeof flowJson === 'object' ? (flowJson as Record<string, unknown>) : null

    // A Meta rejeita propriedades internas do editor (ex: __editor_key).
    // Removemos somente essas chaves para publicar sem afetar o preview no app.
    const beforeStrip = stripEditorMetadata(flowJson)
    const formsBefore = countFormWrappers(beforeStrip)
    const flowJsonForMeta = flattenFormWrappers(beforeStrip)
    const flowJsonForMetaObj =
      flowJsonForMeta && typeof flowJsonForMeta === 'object' ? (flowJsonForMeta as Record<string, unknown>) : null
    try {
      const formsAfter = countFormWrappers(flowJsonForMeta)
      // #region agent log
      // #endregion agent log
    } catch {}

    try {
      const removed =
        JSON.stringify(flowJson || {}).length > 0 && JSON.stringify(flowJsonForMeta || {}).length > 0
          ? Math.max(0, JSON.stringify(flowJson || {}).length - JSON.stringify(flowJsonForMeta || {}).length)
          : null
      const nav = countNavigatePayloads(flowJsonForMeta)
      const disallowed = scanForDisallowedKeys(flowJsonForMeta)
      const summary = summarizeFlowJson(flowJsonForMeta)
      const hasInputComponents = summary.inputComponentTypes.length > 0
      // #region agent log
      // #endregion agent log
    } catch {}

    debugInfo.flowJsonVersion = (flowJsonObj as any)?.version ?? null
    debugInfo.flowJsonDataApiVersion = (flowJsonObj as any)?.data_api_version ?? null
    try {
      const screens = Array.isArray((flowJsonObj as any)?.screens) ? (flowJsonObj as any).screens : []
      const hasRoutingModel = !!(flowJsonObj as any)?.routing_model
      const screenIds = screens.map((s: any) => String(s?.id || '')).filter(Boolean).slice(0, 6)
      // #region agent log
      // #endregion agent log
    } catch {}

    const isDynamic = isDynamicFlow(flowJson)

    // Validação “local” (rápida) para evitar publicar algo obviamente inválido.
    // A validação oficial é da Meta e vem em validation_errors.
    const formIssues =
      !isDynamic && row?.spec?.form
        ? validateFlowFormSpec(normalizeFlowFormSpec(row.spec.form, row?.name || 'Flow'))
        : []
    if (formIssues.length > 0) {
      return NextResponse.json(
        {
          error: 'Ajustes necessários antes de publicar',
          issues: formIssues,
        },
        { status: 400 }
      )
    }

    // Validação do schema do Flow JSON (mais próximo do que a Meta espera) antes de chamar a Graph API.
    // Isso evita o "(100) Invalid parameter" sem contexto.
    let localValidation = validateMetaFlowJson(flowJsonForMeta)
    try {
      // #region agent log
      // #endregion agent log
    } catch {}
    if (!localValidation.isValid) {
      const errors = Array.isArray(localValidation.errors) ? localValidation.errors.slice(0, 6) : []
      const warnings = Array.isArray(localValidation.warnings) ? localValidation.warnings.slice(0, 6) : []
    }

    // Se o flow_json persistido estiver legado/inválido, tentamos regenerar do spec.form automaticamente.
    if (!isDynamic && !localValidation.isValid && row?.spec?.form) {
      const normalized = normalizeFlowFormSpec(row.spec.form, row?.name || 'Flow')
      const regenerated = generateFlowJsonFromFormSpec(normalized)
      const regeneratedValidation = validateMetaFlowJson(stripEditorMetadata(regenerated))

      if (regeneratedValidation.isValid) {
        flowJson = regenerated
        // mantém flowJson (para DB) e valida/publica com versão sanitizada
        localValidation = regeneratedValidation
      }
    }

    if (!localValidation.isValid) {
      const now = new Date().toISOString()
      await supabase
        .from('flows')
        .update({
          updated_at: now,
          meta_last_checked_at: now,
          meta_validation_errors: { source: 'local', ...localValidation },
        })
        .eq('id', id)

      return NextResponse.json(
        {
          error: 'Flow JSON inválido para a Meta. Corrija os itens antes de publicar.',
          validation: localValidation,
        },
        { status: 400 }
      )
    }

    const now = new Date().toISOString()

    let metaFlowId: string | null = typeof row?.meta_flow_id === 'string' && row.meta_flow_id.trim() ? row.meta_flow_id.trim() : null

    let validationErrors: unknown = null
    let metaStatus: string | null = null
    let previewUrl: string | null = null

    if (!metaFlowId) {
      // A Meta exige `endpoint_uri` para Flows "de endpoint" (data_api_version/routing_model).
      // `dynamic` aqui significa "usa data_exchange"; `requiresEndpoint` cobre routing_model também.
      const dynamic = isDynamicFlow(flowJson)
      const requiresEndpoint =
        (flowJsonObj as any)?.data_api_version === '3.0' || isPlainObject((flowJsonObj as any)?.routing_model)
      let endpointUri: string | undefined
      debugInfo.dynamic = dynamic
      debugInfo.requiresEndpoint = requiresEndpoint

      if (requiresEndpoint) {
        const url = await getFlowEndpointUrl()
        debugInfo.endpointUrl = url ?? null
        if (!url) {
          return NextResponse.json(
            {
              error:
                'Este Flow requer endpoint (data_api_version/routing_model). Configure em Configurações > MiniApp Dinâmico e use uma URL pública (localhost não funciona para publicar).',
            },
            { status: 400 }
          )
        }
        endpointUri = url
        // #region agent log
        // #endregion
      }

      if (requiresEndpoint) {
        const publicKey = await settingsDb.get(PUBLIC_KEY_SETTING)
        const hasPublicKey = Boolean(publicKey)
        if (!publicKey) {
          return NextResponse.json(
            {
              error: 'Chave pública do Flow não configurada. Gere as chaves em Configurações > MiniApp Dinâmico.',
              debug: wantsDebug ? debugInfo : undefined,
            },
            { status: 400 }
          )
        }
        debugInfo.publicKeyConfigured = true
        const normalizedLocalKey = publicKey.trim().replace(/\r\n/g, '\n')
        debugInfo.publicKeyHashLocal = crypto.createHash('sha256').update(normalizedLocalKey).digest('hex').slice(0, 12)

        const existingKey = await metaGetEncryptionPublicKey({
          accessToken: credentials.accessToken,
          phoneNumberId: credentials.phoneNumberId,
        })
        const normalizedMetaKey = existingKey.publicKey ? existingKey.publicKey.trim().replace(/\r\n/g, '\n') : null
        debugInfo.publicKeyHashMeta = normalizedMetaKey
          ? crypto.createHash('sha256').update(normalizedMetaKey).digest('hex').slice(0, 12)
          : null
        const needsRegistration = !normalizedMetaKey || normalizedMetaKey !== normalizedLocalKey
        debugInfo.publicKeyMatchesMeta = !needsRegistration
        debugInfo.publicKeySignatureStatus = existingKey.signatureStatus ?? null
        if (needsRegistration) {
          debugInfo.publicKeyRegistrationAttempted = true
          await metaSetEncryptionPublicKey({
            accessToken: credentials.accessToken,
            phoneNumberId: credentials.phoneNumberId,
            publicKey,
          })
          debugInfo.publicKeyRegistrationAttempted = true
          debugInfo.publicKeyRegistrationSuccess = true

          const refreshedKey = await metaGetEncryptionPublicKey({
            accessToken: credentials.accessToken,
            phoneNumberId: credentials.phoneNumberId,
          })
          const normalizedRefreshed = refreshedKey.publicKey ? refreshedKey.publicKey.trim().replace(/\r\n/g, '\n') : null
          debugInfo.publicKeyHashMetaAfter = normalizedRefreshed
            ? crypto.createHash('sha256').update(normalizedRefreshed).digest('hex').slice(0, 12)
            : null
          debugInfo.publicKeySignatureStatusAfter = refreshedKey.signatureStatus ?? null
          debugInfo.publicKeyMatchesMetaAfter = normalizedRefreshed === normalizedLocalKey

          if (!debugInfo.publicKeyMatchesMetaAfter) {
            return NextResponse.json(
              {
                error:
                  'Chave pública não ficou registrada na Meta. Verifique o Phone Number ID e as permissões do token (whatsapp_business_messaging) para este número.',
                debug: wantsDebug ? debugInfo : undefined,
              },
              { status: 400 }
            )
          }
        }
      }

      const screens = Array.isArray((flowJsonObj as any)?.screens) ? (flowJsonObj as any).screens : []
      const screenIds = screens.map((s: any) => String(s?.id || '')).filter(Boolean).slice(0, 6)

      // Criar na Meta (com publish opcional em um único request)
      const baseName = String(row?.name || 'Flow').trim() || 'Flow'
      const maxNameLength = 60
      const buildUniqueName = (nameSuffix: string) => {
        const maxBaseLength = Math.max(1, maxNameLength - nameSuffix.length)
        return `${baseName.slice(0, maxBaseLength)}${nameSuffix}`
      }
      const primarySuffix = ` #${String(id).slice(0, 6)}`
      const uniqueName = buildUniqueName(primarySuffix)
      debugInfo.createName = uniqueName

      let created
      try {
        try {
          const hasRoutingModel = !!(flowJsonObj as any)?.routing_model
          // Captura amostra do JSON para debug
          const jsonSample = {
            version: (flowJsonForMeta as any)?.version,
            data_api_version: (flowJsonForMeta as any)?.data_api_version,
            routing_model: (flowJsonForMeta as any)?.routing_model,
            firstScreen: (() => {
              const s = (flowJsonForMeta as any)?.screens?.[0]
              if (!s) return null
              return {
                id: s.id,
                title: s.title,
                dataKeys: s.data ? Object.keys(s.data) : [],
                layoutType: s.layout?.type,
                childrenTypes: s.layout?.children?.map((c: any) => c?.type),
                childrenWithVisible: s.layout?.children?.filter((c: any) => c?.visible !== undefined).map((c: any) => ({ type: c?.type, visible: c?.visible })),
              }
            })(),
          }
          // #region agent log
          // #endregion agent log
        } catch {}
        created = await metaCreateFlow({
          accessToken: credentials.accessToken,
          wabaId: credentials.businessAccountId,
          name: uniqueName,
          categories: input.categories.length > 0 ? input.categories : ['OTHER'],
          flowJson: flowJsonForMeta,
          publish: !!input.publish,
          endpointUri,
        })
      } catch (error) {
        if (error instanceof MetaGraphApiError) {
          const graphError = (error.data as any)?.error ?? error.data
          const code = graphError?.code
          const subcode = graphError?.error_subcode
          if (code === 100 && subcode === 4016019) {
            const retrySuffix = ` #${String(id).slice(0, 6)}-${Date.now().toString().slice(-4)}`
            const retryName = buildUniqueName(retrySuffix)
            debugInfo.createNameRetry = retryName
            created = await metaCreateFlow({
              accessToken: credentials.accessToken,
              wabaId: credentials.businessAccountId,
              name: retryName,
              categories: input.categories.length > 0 ? input.categories : ['OTHER'],
              flowJson: flowJsonForMeta,
              publish: !!input.publish,
              endpointUri,
            })
          } else {
            throw error
          }
        } else {
          throw error
        }
      }

      metaFlowId = created.id
      validationErrors = created.validation_errors ?? null
      try {
        const ve = validationErrors as any
        const veCount = Array.isArray(ve) ? ve.length : ve && typeof ve === 'object' && Array.isArray(ve.errors) ? ve.errors.length : null
        // #region agent log
        // #endregion agent log
      } catch {}

      // Atualiza detalhes (status etc.)
      const details = await metaGetFlowDetails({ accessToken: credentials.accessToken, flowId: metaFlowId })
      metaStatus = details.status || null

      // Preview
      const preview = await metaGetFlowPreview({ accessToken: credentials.accessToken, flowId: metaFlowId })
      previewUrl = typeof preview?.preview?.preview_url === 'string' ? preview.preview.preview_url : null
    } else {
      // Já existe: tentar atualizar (apenas se ainda for possível)
      let details = await metaGetFlowDetails({ accessToken: credentials.accessToken, flowId: metaFlowId })
      metaStatus = details.status || null

      // Se está publicado, não dá para modificar; nesse caso, orientamos clonar.
      if (metaStatus === 'PUBLISHED') {
        return NextResponse.json(
          {
            error:
              'Esse Flow já está PUBLISHED na Meta e não pode ser alterado. Crie um novo Flow (clone) ou remova o Flow ID da Meta para publicar como novo.',
            metaFlowId,
            metaStatus,
          },
          { status: 409 }
        )
      }

      if (input.updateIfExists) {
        await metaUpdateFlowMetadata({
          accessToken: credentials.accessToken,
          flowId: metaFlowId,
          name: String(row?.name || 'Flow'),
          categories: input.categories.length > 0 ? input.categories : ['OTHER'],
        })

        const uploaded = await metaUploadFlowJsonAsset({
          accessToken: credentials.accessToken,
          flowId: metaFlowId,
          flowJson,
        })
        validationErrors = uploaded.validation_errors ?? null

        if (input.publish) {
          await metaPublishFlow({ accessToken: credentials.accessToken, flowId: metaFlowId })
        }

        details = await metaGetFlowDetails({ accessToken: credentials.accessToken, flowId: metaFlowId })
        metaStatus = details.status || null

        const preview = await metaGetFlowPreview({ accessToken: credentials.accessToken, flowId: metaFlowId })
        previewUrl = typeof preview?.preview?.preview_url === 'string' ? preview.preview.preview_url : null
      }
    }

    // Persistir no Supabase
    const update: Record<string, unknown> = {
      updated_at: now,
      meta_flow_id: metaFlowId,
      meta_status: metaStatus,
      meta_preview_url: previewUrl,
      meta_validation_errors: validationErrors,
      meta_last_checked_at: now,
      ...(metaStatus === 'PUBLISHED' ? { meta_published_at: now } : {}),
    }

    const { data: updated, error: updErr } = await supabase.from('flows').update(update).eq('id', id).select('*').limit(1)
    if (updErr) {
      return NextResponse.json(
        {
          error: updErr.message || 'Falha ao salvar status do Flow',
          metaFlowId,
          metaStatus,
          metaPreviewUrl: previewUrl,
          validationErrors,
        },
        { status: 500 }
      )
    }

    const updatedRow = Array.isArray(updated) ? updated[0] : (updated as any)

    return NextResponse.json({
      ok: true,
      metaFlowId,
      metaStatus,
      metaPreviewUrl: previewUrl,
      validationErrors,
      row: updatedRow,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Falha ao publicar Flow'
    if (error instanceof MetaGraphApiError) {
      try {
        const graphError = (error.data as any)?.error ?? error.data
        const code = graphError?.code ?? null
        const subcode = graphError?.error_subcode ?? null
        const errorUserTitle = graphError?.error_user_title ?? null
        const errorUserMsg = graphError?.error_user_msg ?? null
        const validationErrors = (graphError as any)?.validation_errors ?? (graphError as any)?.validationErrors ?? null
        const preview =
          Array.isArray(validationErrors)
            ? validationErrors.slice(0, 4)
            : validationErrors && typeof validationErrors === 'object' && Array.isArray((validationErrors as any).errors)
              ? (validationErrors as any).errors.slice(0, 4)
              : null
        // Quando a Meta cria o flow mas falha ao publicar (139002), ela às vezes só devolve o Flow ID no texto.
        // Vamos buscar detalhes para capturar validation_errors reais.
        let createdFlowIdFromMsg: string | null = null
        if (typeof errorUserMsg === 'string') {
          const m = errorUserMsg.match(/Flow ID:\s*([0-9]+)/i)
          createdFlowIdFromMsg = m?.[1] ? String(m[1]) : null
        }
        if (createdFlowIdFromMsg) {
          try {
            const accessToken = credentials?.accessToken
            if (!accessToken) throw new Error('missing credentials.accessToken')
            const details = await metaGetFlowDetails({ accessToken, flowId: createdFlowIdFromMsg })
            const ve = (details as any)?.validation_errors ?? (details as any)?.validationErrors ?? null
            const vePreview = Array.isArray(ve) ? ve.slice(0, 6) : ve && typeof ve === 'object' ? ve : null
            // #region agent log
            // #endregion agent log
            debugInfo.createdFlowIdFromPublishFail = createdFlowIdFromMsg
            debugInfo.createdFlowDetailsStatus = (details as any)?.status ?? null
            debugInfo.createdFlowValidationErrors = vePreview
          } catch (e) {
            // #region agent log
            // #endregion agent log
          }
        }
        // #region agent log
        // #endregion agent log
      } catch {}
    }

    // Em dev, devolvemos detalhes do erro da Graph API para facilitar debug (sem incluir token).
    if ((process.env.NODE_ENV !== 'production' || wantsDebug) && error instanceof MetaGraphApiError) {
      return NextResponse.json(
        {
          error: msg,
          meta: {
            status: error.status,
            graphError: (error.data as any)?.error ?? error.data,
          },
          debug: wantsDebug
            ? {
                status: error.status,
                graphError: (error.data as any)?.error ?? error.data,
                publish: debugInfo,
              }
            : undefined,
        },
        { status: 400 }
      )
    }

    if (error instanceof MetaGraphApiError) {
      const graphError = (error.data as any)?.error ?? error.data
      if (wantsDebug) {
        return NextResponse.json(
          {
            error: msg,
            debug: {
              status: error.status,
              graphError: (error.data as any)?.error ?? error.data,
              publish: debugInfo,
            },
          },
          { status: 400 }
        )
      }
    }

    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
