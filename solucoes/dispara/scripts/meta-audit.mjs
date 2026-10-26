#!/usr/bin/env node
/**
 * Meta WhatsApp Cloud API — auditoria rápida (diagnóstico de "não consigo disparar em massa").
 *
 * Este script NÃO envia mensagens por padrão. Ele consulta:
 * - /me e /me/permissions (validade básica do token e permissões concedidas)
 * - WABA (campos seguros + lista de phone_numbers)
 * - Phone Number (campos seguros + rating/tier quando disponível)
 * - Templates do WABA (contagem + primeiros itens)
 *
 * Uso:
 *   META_ACCESS_TOKEN=... META_WABA_ID=... META_PHONE_NUMBER_ID=... node scripts/meta-audit.mjs
 *
 * Opcional:
 *   META_GRAPH_VERSION=v24.0
 *   node scripts/meta-audit.mjs --json
 *
 * Observação de segurança:
 * - Prefira usar variáveis de ambiente. Evite passar token por argumento (fica no histórico do shell).
 */

import fs from 'node:fs'
import dotenv from 'dotenv'

function loadEnv() {
  for (const p of ['.env', '.env.vercel', '.env.local', '.env.vercel-prod', '.env.vercel-preview']) {
    if (fs.existsSync(p)) dotenv.config({ path: p, override: true, quiet: true })
  }
}

loadEnv()

const argv = process.argv.slice(2)
const wantJson = argv.includes('--json')

const accessToken = process.env.META_ACCESS_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN || ''
const wabaId = process.env.META_WABA_ID || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || ''
const phoneNumberId = process.env.META_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID || ''
const graphVersion = (process.env.META_GRAPH_VERSION || 'v24.0').trim()

if (!accessToken) {
  console.error('Missing META_ACCESS_TOKEN (ou WHATSAPP_ACCESS_TOKEN).')
  process.exit(2)
}

const GRAPH_BASE = `https://graph.facebook.com/${graphVersion}`

function redactToken(s) {
  if (!s) return s
  if (s.length <= 8) return '***'
  return `${s.slice(0, 4)}…${s.slice(-4)}`
}

async function graph(path, { method = 'GET', params, body } = {}) {
  const url = new URL(`${GRAPH_BASE}${path.startsWith('/') ? '' : '/'}${path}`)
  if (params && typeof params === 'object') {
    for (const [k, v] of Object.entries(params)) {
      if (v == null) continue
      url.searchParams.set(k, String(v))
    }
  }
  url.searchParams.set('access_token', accessToken)

  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })

  const text = await res.text().catch(() => '')
  let json
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }

  if (!res.ok) {
    const err = json?.error || json
    const msg = err?.message || `HTTP ${res.status}`
    const code = err?.code
    const subcode = err?.error_subcode
    const fbtrace = err?.fbtrace_id
    const type = err?.type
    throw new Error(
      `Graph API error: ${msg}` +
      (code != null ? ` (code=${code})` : '') +
      (subcode != null ? ` (subcode=${subcode})` : '') +
      (type ? ` (type=${type})` : '') +
      (fbtrace ? ` (fbtrace_id=${fbtrace})` : '')
    )
  }

  return json
}

async function safeGetWithFields(id, fieldsCandidates) {
  let lastErr
  for (const fields of fieldsCandidates) {
    try {
      return await graph(`/${id}`, { params: { fields } })
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr || new Error('Failed to fetch fields')
}

function classifyLikelyIssues({ mePerms, phone, waba, templates }) {
  const issues = []

  const granted = new Set((mePerms?.data || []).filter((p) => p?.status === 'granted').map((p) => p.permission))

  // Permissões mínimas típicas
  const expected = ['whatsapp_business_messaging', 'whatsapp_business_management']
  for (const p of expected) {
    if (!granted.has(p)) {
      issues.push({
        type: 'permissions',
        severity: 'high',
        message: `Token não tem permissão concedida: ${p}. Sem isso, envio/gestão pode falhar.`,
      })
    }
  }

  // Phone number status/rating (quando disponível)
  const quality = phone?.quality_rating || phone?.quality_rating?.toLowerCase?.()
  if (typeof quality === 'string') {
    if (quality.includes('low') || quality.includes('vermelh') || quality.includes('red')) {
      issues.push({
        type: 'quality',
        severity: 'medium',
        message: `Quality rating do número está baixa (${phone.quality_rating}). Isso pode reduzir capacidade/entrega.`,
      })
    }
  }

  const tier = phone?.messaging_limit_tier || phone?.messaging_limit_tier?.toString?.()
  if (tier) {
    issues.push({
      type: 'tier',
      severity: 'info',
      message: `Messaging limit tier atual: ${tier}. Se estiver próximo/estourado, disparos em massa podem ser limitados.`,
    })
  }

  // Templates
  if (templates && Array.isArray(templates?.data)) {
    const total = templates?.data?.length
    if (total === 0) {
      issues.push({
        type: 'templates',
        severity: 'high',
        message: 'Nenhum template retornou para este WABA. Sem template aprovado/uso correto, disparo pode falhar.',
      })
    }
  }

  // WABA review status (quando disponível)
  const review = waba?.account_review_status
  if (review && String(review).toLowerCase().includes('rejected')) {
    issues.push({
      type: 'waba_review',
      severity: 'high',
      message: `WABA com account_review_status=${review}. Isso pode bloquear uso.`,
    })
  }

  return issues
}

async function main() {
  const out = {
    ok: true,
    ts: new Date().toISOString(),
    graph: {
      base: GRAPH_BASE,
      version: graphVersion,
    },
    input: {
      token: redactToken(accessToken),
      wabaId: wabaId || null,
      phoneNumberId: phoneNumberId || null,
    },
    me: null,
    mePermissions: null,
    waba: null,
    phoneNumber: null,
    wabaPhoneNumbers: null,
    templates: null,
    issues: [],
  }

  // 1) Token sanity
  out.me = await graph('/me', { params: { fields: 'id,name' } })
  out.mePermissions = await graph('/me/permissions')

  // 2) WABA basics
  if (wabaId) {
    out.waba = await safeGetWithFields(wabaId, [
      'id,name,currency,timezone_id,ownership_type,account_review_status',
      'id,name,currency,timezone_id',
      'id,name',
    ])

    // Lista de números do WABA (quando permitido)
    try {
      out.wabaPhoneNumbers = await graph(`/${wabaId}/phone_numbers`, { params: { limit: 50 } })
    } catch (e) {
      out.wabaPhoneNumbers = { error: String(e?.message || e) }
    }

    // Templates
    try {
      out.templates = await graph(`/${wabaId}/message_templates`, { params: { limit: 50 } })
    } catch (e) {
      out.templates = { error: String(e?.message || e) }
    }
  }

  // 3) Phone number details
  if (phoneNumberId) {
    out.phoneNumber = await safeGetWithFields(phoneNumberId, [
      // Campos comuns (podem variar por versão/conta; fallback abaixo)
      'id,display_phone_number,verified_name,code_verification_status,quality_rating,messaging_limit_tier,status',
      'id,display_phone_number,verified_name,code_verification_status,quality_rating,status',
      'id,display_phone_number,verified_name,status',
      'id',
    ])
  }

  out.issues = classifyLikelyIssues({
    mePerms: out.mePermissions,
    phone: out.phoneNumber,
    waba: out.waba,
    templates: out.templates,
  })

  if (wantJson) {
    console.log(JSON.stringify(out, null, 2))
    return
  }

  // Human summary
  console.log('Meta audit (WhatsApp Cloud API)')
  console.log(`- graph: ${out.graph.base}`)
  console.log(`- token: ${out.input.token}`)

  console.log('\n[me]')
  console.log(`- id: ${out.me?.id || 'n/a'}`)
  console.log(`- name: ${out.me?.name || 'n/a'}`)

  console.log('\n[permissions] (granted)')
  const granted = (out.mePermissions?.data || []).filter((p) => p?.status === 'granted').map((p) => p.permission)
  console.log(granted.length ? `- ${granted.join(', ')}` : '- (none)')

  if (out.waba) {
    console.log('\n[waba]')
    console.log(`- id: ${out.waba?.id || 'n/a'}`)
    console.log(`- name: ${out.waba?.name || 'n/a'}`)
    if (out.waba?.account_review_status != null) console.log(`- account_review_status: ${out.waba.account_review_status}`)
  }

  if (out.phoneNumber) {
    console.log('\n[phone_number]')
    console.log(`- id: ${out.phoneNumber?.id || 'n/a'}`)
    if (out.phoneNumber?.display_phone_number) console.log(`- display_phone_number: ${out.phoneNumber.display_phone_number}`)
    if (out.phoneNumber?.verified_name) console.log(`- verified_name: ${out.phoneNumber.verified_name}`)
    if (out.phoneNumber?.status) console.log(`- status: ${out.phoneNumber.status}`)
    if (out.phoneNumber?.quality_rating != null) console.log(`- quality_rating: ${out.phoneNumber.quality_rating}`)
    if (out.phoneNumber?.messaging_limit_tier != null) console.log(`- messaging_limit_tier: ${out.phoneNumber.messaging_limit_tier}`)
  }

  console.log('\n[templates]')
  if (out.templates?.data && Array.isArray(out.templates.data)) {
    console.log(`- returned: ${out.templates.data.length}`)
    const sample = out.templates.data.slice(0, 5).map((t) => ({ name: t.name, status: t.status, language: t.language }))
    console.log(`- sample: ${JSON.stringify(sample)}`)
  } else {
    console.log(`- ${out.templates?.error ? `error: ${out.templates.error}` : 'n/a'}`)
  }

  console.log('\n[issues]')
  if (!out.issues.length) {
    console.log('- none detected (isso não garante que envio em massa vá funcionar; só indica que o básico parece ok)')
  } else {
    for (const i of out.issues) {
      console.log(`- (${i.severity}) ${i.type}: ${i.message}`)
    }
  }
}

main().catch((e) => {
  console.error('Audit failed:', e?.message || e)
  process.exit(1)
})
