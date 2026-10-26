// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { verifyCronRequest, cronUnauthorizedResponse } from './cron-auth'

function fakeRequest(headers: Record<string, string> = {}) {
  return { headers: new Headers(headers) }
}

describe('verifyCronRequest', () => {
  const saved = { cron: process.env.CRON_SECRET, admin: process.env.DISPARA_ADMIN_KEY }

  beforeEach(() => {
    process.env.CRON_SECRET = 'cron-secret-123'
    process.env.DISPARA_ADMIN_KEY = 'admin-key-456'
  })

  afterEach(() => {
    if (saved.cron === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = saved.cron
    if (saved.admin === undefined) delete process.env.DISPARA_ADMIN_KEY
    else process.env.DISPARA_ADMIN_KEY = saved.admin
  })

  it('aceita Bearer CRON_SECRET', () => {
    expect(verifyCronRequest(fakeRequest({ authorization: 'Bearer cron-secret-123' }))).toEqual({
      valid: true,
      source: 'cron_secret',
    })
  })

  it('aceita Bearer DISPARA_ADMIN_KEY', () => {
    expect(verifyCronRequest(fakeRequest({ authorization: 'Bearer admin-key-456' }))).toEqual({
      valid: true,
      source: 'admin_key',
    })
  })

  it('IGNORA o header x-vercel-cron (forjável; vercel.json não define crons)', () => {
    const result = verifyCronRequest(fakeRequest({ 'x-vercel-cron': '1' }))
    expect(result.valid).toBe(false)
  })

  it('x-vercel-cron não "ajuda" um Bearer errado', () => {
    const result = verifyCronRequest(fakeRequest({ 'x-vercel-cron': '1', authorization: 'Bearer errado' }))
    expect(result.valid).toBe(false)
  })

  it('rejeita segredo errado, prefixo de segredo e header sem Bearer', () => {
    expect(verifyCronRequest(fakeRequest({ authorization: 'Bearer cron-secret-12' })).valid).toBe(false)
    expect(verifyCronRequest(fakeRequest({ authorization: 'Bearer cron-secret-1234' })).valid).toBe(false)
    expect(verifyCronRequest(fakeRequest({ authorization: 'cron-secret-123' })).valid).toBe(false)
    expect(verifyCronRequest(fakeRequest({ 'x-api-key': 'admin-key-456' })).valid).toBe(false)
    expect(verifyCronRequest(fakeRequest()).valid).toBe(false)
  })

  it('segredos não configurados nunca casam com Bearer vazio', () => {
    delete process.env.CRON_SECRET
    delete process.env.DISPARA_ADMIN_KEY
    expect(verifyCronRequest(fakeRequest({ authorization: 'Bearer ' })).valid).toBe(false)
    expect(verifyCronRequest(fakeRequest({ authorization: 'Bearer undefined' })).valid).toBe(false)
  })

  it('cronUnauthorizedResponse devolve 401 JSON', async () => {
    const res = cronUnauthorizedResponse('nope')
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized', message: 'nope' })
  })
})
