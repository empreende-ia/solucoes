import { NextResponse } from 'next/server'
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'
import { normalizeSubscribedFields, type MetaSubscribedApp } from '@/lib/meta-webhook-subscription'
import { getVerifyToken } from '@/lib/verify-token'
import { supabase } from '@/lib/supabase'
import { getMetaAppCredentials } from '@/lib/meta-app-credentials'
import { getMetaSignatureStatus, type MetaSignatureStatus } from '@/lib/meta-webhook-signature'
import { fetchWithTimeout, safeJson } from '@/lib/server-http'
import {
	FLOW_KEYS_ALERT_ID_PREFIX,
	FLOW_KEYS_RECOMMENDED_ACTION,
	type FlowPublicKeyInspection,
	getFlowDecryptFailureSummary,
	inspectFlowPublicKey,
} from '@/lib/whatsapp/flow-endpoint-keys'
import { listRecentMetaIntegrationAlerts } from '@/lib/meta-integration-alerts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const META_API_VERSION = 'v24.0'
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`
const META_BUSINESS_LOCKED_CODE = 131031

type CheckStatus = 'pass' | 'warn' | 'fail' | 'info'

type DiagnosticCheck = {
	id: string
	title: string
	status: CheckStatus
	message: string
	details?: Record<string, unknown>
	actions?: Array<{
		id: string
		label: string
		kind: 'link' | 'api'
		href?: string
		method?: 'POST' | 'DELETE'
		endpoint?: string
		body?: unknown
	}>
}

type TokenExpirySummary = {
	expiresAt: number | null
	dataAccessExpiresAt: number | null
	expiresAtIso: string | null
	dataAccessExpiresAtIso: string | null
	daysRemaining: number | null
	status: 'unknown' | 'ok' | 'expiring' | 'expired'
}

function normalizeUnknownError(err: unknown): { message: string; details?: Record<string, unknown> } {
	if (!err) return { message: 'Erro desconhecido' }

	if (err instanceof Error) {
		const anyErr = err as any
		return {
			message: err.message || 'Erro',
			details: {
				name: err.name,
				stack: err.stack,
				...(anyErr?.code ? { code: anyErr.code } : null),
				...(anyErr?.details ? { details: anyErr.details } : null),
				...(anyErr?.hint ? { hint: anyErr.hint } : null),
			},
		}
	}

	if (typeof err === 'string') return { message: err }

	if (typeof err === 'object') {
		const o = err as any
		const msg =
			(typeof o.message === 'string' && o.message) ||
			(typeof o.error_description === 'string' && o.error_description) ||
			(typeof o.error === 'string' && o.error) ||
			'Erro (objeto)'

		const details: Record<string, unknown> = {}
		for (const k of ['code', 'details', 'hint', 'status', 'statusCode', 'name']) {
			if (o?.[k] != null) details[k] = o[k]
		}
		// tenta preservar o payload inteiro quando é “pequeno”
		try {
			const json = JSON.parse(JSON.stringify(o))
			details.raw = json
		} catch {
			// ignore
		}

		return { message: msg, details: Object.keys(details).length ? details : undefined }
	}

	return { message: String(err) }
}

function noStoreJson(payload: unknown, init?: { status?: number }) {
	return NextResponse.json(payload, {
		status: init?.status ?? 200,
		headers: {
			'Cache-Control': 'private, no-store, no-cache, must-revalidate, max-age=0',
			Pragma: 'no-cache',
			Expires: '0',
		},
	})
}

function maskTokenPreview(token: string | null | undefined): string {
	const t = String(token || '').trim()
	if (!t) return ''
	if (t.length <= 12) return `${t.slice(0, 4)}…${t.slice(-2)}`
	return `${t.slice(0, 6)}…${t.slice(-4)}`
}

function maskId(id: string | null | undefined): string {
	const s = String(id || '').trim()
	if (!s) return ''
	if (s.length <= 8) return `${s.slice(0, 3)}…`
	return `${s.slice(0, 4)}…${s.slice(-4)}`
}

function tryParseUnixSeconds(v: unknown): number | null {
	if (v == null) return null
	const n = typeof v === 'number' ? v : Number(v)
	if (!Number.isFinite(n)) return null
	// Meta usa seconds
	if (n <= 0) return null
	return Math.floor(n)
}

function unixSecondsToIso(sec: number | null): string | null {
	if (!sec || !Number.isFinite(sec)) return null
	try {
		return new Date(sec * 1000).toISOString()
	} catch {
		return null
	}
}

function computeTokenExpirySummary(debugTokenData: any): TokenExpirySummary {
	const expiresAt = tryParseUnixSeconds(debugTokenData?.expires_at)
	const dataAccessExpiresAt = tryParseUnixSeconds(debugTokenData?.data_access_expires_at)
	const nowSec = Math.floor(Date.now() / 1000)
	const daysRemaining = expiresAt != null ? Math.floor((expiresAt - nowSec) / 86400) : null

	let status: TokenExpirySummary['status'] = 'unknown'
	if (expiresAt != null) {
		if (expiresAt <= nowSec) status = 'expired'
		else if (expiresAt <= nowSec + 7 * 86400) status = 'expiring'
		else status = 'ok'
	}

	return {
		expiresAt,
		dataAccessExpiresAt,
		expiresAtIso: unixSecondsToIso(expiresAt),
		dataAccessExpiresAtIso: unixSecondsToIso(dataAccessExpiresAt),
		daysRemaining,
		status,
	}
}

function collectFbtraceIds(checks: DiagnosticCheck[]): string[] {
	const out = new Set<string>()
	const seen = new Set<any>()

	const visit = (v: any, depth: number) => {
		if (!v || depth > 6) return
		if (typeof v === 'string') {
			// fbtrace_id costuma parecer com "A1b2C..." (não garantimos formato)
			if (v.length >= 6 && v.length <= 128 && /[A-Za-z0-9]/.test(v)) {
				// não dá pra saber se é trace, então só adicionamos quando a chave indica.
			}
			return
		}
		if (typeof v !== 'object') return
		if (seen.has(v)) return
		seen.add(v)

		if (typeof v.fbtrace_id === 'string' && v.fbtrace_id.trim()) out.add(v.fbtrace_id.trim())
		if (typeof v.fbtraceId === 'string' && v.fbtraceId.trim()) out.add(v.fbtraceId.trim())

		for (const k of Object.keys(v)) {
			const child = (v as any)[k]
			if (k === 'fbtrace_id' || k === 'fbtraceId') {
				if (typeof child === 'string' && child.trim()) out.add(child.trim())
				continue
			}
			visit(child, depth + 1)
		}
	}

	for (const c of checks) {
		visit(c.details, 0)
	}

	return Array.from(out)
}

function extractGraphErrorFromUnknown(value: any) {
	if (!value) return null
	const err = value?.error || value
	const code = err?.code ?? null
	const sub = err?.error_subcode ?? null
	const message = err?.message ?? null
	const fbtrace_id = err?.fbtrace_id ?? null
	const type = err?.type ?? null
	const error_user_title = err?.error_user_title ?? null
	const error_user_msg = err?.error_user_msg ?? null

	const hasAny =
		code != null || sub != null || message != null || fbtrace_id != null || type != null || error_user_title != null
	if (!hasAny) return null
	return {
		code,
		error_subcode: sub,
		message,
		type,
		fbtrace_id,
		error_user_title,
		error_user_msg,
	}
}

function buildSupportPacketText(params: {
	checks: DiagnosticCheck[]
	meta: { vercelEnv: string | null; webhookUrl: string; source: string }
	whatsapp: { wabaId: string; phoneNumberId: string; accessTokenPreview: string }
	debugToken: {
		enabled: boolean
		source: string
		attempted: boolean
		ok: boolean | null
		isValid: boolean | null
		expiry: TokenExpirySummary | null
	}
}) {
	const lines: string[] = []
	lines.push(`Dispara · Support Packet · ${new Date().toLocaleString('pt-BR')}`)
	lines.push(`Ambiente: ${params.meta.vercelEnv || 'desconhecido'} · Credenciais: ${params.meta.source}`)
	lines.push(`Webhook esperado: ${params.meta.webhookUrl}`)
	lines.push(`WABA: ${params.whatsapp.wabaId} · Phone: ${params.whatsapp.phoneNumberId} · Token: ${params.whatsapp.accessTokenPreview}`)
	lines.push('')

	const health = params.checks.find((c) => c.id === 'meta_health_status')
	const healthOverall = String((health?.details as any)?.overall || '')
	if (healthOverall) lines.push(`Health Status (overall): ${healthOverall}`)

	if (params.debugToken.enabled) {
		lines.push(
			`debug_token: ${params.debugToken.attempted ? 'tentado' : 'não tentado'} · ok=${String(params.debugToken.ok)} · is_valid=${String(params.debugToken.isValid)}`
		)
		if (params.debugToken.expiry?.expiresAtIso) {
			lines.push(
				`Token expira em: ${new Date(params.debugToken.expiry.expiresAtIso).toLocaleString('pt-BR')} · status=${params.debugToken.expiry.status}`
			)
		}
	}

	const traces = collectFbtraceIds(params.checks)
	if (traces.length) {
		lines.push('')
		lines.push(`fbtrace_id (Meta): ${traces.join(', ')}`)
	}

	const problems = params.checks.filter((c) => c.status === 'fail' || c.status === 'warn')
	if (problems.length) {
		lines.push('')
		lines.push('Resumo de problemas:')
		for (const c of problems) {
			lines.push(`- [${c.status.toUpperCase()}] ${c.title}: ${c.message}`)
			const ge = extractGraphErrorFromUnknown((c.details as any)?.error || (c.details as any)?.details || null)
			if (ge?.code || ge?.message || ge?.fbtrace_id) {
				lines.push(
					`  Graph error: code=${String(ge.code ?? '—')} sub=${String(ge.error_subcode ?? '—')} msg=${String(ge.message ?? '—')} fbtrace_id=${String(ge.fbtrace_id ?? '—')}`
				)
			}
		}
	}

	lines.push('')
	lines.push('Checklist rápido (pra triagem):')
	lines.push('- Health Status BLOCKED? (se sim, é Meta-side: pagamento/qualidade/revisão)')
	lines.push('- debug_token válido e com escopos whatsapp_business_*?')
	lines.push('- WABA/PHONE_NUMBER acessíveis (sem 100/33)?')
	lines.push('- Webhook subscribed_apps com "messages" ativo (pra delivered/read)?')

	return lines.join('\n')
}

function computeWebhookUrl(): { webhookUrl: string; vercelEnv: string | null } {
	let webhookUrl: string
	const vercelEnv = process.env.VERCEL_ENV || null

	if (vercelEnv === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
		webhookUrl = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.trim()}/api/webhook`
	} else if (process.env.VERCEL_URL) {
		webhookUrl = `https://${process.env.VERCEL_URL.trim()}/api/webhook`
	} else if (process.env.NEXT_PUBLIC_APP_URL) {
		webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL.trim()}/api/webhook`
	} else {
		webhookUrl = 'http://localhost:3000/api/webhook'
	}

	return { webhookUrl, vercelEnv }
}

async function graphGet(
	path: string,
	accessToken: string,
	params?: Record<string, string | number | boolean>
) {
	const url = new URL(`${META_API_BASE}${path.startsWith('/') ? path : `/${path}`}`)
	for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, String(v))

	const res = await fetchWithTimeout(url.toString(), {
		method: 'GET',
		headers: { Authorization: `Bearer ${accessToken}` },
		cache: 'no-store',
		timeoutMs: 12000,
	})

	const json = await safeJson<any>(res)
	return { ok: res.ok, status: res.status, json }
}

function extractGraphError(json: any) {
	const err = json?.error || json
	return {
		message: err?.message ?? null,
		type: err?.type ?? null,
		code: err?.code ?? null,
		error_subcode: err?.error_subcode ?? null,
		fbtrace_id: err?.fbtrace_id ?? null,
		error_user_title: err?.error_user_title ?? null,
		error_user_msg: err?.error_user_msg ?? null,
		error_data: err?.error_data ?? null,
	}
}

function buildMissingPermissionsSteps(params: { objectLabel: string; objectId: string }) {
	return [
		`Confirme que o ${params.objectLabel} (${params.objectId}) está correto (copie do painel do WhatsApp Manager).`,
		'Se estiver usando token gerado no painel do App (Configuração da API), gere novamente selecionando a WABA/número corretos antes de copiar.',
		'No Business Manager: crie/seleciona um System User (recomendado) e atribua os ativos do WhatsApp (WABA + Phone Number).',
		'Gere um token (ideal: System User) com as permissões whatsapp_business_messaging e whatsapp_business_management.',
		'No Dispara: cole esse token e os IDs corretos em Ajustes → Credenciais WhatsApp.',
		'Volte aqui e clique em Atualizar para revalidar.',
	]
}

function asStringArray(v: unknown): string[] {
	if (!v) return []
	if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string')
	if (typeof v === 'string') return [v]
	return []
}

function buildMissingScopesSteps(missing: string[]) {
	const list = missing.length ? missing.join(', ') : '—'
	return [
		`Gere um token com os escopos/permissões: ${list}.`,
		'Recomendado: usar System User no Business Manager e atribuir os ativos (WABA + Phone Number) antes de gerar o token.',
		'No Dispara: atualize o token em Ajustes → Credenciais WhatsApp e rode o diagnóstico novamente.',
	]
}

async function assertGraphObjectReadable(params: {
	objectId: string
	accessToken: string
	fields?: string
	objectLabel: string
}): Promise<{ ok: true } | { ok: false; check: DiagnosticCheck }> {
	const fields = (params.fields || 'id').trim()
	const r = await graphGet(`/${params.objectId}`, params.accessToken, { fields })

	if (r.ok) return { ok: true }

	const ge = extractGraphError(r.json)
	const code = Number(ge.code)
	const subcode = Number(ge.error_subcode)
	const isMissingPermissionsOrWrongId = code === 100 && subcode === 33
	const isTokenInvalid = code === 190

	const nextSteps = isMissingPermissionsOrWrongId
		? buildMissingPermissionsSteps({ objectLabel: params.objectLabel, objectId: params.objectId })
		: isTokenInvalid
			? [
				'Regenere o token (pode estar expirado/invalidado).',
				'Garanta que o token foi gerado para o Business/ativo correto e com as permissões de WhatsApp.',
				'Atualize as credenciais no Dispara e tente novamente.',
			]
			: [
				'Confira os detalhes técnicos (error code/subcode/fbtrace_id).',
				'Tente novamente após alguns minutos (pode ser instabilidade).',
				'Se persistir, envie o relatório ao suporte com fbtrace_id.',
			]

	const title = `Acesso ao ${params.objectLabel}`
	const message = isMissingPermissionsOrWrongId
		? `Sem acesso ao ${params.objectLabel} pelo token atual (ou ID incorreto).`
		: isTokenInvalid
			? `Token inválido/expirado ao consultar ${params.objectLabel}.`
			: `Falha ao consultar ${params.objectLabel} (ver detalhes).`

	return {
		ok: false,
		check: {
			id: `meta_access_${params.objectLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
			title,
			status: 'fail',
			message,
			details: {
				objectId: params.objectId,
				error: ge,
				nextSteps,
				docs:
					'Graph API error handling: https://developers.facebook.com/docs/graph-api/guides/error-handling',
			},
			actions: [
				{
					id: 'open_settings',
					label: 'Abrir Ajustes',
					kind: 'link',
					href: '/settings',
				},
			],
		},
	}
}

async function tryGetWithFields(objectId: string, accessToken: string, fieldsList: string[]) {
	for (const fields of fieldsList) {
		const res = await graphGet(`/${objectId}`, accessToken, { fields })
		if (res.ok) return { ok: true as const, fields, data: res.json }
	}
	// Last attempt: no fields
	const fallback = await graphGet(`/${objectId}`, accessToken)
	return {
		ok: false as const,
		error: fallback.json?.error || fallback.json || { message: 'Falha ao consultar Graph' },
	}
}

async function getMetaSubscriptionStatus(params: { wabaId: string; accessToken: string }) {
	const { wabaId, accessToken } = params
	const res = await graphGet(`/${wabaId}/subscribed_apps`, accessToken, {
		fields: 'id,name,subscribed_fields',
	})

	if (!res.ok) {
		return {
			ok: false as const,
			status: res.status,
			error: res.json?.error?.message || 'Erro ao consultar subscribed_apps',
			details: res.json?.error || res.json,
		}
	}

	const apps = (res.json?.data || []) as MetaSubscribedApp[]
	const subscribedFields = normalizeSubscribedFields(apps)
	return {
		ok: true as const,
		status: 200,
		apps,
		subscribedFields,
		messagesSubscribed: subscribedFields.includes('messages'),
	}
}

async function getInternalRecentFailures() {
	// Best-effort: se o Supabase não estiver configurado, não quebra o diagnóstico.
	try {
		const sevenDaysAgo = new Date()
		sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

		// campaign_contacts não tem created_at/updated_at no schema base.
		// Usamos failed_at como fonte de "recência" para falhas.
		// Algumas colunas (failure_title) podem não existir em bases antigas.
		let data: any[] | null = null
		{
			const first = await supabase
				.from('campaign_contacts')
				.select('failure_code,failure_title,failure_reason,failed_at')
				.eq('status', 'failed')
				.gte('failed_at', sevenDaysAgo.toISOString())
				.limit(500)
			if (first.error) {
				// Retry sem failure_title (coluna pode não existir)
				const second = await supabase
					.from('campaign_contacts')
					.select('failure_code,failure_reason,failed_at')
					.eq('status', 'failed')
					.gte('failed_at', sevenDaysAgo.toISOString())
					.limit(500)
				if (second.error) throw second.error
				data = (second.data || []) as any[]
			} else {
				data = (first.data || []) as any[]
			}
		}

		const counts = new Map<string, { code: number; title: string | null; count: number }>()
		for (const row of (data || []) as any[]) {
			const rawCode = row.failure_code
			const code = typeof rawCode === 'number' ? rawCode : Number(rawCode)
			if (!Number.isFinite(code)) continue
			const key = String(code)
			const prev = counts.get(key)
			counts.set(key, {
				code,
				title: (() => {
					if (row.failure_title && typeof row.failure_title === 'string') return row.failure_title
					if (row.failure_reason && typeof row.failure_reason === 'string') return row.failure_reason
					return prev?.title || null
				})(),
				count: (prev?.count || 0) + 1,
			})
		}

		const top = Array.from(counts.values())
			.sort((a, b) => b.count - a.count)
			.slice(0, 20)

		return { ok: true as const, top, totalFailedRows: (data || []).length }
	} catch (e) {
		const norm = normalizeUnknownError(e)
		return {
			ok: false as const,
			error: norm.message,
			details: norm.details,
		}
	}
}

async function getInternalLastStatusUpdateAt(): Promise<
	{ ok: true; lastAt: string | null } | { ok: false; error: string; details?: Record<string, unknown> }
> {
	try {
		// campaign_contacts não tem created_at/updated_at no schema base.
		// Para saber se "está vivo", pegamos o maior timestamp entre colunas de status.
		const candidates = ['read_at', 'delivered_at', 'sent_at', 'failed_at', 'skipped_at', 'sending_at'] as const

		async function getLatestFromColumn(col: (typeof candidates)[number]): Promise<string | null> {
			try {
				const r = await supabase
					.from('campaign_contacts')
					.select(col)
					.order(col, { ascending: false })
					.limit(1)
				if (r.error) {
					// coluna pode não existir (ex.: skipped_at/sending_at em bases antigas)
					return null
				}
				const v = (r.data?.[0] as any)?.[col]
				return v ? String(v) : null
			} catch {
				return null
			}
		}

		const values = await Promise.all(candidates.map((c) => getLatestFromColumn(c)))
		const parsed = values
			.filter((v): v is string => Boolean(v))
			.map((v) => ({ v, t: Date.parse(v) }))
			.filter((x) => Number.isFinite(x.t))
			.sort((a, b) => b.t - a.t)

		const lastAt = parsed.length ? parsed[0].v : null
		return { ok: true, lastAt }
	} catch (e) {
		const norm = normalizeUnknownError(e)
		return { ok: false, error: norm.message, details: norm.details }
	}
}

function buildReportText(
	checks: DiagnosticCheck[],
	meta: { vercelEnv: string | null; webhookUrl: string; source: string },
	extra?: { tokenExpiry?: TokenExpirySummary | null; fbtraceIds?: string[] }
) {
	function hasCodeDeep(value: unknown, code: number): boolean {
		if (!value) return false
		if (typeof value === 'number') return value === code
		if (typeof value === 'string') {
			return value.includes(String(code)) || value.toLowerCase().includes('business account locked')
		}
		if (Array.isArray(value)) return value.some((v) => hasCodeDeep(v, code))
		if (typeof value === 'object') {
			const o = value as any
			if (Number(o?.code) === code) return true
			if (Number(o?.error_code) === code) return true
			if (o?.error && hasCodeDeep(o.error, code)) return true
			// padrão do nosso recentFailures.top[]
			if (Array.isArray(o?.top) && o.top.some((x: any) => Number(x?.code) === code)) return true
			for (const k of Object.keys(o)) {
				if (hasCodeDeep(o[k], code)) return true
			}
			return false
		}
		return false
	}

	const statusEmoji = (s: CheckStatus) => {
		switch (s) {
			case 'pass':
				return '✅'
			case 'warn':
				return '⚠️'
			case 'fail':
				return '❌'
			default:
				return 'ℹ️'
		}
	}

	const lines = [] as string[]
	lines.push(`Dispara · Diagnóstico Meta/WhatsApp · ${new Date().toLocaleString('pt-BR')}`)
	lines.push(`Ambiente: ${meta.vercelEnv || 'desconhecido'} · Credenciais: ${meta.source}`)
	lines.push(`Webhook esperado: ${meta.webhookUrl}`)
	if (extra?.tokenExpiry?.expiresAtIso) {
		lines.push(
			`Token expira em: ${new Date(extra.tokenExpiry.expiresAtIso).toLocaleString('pt-BR')} · status=${extra.tokenExpiry.status}`
		)
	}
	if (extra?.fbtraceIds?.length) {
		lines.push(`fbtrace_id: ${extra.fbtraceIds.join(', ')}`)
	}
	const health = checks.find((c) => c.id === 'meta_health_status')
	const healthOverall = String((health?.details as any)?.overall || '')
	const healthIsBlocked = health?.status === 'fail' || healthOverall === 'BLOCKED'
	const has131031Anywhere = checks.some(
		(c) => hasCodeDeep(c.details, META_BUSINESS_LOCKED_CODE) || hasCodeDeep(c.message, META_BUSINESS_LOCKED_CODE)
	)
	const has131031InInternal = (() => {
		const internal = checks.find((c) => c.id === 'internal_recent_failures')
		return Boolean(internal && hasCodeDeep(internal.details, META_BUSINESS_LOCKED_CODE))
	})()

	if (healthIsBlocked) {
		lines.push('ALERTA: Health Status indica BLOQUEIO para envio (BLOCKED).')
		if (has131031Anywhere) {
			lines.push(`Detalhe: há sinais do código ${META_BUSINESS_LOCKED_CODE} (Business Account locked) nos retornos.`)
		}
	} else if (has131031InInternal) {
		lines.push(
			`SINAL: o código ${META_BUSINESS_LOCKED_CODE} apareceu em falhas recentes (últimos 7 dias). Health Status atual não está BLOCKED — pode ter sido temporário.`
		)
	}
	lines.push('')

	for (const c of checks) {
		lines.push(`${statusEmoji(c.status)} ${c.title} — ${c.message}`)
	}

	return lines.join('\n')
}

function summarizeHealthStatus(raw: any) {
	const hs = raw?.health_status
	const overall = String(hs?.can_send_message || '')
	const entities = Array.isArray(hs?.entities) ? hs.entities : []
	const blocked = entities.filter((e: any) => String(e?.can_send_message || '') === 'BLOCKED')
	const limited = entities.filter((e: any) => String(e?.can_send_message || '') === 'LIMITED')

	const errors = blocked
		.flatMap((e: any) => (Array.isArray(e?.errors) ? e.errors : []))
		.map((er: any) => ({
			error_code: er?.error_code ?? null,
			error_description: er?.error_description ?? null,
			possible_solution: er?.possible_solution ?? null,
		}))

	const additionalInfo = limited
		.flatMap((e: any) => (Array.isArray(e?.additional_info) ? e.additional_info : []))
		.filter(Boolean)

	return {
		overall,
		blockedEntities: blocked.map((e: any) => ({ entity_type: e?.entity_type, id: e?.id })),
		limitedEntities: limited.map((e: any) => ({ entity_type: e?.entity_type, id: e?.id })),
		errors,
		additionalInfo,
	}
}

function describeRecentSignatureFailures(status: MetaSignatureStatus): string {
	const f = status.recentFailures
	if (!f.total) return ''
	const invalid = f.byReason.invalid_signature || 0
	const missing = (f.byReason.missing_signature || 0) + (f.byReason.malformed_signature || 0)
	const parts = [
		invalid ? `${invalid} com assinatura que não confere` : null,
		missing ? `${missing} sem assinatura/malformada(s)` : null,
	].filter(Boolean)
	return parts.length ? ` Falhas recentes (últimos ${f.windowMinutes} min, nesta instância): ${parts.join(', ')}.` : ''
}

function buildWebhookSignatureCheck(status: MetaSignatureStatus): DiagnosticCheck {
	const details: Record<string, unknown> = {
		mode: status.mode,
		verification: status.verification,
		secretSource: status.secretSource,
		requireSignature: status.requireSignature,
		verifiedAt: status.verifiedAt,
		lastValidSignatureAt: status.lastValidSignatureAt,
		recentFailures: status.recentFailures,
		recentAlerts: status.recentAlerts,
		recommendedAction: status.recommendedAction,
	}
	const openSettings = [
		{ id: 'open_settings', label: 'Configurar App Secret', kind: 'link' as const, href: '/settings' },
	]
	const failures = describeRecentSignatureFailures(status)

	if (status.error) {
		return {
			id: 'webhook_signature',
			title: 'Assinatura do webhook (X-Hub-Signature-256)',
			status: 'warn',
			message: 'Não foi possível ler o App Secret agora; o webhook rejeita requisições até conseguir ler (fail-closed).',
			details: { ...details, error: status.error },
		}
	}

	if (status.mode === 'report_only') {
		const invalid = status.recentFailures.byReason.invalid_signature || 0
		return {
			id: 'webhook_signature',
			title: 'Assinatura do webhook (X-Hub-Signature-256)',
			status: 'warn',
			message:
				'Em verificação (pending_verification): o App Secret salvo em Configurações ainda não foi confirmado por uma requisição assinada da Meta, então a assinatura é conferida mas NÃO exigida. ' +
				(invalid
					? 'Há requisições recentes com assinatura que não confere: confira se o App Secret é o do mesmo App da Meta que envia o webhook.'
					: 'Passa a ser exigida automaticamente na primeira assinatura válida.') +
				failures,
			details,
			actions: openSettings,
		}
	}

	if (status.mode === 'enforced' && status.secretSource) {
		const source = status.secretSource === 'env' ? 'env META_APP_SECRET' : 'Configurações'
		const verified = status.verification === 'verified' ? ' (verified: confirmado por assinatura válida da Meta)' : ''
		return {
			id: 'webhook_signature',
			title: 'Assinatura do webhook (X-Hub-Signature-256)',
			status: 'pass',
			message: `Exigida (App Secret via ${source})${verified}. Requisições sem assinatura válida são rejeitadas.${failures}`,
			details,
		}
	}

	if (status.rejectsAll) {
		return {
			id: 'webhook_signature',
			title: 'Assinatura do webhook (X-Hub-Signature-256)',
			status: 'fail',
			message: 'META_WEBHOOK_REQUIRE_SIGNATURE=true sem App Secret: todo POST da Meta (webhook e Flows) está sendo rejeitado. Configure o App Secret em Configurações.',
			details,
			actions: openSettings,
		}
	}

	return {
		id: 'webhook_signature',
		title: 'Assinatura do webhook (X-Hub-Signature-256)',
		status: 'warn',
		message:
			'Não verificada (unsigned_allowed): sem App Secret, o webhook e o endpoint de Flows aceitam requisições sem assinatura — qualquer um que conheça a URL pode forjar mensagens recebidas, opt-outs e respostas de Flows. ' +
			'Configurar o App Secret em Configurações é o que fecha esse buraco (status de templates vindos sem assinatura já são ignorados).',
		details,
		actions: openSettings,
	}
}

async function buildFlowEndpointKeysCheck(): Promise<DiagnosticCheck> {
	const title = 'Chave do endpoint de Flows (MiniApp Dinâmico)'
	const failures = getFlowDecryptFailureSummary()
	const [inspection, recentAlerts] = await Promise.all([
		inspectFlowPublicKey().catch(
			(error): FlowPublicKeyInspection => ({
				status: 'failed',
				error: error instanceof Error ? error.message : String(error),
			})
		),
		listRecentMetaIntegrationAlerts(FLOW_KEYS_ALERT_ID_PREFIX, 3),
	])
	const details: Record<string, unknown> = {
		inspection,
		recentDecryptFailures: failures,
		recentAlerts,
		recommendedAction: FLOW_KEYS_RECOMMENDED_ACTION,
	}
	const syncAction = {
		id: 'flow_keys_sync',
		label: 'Re-sincronizar chave dos Flows',
		kind: 'api' as const,
		method: 'POST' as const,
		endpoint: '/api/flows/endpoint/keys/sync',
	}
	const generateAction = {
		id: 'flow_keys_generate',
		label: 'Gerar chaves do endpoint de Flows',
		kind: 'api' as const,
		method: 'POST' as const,
		endpoint: '/api/flows/endpoint/keys',
	}
	const failuresText = failures.total
		? ` ${failures.total} falha(s) de decifração nos últimos ${failures.windowMinutes} min (nesta instância).`
		: ''

	switch (inspection.status) {
		case 'in_sync':
			return {
				id: 'flow_endpoint_keys',
				title,
				status: 'pass',
				message: `A chave pública registrada na Meta é a do endpoint.${failuresText}`,
				details,
			}
		case 'mismatch':
			return {
				id: 'flow_endpoint_keys',
				title,
				status: inspection.metaHasKey || failures.total ? 'warn' : 'info',
				message: inspection.metaHasKey
					? `A chave pública registrada na Meta NÃO é a do endpoint: MiniApps com endpoint recebem erro 421 até re-sincronizar.${failuresText}`
					: `Nenhuma chave pública registrada na Meta para este número (só necessária para MiniApps com endpoint).${failuresText}`,
				details,
				actions: [syncAction],
			}
		case 'missing_local_key':
		case 'invalid_local_key': {
			// Só falha com assinatura VERIFICADA é prova de que a Meta está chamando o
			// endpoint; sem ela pode ser só lixo anônimo (qualquer um faz POST aqui).
			const onlyUnverified = failures.total > 0 && failures.verifiedTotal === 0
			return {
				id: 'flow_endpoint_keys',
				title,
				status: failures.verifiedTotal ? 'fail' : failures.total ? 'warn' : 'info',
				message:
					(inspection.status === 'missing_local_key'
						? 'Endpoint de Flows sem chave privada configurada (só necessária para MiniApps com endpoint).'
						: 'A chave privada salva do endpoint de Flows é inválida.') +
					failuresText +
					(onlyUnverified ? ' Nenhuma delas tinha assinatura verificada: podem ser requisições de terceiros (ruído), não da Meta.' : ''),
				details,
				actions: [generateAction],
			}
		}
		case 'no_credentials':
			return {
				id: 'flow_endpoint_keys',
				title,
				status: 'info',
				message: `Sem credenciais do WhatsApp para conferir a chave na Meta.${failuresText}`,
				details,
			}
		default:
			return {
				id: 'flow_endpoint_keys',
				title,
				status: failures.total ? 'warn' : 'info',
				message: `Não foi possível conferir a chave registrada na Meta: ${inspection.error}.${failuresText}`,
				details,
				actions: [syncAction],
			}
	}
}

/**
 * GET /api/meta/diagnostics
 * Centraliza o diagnóstico (infra + credenciais + Graph API + sinais internos).
 */
export async function GET() {
	const ts = new Date().toISOString()

	const { webhookUrl, vercelEnv } = computeWebhookUrl()
	const webhookToken = await getVerifyToken().catch(() => null)

	const credentials = await getWhatsAppCredentials().catch(() => null)
	const source = credentials ? 'db' : 'none'
	const webhookSignature = await getMetaSignatureStatus()

	const checks: DiagnosticCheck[] = []

	// 0) Infra básica
	const hasSupabaseUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)
	const hasSupabaseSecretKey = Boolean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)

	checks.push({
		id: 'infra_supabase',
		title: 'Supabase configurado',
		status: hasSupabaseUrl && hasSupabaseSecretKey ? 'pass' : 'fail',
		message:
			hasSupabaseUrl && hasSupabaseSecretKey
				? 'OK (URL + service role presentes)'
				: 'Faltando NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SECRET_KEY',
		details: {
			hasSupabaseUrl,
			hasSupabaseSecretKey,
		},
	})

	// 0.1) Assinatura do webhook: 'enforced' (com App Secret) ou 'unsigned_allowed'
	checks.push(buildWebhookSignatureCheck(webhookSignature))

	// 1) Credenciais
	if (!credentials?.accessToken || !credentials?.businessAccountId || !credentials?.phoneNumberId) {
		checks.push({
			id: 'creds',
			title: 'Credenciais WhatsApp',
			status: 'fail',
			message: 'Não configuradas (precisa token + WABA ID + phone number ID)',
			actions: [
				{
					id: 'open_settings',
					label: 'Abrir Ajustes',
					kind: 'link',
					href: '/settings',
				},
			],
		})

		return noStoreJson(
			{
				ok: false,
				ts,
				checks,
				env: {
					vercelEnv,
					vercelUrl: process.env.VERCEL_URL || null,
					vercelProjectProductionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL || null,
				},
				webhook: {
					expectedUrl: webhookUrl,
					verifyTokenPreview: maskTokenPreview(webhookToken),
					signature: webhookSignature,
				},
				whatsapp: {
					credentialsSource: source,
					businessAccountId: credentials?.businessAccountId ? maskId(credentials.businessAccountId) : null,
					phoneNumberId: credentials?.phoneNumberId ? maskId(credentials.phoneNumberId) : null,
					accessTokenPreview: credentials?.accessToken ? maskTokenPreview(credentials.accessToken) : null,
				},
				meta: null,
				internal: null,
				report: {
					text: buildReportText(checks, { vercelEnv, webhookUrl, source }),
				},
			},
			{ status: 200 }
		)
	}

	checks.push({
		id: 'creds',
		title: 'Credenciais WhatsApp',
		status: 'pass',
		message: `OK (fonte: ${source})`,
		details: {
			wabaId: maskId(credentials.businessAccountId),
			phoneNumberId: maskId(credentials.phoneNumberId),
			accessToken: maskTokenPreview(credentials.accessToken),
		},
		actions: [
			{
				id: 'open_settings',
				label: 'Abrir Ajustes',
				kind: 'link',
				href: '/settings',
			},
		],
	})

	// 1.1) Endpoint de Flows: chave local x chave registrada na Meta + falhas de decifração
	checks.push(await buildFlowEndpointKeysCheck())

	// 2) Graph API — token sanity
	const meta: Record<string, unknown> = {
		me: null,
		mePermissions: null,
		waba: null,
		wabaPhoneNumbers: null,
		phoneNumber: null,
		templates: null,
		subscription: null,
		debugToken: null,
	}

	let debugTokenData: any = null
	let debugTokenAttempted = false
	let debugTokenOk: boolean | null = null
	let debugTokenIsValid: boolean | null = null
	let debugTokenError: any = null
	let tokenExpirySummary: TokenExpirySummary | null = null

	// 2a) debug_token (opcional, depende de APP_ID/APP_SECRET configurados no banco)
	const appCreds = await getMetaAppCredentials()
	const metaAppSource: 'db' | 'none' = appCreds ? 'db' : 'none'
	const appId = (appCreds?.appId || '').trim()
	const appSecret = (appCreds?.appSecret || '').trim()
	if (appId && appSecret) {
		try {
			debugTokenAttempted = true
			const appAccessToken = `${appId}|${appSecret}`
			const dbg = await graphGet('/debug_token', appAccessToken, { input_token: credentials.accessToken })
			debugTokenData = dbg.ok ? (dbg.json?.data || null) : null
			tokenExpirySummary = dbg.ok ? computeTokenExpirySummary(dbg.json?.data || null) : null
			meta.debugToken = dbg.ok ? dbg.json?.data || dbg.json : dbg.json
			debugTokenOk = dbg.ok
			debugTokenIsValid = dbg.ok ? (dbg.json?.data?.is_valid ?? null) : null
			debugTokenError = dbg.ok ? null : (dbg.json?.error || dbg.json)

			if (dbg.ok && dbg.json?.data?.is_valid === false) {
				checks.push({
					id: 'meta_debug_token',
					title: 'Token (debug_token)',
					status: 'fail',
					message: 'Token inválido segundo /debug_token',
					details: { data: dbg.json?.data || null },
				})
			} else if (dbg.ok) {
				checks.push({
					id: 'meta_debug_token',
					title: 'Token (debug_token)',
					status: 'pass',
					message: 'Token válido segundo /debug_token',
					details: {
						appId: dbg.json?.data?.app_id || null,
						type: dbg.json?.data?.type || null,
						userId: dbg.json?.data?.user_id || null,
						expiresAt: dbg.json?.data?.expires_at || null,
						dataAccessExpiresAt: dbg.json?.data?.data_access_expires_at || null,
						scopes: dbg.json?.data?.scopes || null,
						granularScopes: dbg.json?.data?.granular_scopes || null,
					},
				})
			} else {
				checks.push({
					id: 'meta_debug_token',
					title: 'Token (debug_token)',
					status: 'warn',
					message: 'Não foi possível validar via /debug_token (ver detalhes)',
					details: { error: dbg.json?.error || dbg.json },
				})
			}
		} catch (e) {
			debugTokenAttempted = true
			debugTokenOk = false
			debugTokenIsValid = null
			debugTokenError = e instanceof Error ? e.message : String(e)
			checks.push({
				id: 'meta_debug_token',
				title: 'Token (debug_token)',
				status: 'warn',
				message: 'Falha ao chamar /debug_token (best-effort)',
				details: { error: e instanceof Error ? e.message : String(e) },
			})
		}
	} else {
		checks.push({
			id: 'meta_debug_token',
			title: 'Token (debug_token)',
			status: 'info',
			message: 'Opcional — defina META_APP_ID e META_APP_SECRET para habilitar validação forte via /debug_token',
		})
	}

	// 2a.1) Avalia escopos e “asset assignment” usando debug_token (quando disponível)
	if (debugTokenData && debugTokenData?.is_valid !== false) {
		const scopes = asStringArray(debugTokenData?.scopes)
		const required = ['whatsapp_business_messaging', 'whatsapp_business_management']
		const missing = required.filter((s) => !scopes.includes(s))
		const missingCritical = missing.includes('whatsapp_business_messaging')
		const status: CheckStatus = missing.length === 0 ? 'pass' : (missingCritical ? 'fail' : 'warn')

		checks.push({
			id: 'meta_token_scopes',
			title: 'Permissões do token (escopos)',
			status,
			message:
				missing.length === 0
					? 'Escopos principais presentes (via /debug_token)'
					: `Escopos ausentes no token: ${missing.join(', ')}`,
			details: {
				required,
				scopes,
				missing,
				nextSteps: missing.length ? buildMissingScopesSteps(missing) : undefined,
				docs: 'Acess tokens (Meta): https://developers.facebook.com/docs/facebook-login/guides/access-tokens',
			},
		})

		// Heurística: granular_scopes pode indicar a quais assets o token está amarrado
		const granular = Array.isArray(debugTokenData?.granular_scopes) ? debugTokenData.granular_scopes : []
		if (granular.length > 0) {
			const targets = new Set<string>()
			for (const g of granular) {
				const s = typeof g?.scope === 'string' ? g.scope : null
				if (!s) continue
				if (!required.includes(s)) continue
				const ids = Array.isArray(g?.target_ids) ? g.target_ids : []
				for (const id of ids) {
					if (id == null) continue
					targets.add(String(id))
				}
			}

			const wabaOk = targets.size === 0 ? null : targets.has(String(credentials.businessAccountId))
			const phoneOk = targets.size === 0 ? null : targets.has(String(credentials.phoneNumberId))
			const assetMismatch = (wabaOk === false) || (phoneOk === false)

			checks.push({
				id: 'meta_token_assets',
				title: 'Acesso do token aos ativos (heurística)',
				status: assetMismatch ? 'warn' : 'info',
				message: assetMismatch
					? 'O token parece não estar atribuído aos IDs configurados (possível “app/asset mismatch”)'
					: 'Sem evidência clara de mismatch (granular_scopes) — valide pelos checks de acesso ao WABA/PHONE_NUMBER',
				details: {
					granularScopes: granular,
					targetIds: Array.from(targets),
					wabaId: credentials.businessAccountId,
					phoneNumberId: credentials.phoneNumberId,
					wabaMatches: wabaOk,
					phoneMatches: phoneOk,
					nextSteps: assetMismatch
						? buildMissingPermissionsSteps({ objectLabel: 'ativos (WABA/PHONE_NUMBER)', objectId: `${credentials.businessAccountId} / ${credentials.phoneNumberId}` })
						: undefined,
				},
			})
		}

		// Token gerado por outro app pode confundir alunos (especialmente quando misturam apps/painéis)
		if (debugTokenData?.app_id && String(debugTokenData.app_id) !== String(appId)) {
			checks.push({
				id: 'meta_token_app_id',
				title: 'Origem do token (app_id)',
				status: 'warn',
				message: 'O token parece ter sido gerado por outro App da Meta (app_id diferente do configurado)',
				details: {
					configuredMetaAppId: appId,
					tokenAppId: debugTokenData.app_id,
					nextSteps: [
						'Gere o token no mesmo App que você usa para configurar o produto WhatsApp e o webhook.',
						'Evite misturar tokens de apps diferentes (isso causa “Unsupported post request / missing permissions”).',
					],
				},
			})
		}
	}

	// 2b) /me + /me/permissions (melhor para identificar tipo/escopo do token)
	try {
		const me = await graphGet('/me', credentials.accessToken, { fields: 'id,name' })
		meta.me = me.ok ? me.json : me.json

		const perms = await graphGet('/me/permissions', credentials.accessToken)
		meta.mePermissions = perms.ok ? perms.json : perms.json

		if (me.ok) {
			checks.push({
				id: 'meta_me',
				title: 'Token autenticado (me)',
				status: 'pass',
				message: 'Conseguiu ler /me',
				details: { id: me.json?.id || null, name: me.json?.name || null },
			})
		} else {
			checks.push({
				id: 'meta_me',
				title: 'Token autenticado (me)',
				status: 'fail',
				message: 'Falha ao ler /me — token pode estar inválido/expirado',
				details: { error: me.json?.error || me.json },
			})
		}

		// Permissões esperadas (heurística) — para System User tokens isso pode vir vazio/indisponível.
		if (!perms.ok) {
			checks.push({
				id: 'meta_permissions',
				title: 'Permissões do token (/me/permissions)',
				status: 'info',
				message: 'Não foi possível ler /me/permissions (isso é comum em alguns tipos de token) — use /debug_token e os checks de acesso a ativos',
				details: { error: perms.json?.error || perms.json },
			})
		} else {
			const granted = new Set<string>()
			const rows = Array.isArray((perms as any)?.json?.data) ? (perms as any).json.data : []
			for (const r of rows) {
				if (r?.status === 'granted' && typeof r.permission === 'string') granted.add(r.permission)
			}

			const needs = ['whatsapp_business_management', 'whatsapp_business_messaging']
			const missing = needs.filter((p) => !granted.has(p))
			checks.push({
				id: 'meta_permissions',
				title: 'Permissões do token (/me/permissions)',
				status: missing.length === 0 ? 'pass' : 'warn',
				message:
					missing.length === 0
						? 'Permissões principais presentes'
						: `Possíveis permissões ausentes: ${missing.join(', ')}`,
				details: {
					granted: Array.from(granted),
					missing,
					note: 'Heurística: /me/permissions funciona melhor para tokens de usuário. Para System User, prefira /debug_token (escopos) + checks de acesso ao WABA/PHONE_NUMBER.',
				},
			})
		}
	} catch (e) {
		checks.push({
			id: 'meta_me',
			title: 'Token autenticado (me)',
			status: 'warn',
			message: 'Falha ao consultar /me (best-effort)',
			details: { error: e instanceof Error ? e.message : String(e) },
		})
	}

	// 2c) WABA
	try {
		// 2c.0) Confirma acesso direto ao objeto WABA (pega erros 100/33 com mensagem bem orientada)
		{
			const access = await assertGraphObjectReadable({
				objectId: credentials.businessAccountId,
				accessToken: credentials.accessToken,
				fields: 'id,name',
				objectLabel: 'WABA',
			})
			if (!access.ok) {
				checks.push(access.check)
			}
		}

		const waba = await tryGetWithFields(credentials.businessAccountId, credentials.accessToken, [
			'id,name,currency,timezone_id,ownership_type,account_review_status',
			'id,name,currency,timezone_id',
			'id,name',
		])
		meta.waba = waba.ok ? waba.data : waba

		if (waba.ok) {
			checks.push({
				id: 'meta_waba',
				title: 'WABA acessível',
				status: 'pass',
				message: 'OK',
				details: {
					id: (waba as any).data?.id || null,
					name: (waba as any).data?.name || null,
					accountReviewStatus: (waba as any).data?.account_review_status || null,
				},
			})
		} else {
			checks.push({
				id: 'meta_waba',
				title: 'WABA acessível',
				status: 'fail',
				message: 'Falha ao consultar WABA (token sem acesso ao ativo?)',
				details: { error: (waba as any).error || null },
			})
		}

		const wabaPhones = await graphGet(
			`/${credentials.businessAccountId}/phone_numbers`,
			credentials.accessToken,
			{
				fields: 'id,display_phone_number,verified_name,quality_rating,webhook_configuration',
				limit: 50,
			}
		)
		meta.wabaPhoneNumbers = wabaPhones.ok ? wabaPhones.json : wabaPhones.json

		if (wabaPhones.ok) {
			const list = Array.isArray(wabaPhones.json?.data) ? wabaPhones.json.data : []
			const hasConfiguredPhoneId = list.some(
				(p: any) => String(p?.id || '') === String(credentials.phoneNumberId)
			)

			checks.push({
				id: 'meta_waba_phone_link',
				title: 'Phone Number pertence ao WABA',
				status: hasConfiguredPhoneId ? 'pass' : 'fail',
				message: hasConfiguredPhoneId
					? 'OK'
					: 'O phoneNumberId configurado não apareceu na lista do WABA (IDs trocados ou token sem acesso)',
				details: {
					configuredPhoneNumberId: maskId(credentials.phoneNumberId),
					wabaPhoneNumbersCount: list.length,
				},
			})
		} else {
			checks.push({
				id: 'meta_waba_phone_link',
				title: 'Phone Number pertence ao WABA',
				status: 'warn',
				message: 'Não foi possível listar phone_numbers do WABA (best-effort)',
				details: { error: wabaPhones.json?.error || wabaPhones.json },
			})
		}
	} catch (e) {
		checks.push({
			id: 'meta_waba',
			title: 'WABA acessível',
			status: 'warn',
			message: 'Falha ao consultar WABA (best-effort)',
			details: { error: e instanceof Error ? e.message : String(e) },
		})
	}

	// 2d) Phone number (tier/quality)
	try {
		// 2d.0) Confirma acesso direto ao objeto PHONE_NUMBER (pega erros 100/33 com mensagem bem orientada)
		{
			const access = await assertGraphObjectReadable({
				objectId: credentials.phoneNumberId,
				accessToken: credentials.accessToken,
				fields: 'id,display_phone_number,verified_name',
				objectLabel: 'PHONE_NUMBER',
			})
			if (!access.ok) {
				checks.push(access.check)
			}
		}

		const phone = await tryGetWithFields(credentials.phoneNumberId, credentials.accessToken, [
			'id,display_phone_number,verified_name,code_verification_status,quality_rating,messaging_limit_tier,status',
			'id,display_phone_number,verified_name,quality_score,whatsapp_business_manager_messaging_limit',
			'id,display_phone_number,verified_name',
		])
		meta.phoneNumber = phone.ok ? phone.data : phone

		if (phone.ok) {
			const data = (phone as any).data
			const quality = data?.quality_rating || data?.quality_score?.score || null
			const tier =
				data?.messaging_limit_tier ||
				data?.whatsapp_business_manager_messaging_limit?.current_limit ||
				data?.whatsapp_business_manager_messaging_limit ||
				null

			checks.push({
				id: 'meta_phone',
				title: 'Número (tier/qualidade)',
				status: 'pass',
				message: 'OK',
				details: {
					displayPhoneNumber: data?.display_phone_number || null,
					verifiedName: data?.verified_name || null,
					status: data?.status || null,
					quality,
					tier,
				},
			})
		} else {
			checks.push({
				id: 'meta_phone',
				title: 'Número (tier/qualidade)',
				status: 'fail',
				message: 'Falha ao consultar phone number',
				details: { error: (phone as any).error || null },
			})
		}
	} catch (e) {
		checks.push({
			id: 'meta_phone',
			title: 'Número (tier/qualidade)',
			status: 'warn',
			message: 'Falha ao consultar phone number (best-effort)',
			details: { error: e instanceof Error ? e.message : String(e) },
		})
	}

	// 2d.1) Health Status (oficial) — forma mais confiável de saber se algo está BLOCKED/LIMITED
	// Docs: /docs/whatsapp/cloud-api/health-status
	try {
		const hs = await graphGet(`/${credentials.phoneNumberId}`, credentials.accessToken, {
			fields: 'health_status',
		})
		meta.healthStatus = hs.ok ? hs.json : hs.json

		if (hs.ok) {
			const summary = summarizeHealthStatus(hs.json)
			const overall = summary.overall
			const status: CheckStatus =
				overall === 'BLOCKED'
					? 'fail'
					: overall === 'LIMITED'
						? 'warn'
						: overall === 'AVAILABLE'
							? 'pass'
							: 'info'

			checks.push({
				id: 'meta_health_status',
				title: 'Status de integridade (envio) — Health Status',
				status,
				message:
					overall === 'BLOCKED'
						? 'Bloqueado para envio segundo Health Status'
						: overall === 'LIMITED'
							? 'Limitado para envio segundo Health Status'
							: overall === 'AVAILABLE'
								? 'Disponível para envio segundo Health Status'
								: `Health Status: ${overall || '—'}`,
				details: {
					...summary,
					raw: hs.json,
					note: 'Este check é a forma mais direta (documentada) de confirmar bloqueios/limites na cadeia APP → BUSINESS → WABA → PHONE_NUMBER → TEMPLATE.',
				},
			})
		} else {
			checks.push({
				id: 'meta_health_status',
				title: 'Status de integridade (envio) — Health Status',
				status: 'warn',
				message: 'Não foi possível consultar health_status (best-effort)',
				details: { error: hs.json?.error || hs.json },
			})
		}
	} catch (e) {
		checks.push({
			id: 'meta_health_status',
			title: 'Status de integridade (envio) — Health Status',
			status: 'warn',
			message: 'Falha ao consultar health_status (best-effort)',
			details: { error: e instanceof Error ? e.message : String(e) },
		})
	}

	// 2e) Templates
	try {
		const templates = await graphGet(
			`/${credentials.businessAccountId}/message_templates`,
			credentials.accessToken,
			{ limit: 50 }
		)
		meta.templates = templates.ok ? templates.json : templates.json

		if (templates.ok) {
			const list = Array.isArray(templates.json?.data) ? templates.json.data : []
			const approvedCount = list.filter(
				(t: any) => String(t?.status || '').toUpperCase() === 'APPROVED'
			).length
			checks.push({
				id: 'meta_templates',
				title: 'Templates',
				status: list.length > 0 ? 'pass' : 'warn',
				message:
					list.length > 0
						? `${list.length} templates encontrados (${approvedCount} aprovados)`
						: 'Nenhum template encontrado (ou token sem acesso)',
				details: { total: list.length, approved: approvedCount },
			})
		} else {
			checks.push({
				id: 'meta_templates',
				title: 'Templates',
				status: 'warn',
				message: 'Falha ao listar templates (best-effort)',
				details: { error: templates.json?.error || templates.json },
			})
		}
	} catch (e) {
		checks.push({
			id: 'meta_templates',
			title: 'Templates',
			status: 'warn',
			message: 'Falha ao listar templates (best-effort)',
			details: { error: e instanceof Error ? e.message : String(e) },
		})
	}

	// 2f) Subscription messages no WABA
	const sub = await getMetaSubscriptionStatus({
		wabaId: credentials.businessAccountId,
		accessToken: credentials.accessToken,
	})
	meta.subscription = sub

	if (sub.ok) {
		checks.push({
			id: 'meta_subscription_messages',
			title: 'Webhook (messages) inscrito no WABA',
			status: sub.messagesSubscribed ? 'pass' : 'fail',
			message: sub.messagesSubscribed
				? 'Ativo via API (subscribed_apps)'
				: 'Inativo via API (subscribed_apps) — não receberá status de mensagens',
			details: {
				subscribedFields: sub.subscribedFields,
				apps: sub.apps,
			},
			actions: sub.messagesSubscribed
				? [
						{
							id: 'unsubscribe_messages',
							label: 'Desativar messages',
							kind: 'api',
							endpoint: '/api/meta/webhooks/subscription',
							method: 'DELETE',
						},
					]
				: [
						{
							id: 'subscribe_messages',
							label: 'Ativar messages',
							kind: 'api',
							endpoint: '/api/meta/webhooks/subscription',
							method: 'POST',
							body: { fields: ['messages'] },
						},
					],
		})
	} else {
		checks.push({
			id: 'meta_subscription_messages',
			title: 'Webhook (messages) inscrito no WABA',
			status: 'warn',
			message: sub.error || 'Erro ao consultar subscribed_apps',
			details: { details: (sub as any).details || null },
			actions: [
				{
					id: 'open_settings',
					label: 'Abrir Ajustes',
					kind: 'link',
					href: '/settings',
				},
			],
		})
	}

	// 3) Sinais internos (DB) — falhas e "webhook vivo"
	const lastStatus = await getInternalLastStatusUpdateAt()
	const recentFailures = await getInternalRecentFailures()

	if (lastStatus.ok) {
		checks.push({
			id: 'internal_last_status_update',
			title: 'Sinais internos (atividade)',
			status: lastStatus.lastAt ? 'pass' : 'warn',
			message: lastStatus.lastAt
				? `Última atualização no DB: ${new Date(lastStatus.lastAt).toLocaleString('pt-BR')}`
				: 'Sem atualizações recentes detectáveis (ou base vazia)',
			details: { lastAt: lastStatus.lastAt },
		})
	} else {
		checks.push({
			id: 'internal_last_status_update',
			title: 'Sinais internos (atividade)',
			status: 'warn',
			message: 'Não foi possível consultar atividade no DB (best-effort)',
			details: { error: lastStatus.error, details: (lastStatus as any).details || null },
		})
	}

	if (recentFailures.ok) {
		checks.push({
			id: 'internal_recent_failures',
			title: 'Falhas recentes (últimos 7 dias)',
			status: recentFailures.totalFailedRows > 0 ? 'warn' : 'pass',
			message:
				recentFailures.totalFailedRows > 0
					? `${recentFailures.totalFailedRows} mensagens falharam (top códigos no detalhe)`
					: 'Nenhuma falha registrada nos últimos 7 dias',
			details: {
				totalFailedRows: recentFailures.totalFailedRows,
				top: recentFailures.top,
			},
		})
	} else {
		checks.push({
			id: 'internal_recent_failures',
			title: 'Falhas recentes (últimos 7 dias)',
			status: 'warn',
			message: 'Não foi possível consultar falhas recentes (best-effort)',
			details: { error: recentFailures.error, details: (recentFailures as any).details || null },
		})
	}

	// 4) Webhook URL + verify token (o que o aluno tem que configurar no painel)
	checks.push({
		id: 'webhook_expected',
		title: 'Webhook esperado (ambiente atual)',
		status: 'info',
		message: webhookUrl,
		details: {
			expectedUrl: webhookUrl,
			verifyTokenPreview: maskTokenPreview(webhookToken),
			note: 'A configuração do callback URL do WhatsApp (no nível do App) ainda é via Dashboard da Meta. Não é automatizável por /{app-id}/subscriptions.',
		},
	})

	const fbtraceIds = collectFbtraceIds(checks)
	const reportText = buildReportText(checks, { vercelEnv, webhookUrl, source }, { tokenExpiry: tokenExpirySummary, fbtraceIds })
	const supportPacketText = buildSupportPacketText({
		checks,
		meta: { vercelEnv, webhookUrl, source },
		whatsapp: {
			wabaId: maskId(credentials.businessAccountId),
			phoneNumberId: maskId(credentials.phoneNumberId),
			accessTokenPreview: maskTokenPreview(credentials.accessToken),
		},
		debugToken: {
			enabled: Boolean(appId && appSecret),
			source: metaAppSource,
			attempted: debugTokenAttempted,
			ok: debugTokenOk,
			isValid: debugTokenIsValid,
			expiry: tokenExpirySummary,
		},
	})

	return noStoreJson({
		ok: true,
		ts,
		env: {
			vercelEnv,
			vercelUrl: process.env.VERCEL_URL || null,
			vercelProjectProductionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL || null,
			appUrl: process.env.NEXT_PUBLIC_APP_URL || null,
			gitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
			gitCommitRef: process.env.VERCEL_GIT_COMMIT_REF || null,
			deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
			flags: {
				hasSupabaseUrl,
				hasSupabaseSecretKey,
				hasMetaAppId: Boolean(appId),
				hasMetaAppSecret: Boolean(appSecret),
			},
		},
		metaApp: {
			enabled: Boolean(appId && appSecret),
			source: metaAppSource,
			appId: appId ? maskId(appId) : null,
			hasAppSecret: Boolean(appSecret),
		},
		debugTokenValidation: {
			enabled: Boolean(appId && appSecret),
			source: metaAppSource,
			attempted: debugTokenAttempted,
			checkedAt: ts,
			ok: debugTokenOk,
			isValid: debugTokenIsValid,
			error: debugTokenError,
		},
		summary: {
			health: {
				overall: String((checks.find((c) => c.id === 'meta_health_status')?.details as any)?.overall || ''),
			},
			token: tokenExpirySummary,
			traces: {
				fbtraceIds,
			},
		},
		webhook: {
			expectedUrl: webhookUrl,
			verifyTokenPreview: maskTokenPreview(webhookToken),
			signature: webhookSignature,
		},
		whatsapp: {
			credentialsSource: source,
			businessAccountId: maskId(credentials.businessAccountId),
			phoneNumberId: maskId(credentials.phoneNumberId),
			accessTokenPreview: maskTokenPreview(credentials.accessToken),
		},
		checks,
		meta,
		internal: {
			lastStatusUpdateAt: lastStatus.ok ? lastStatus.lastAt : null,
			recentFailures,
		},
		report: {
			text: reportText,
			supportPacketText,
		},
	})
}

/**
 * POST /api/meta/diagnostics/actions
 * (Reservado para ações futuras.)
 */
export async function POST() {
	return noStoreJson(
		{
			ok: false,
			error: 'Use os endpoints específicos (ex.: /api/meta/webhooks/subscription) para ações no momento.',
		},
		{ status: 400 }
	)
}

