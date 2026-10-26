import { NextResponse } from 'next/server'
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'
import { fetchWithTimeout, safeJson, isAbortError } from '@/lib/server-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const META_API_VERSION = 'v24.0'
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`

function maskId(id: string | null | undefined): string {
	if (!id) return ''
	const s = String(id)
	if (s.length <= 8) return s
	return `${s.slice(0, 4)}…${s.slice(-4)}`
}

function normalizeErrorPayload(json: any): {
	message: string
	code: number | null
	subcode: number | null
	fbtraceId: string | null
	type: string | null
	raw: any
} {
	const err = json?.error || json
	const message = typeof err?.message === 'string' ? err.message : 'Erro desconhecido'
	const code = Number.isFinite(Number(err?.code)) ? Number(err.code) : null
	const subcode = Number.isFinite(Number(err?.error_subcode)) ? Number(err.error_subcode) : null
	const fbtraceId = typeof err?.fbtrace_id === 'string' ? err.fbtrace_id : null
	const type = typeof err?.type === 'string' ? err.type : null
	return { message, code, subcode, fbtraceId, type, raw: json }
}

/**
 * POST /api/meta/diagnostics/simulate-10033
 *
 * Simula o erro "Unsupported post request" (Graph code 100, subcode 33) sem enviar mensagem real.
 * Estratégia: faz POST em /{WABA_ID}/messages (endpoint inválido para WABA; válido apenas para PHONE_NUMBER_ID).
 */
export async function POST() {
	try {
		const creds = await getWhatsAppCredentials().catch(() => null)
		if (!creds?.accessToken) {
			return NextResponse.json(
				{
					ok: false,
					error: 'Credenciais do WhatsApp não configuradas (token ausente).',
				},
				{ status: 400 }
			)
		}

		const wabaId = (creds.businessAccountId || '').trim()
		const phoneNumberId = (creds.phoneNumberId || '').trim()
		const badObjectId = wabaId || (phoneNumberId ? `${phoneNumberId}0` : '')
		if (!badObjectId) {
			return NextResponse.json(
				{
					ok: false,
					error: 'IDs do WhatsApp ausentes (WABA ID / Phone Number ID).',
				},
				{ status: 400 }
			)
		}

		const url = `${META_API_BASE}/${encodeURIComponent(badObjectId)}/messages`
		const res = await fetchWithTimeout(url, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${creds.accessToken}`,
				'Content-Type': 'application/json',
			},
			// corpo irrelevante: queremos falhar antes de qualquer validação de payload
			body: JSON.stringify({}),
			timeoutMs: 8000,
		})

		const json = await safeJson<any>(res)
		const normalized = normalizeErrorPayload(json)

		return NextResponse.json({
			ok: true,
			simulated: true,
			strategy: 'POST /{WABA_ID}/messages (endpoint inválido para WABA)',
			attempt: {
				objectId: maskId(badObjectId),
				status: res.status,
			},
			result: {
				graphOk: res.ok,
				normalizedError: normalized,
			},
		})
	} catch (e) {
		return NextResponse.json(
			{
				ok: false,
				error: 'Falha ao simular erro 100/33 (servidor).',
				details: { message: e instanceof Error ? e.message : String(e) },
			},
			{ status: isAbortError(e) ? 504 : 502 }
		)
	}
}
