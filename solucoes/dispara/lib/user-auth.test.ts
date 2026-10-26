// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHash, createHmac, randomUUID } from 'crypto'

// ---------------------------------------------------------------------------
// Mocks: Supabase (tabela settings em memória) e next/headers (cookie jar)
// ---------------------------------------------------------------------------

type Row = { key: string; value: string; updated_at: string | null }
type Filter = ['eq' | 'in' | 'is', string, unknown]
type Query = {
  op: 'select' | 'update' | 'upsert' | 'delete'
  filters: Filter[]
  payload: Partial<Row> | null
  opts: { onConflict?: string; ignoreDuplicates?: boolean } | null
  returning: boolean
}

const db = vi.hoisted(() => ({
  configured: true,
  rows: [] as Array<{ key: string; value: string; updated_at: string | null }>,
  readError: null as null | { message: string },
  sessionReads: 0,
  writes: [] as Array<{ key: string; value: string }>,
  /** Roda UMA vez logo antes da próxima gravação de session_tokens (outra instância gravando no meio). */
  beforeSessionsWrite: null as null | (() => void),
  /** Segura as leituras de session_tokens (os dados já foram lidos) até ser resolvido. */
  readGate: null as null | Promise<void>,
  clock: 0,
}))

const cookieJar = vi.hoisted(() => new Map<string, string>())

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
    set: (name: string, value: string) => {
      cookieJar.set(name, value)
    },
    delete: (name: string) => {
      cookieJar.delete(name)
    },
  }),
}))

vi.mock('@/lib/supabase', () => {
  const matches = (row: Row, filters: Filter[]) =>
    filters.every(([op, col, val]) => {
      const cell = row[col as keyof Row]
      if (op === 'in') return (val as unknown[]).includes(cell)
      if (op === 'is') return cell === null || cell === undefined
      return String(cell) === String(val)
    })

  const runHook = (key: string | undefined) => {
    if (key !== 'session_tokens' || !db.beforeSessionsWrite) return
    const hook = db.beforeSessionsWrite
    db.beforeSessionsWrite = null
    hook()
  }

  async function exec(q: Query, single: boolean) {
    await Promise.resolve()
    if (q.op === 'select') {
      const keys = (q.filters.find(([op]) => op === 'in')?.[2] as string[] | undefined) ?? []
      const readsSessions = keys.includes('session_tokens')
      if (readsSessions) db.sessionReads++
      const error = db.readError
      const data = db.rows.filter((r) => matches(r, q.filters)).map((r) => ({ ...r }))
      if (readsSessions && db.readGate) await db.readGate
      if (error) return { data: null, error }
      if (single) {
        return data[0] ? { data: data[0], error: null } : { data: null, error: { message: 'not found', code: 'PGRST116' } }
      }
      return { data, error: null }
    }
    if (q.op === 'update') {
      const key = q.filters.find(([op, col]) => op === 'eq' && col === 'key')?.[2] as string | undefined
      runHook(key)
      const targets = db.rows.filter((r) => matches(r, q.filters))
      for (const r of targets) {
        Object.assign(r, q.payload)
        db.writes.push({ key: r.key, value: r.value })
      }
      return { data: q.returning ? targets.map((r) => ({ key: r.key })) : null, error: null }
    }
    if (q.op === 'upsert') {
      const row = q.payload as Row
      runHook(row.key)
      if (q.opts?.ignoreDuplicates && db.rows.some((r) => r.key === row.key)) {
        return { data: q.returning ? [] : null, error: null }
      }
      db.writes.push({ key: row.key, value: row.value })
      db.rows = [...db.rows.filter((r) => r.key !== row.key), { ...row }]
      return { data: q.returning ? [{ key: row.key }] : null, error: null }
    }
    db.rows = db.rows.filter((r) => !matches(r, q.filters))
    return { data: null, error: null }
  }

  const from = (_table: string) => {
    const q: Query = { op: 'select', filters: [], payload: null, opts: null, returning: false }
    const builder = {
      select: (_cols?: string) => {
        if (q.op !== 'select') q.returning = true
        return builder
      },
      in: (col: string, vals: unknown[]) => (q.filters.push(['in', col, vals]), builder),
      eq: (col: string, val: unknown) => (q.filters.push(['eq', col, val]), builder),
      is: (col: string, val: unknown) => (q.filters.push(['is', col, val]), builder),
      update: (payload: Partial<Row>) => ((q.op = 'update'), (q.payload = payload), builder),
      upsert: (payload: Row, opts?: Query['opts']) => ((q.op = 'upsert'), (q.payload = payload), (q.opts = opts ?? null), builder),
      delete: () => ((q.op = 'delete'), builder),
      single: () => exec(q, true),
      then: (onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        exec(q, false).then(onFulfilled, onRejected),
    }
    return builder
  }
  const client = { from }
  return {
    getSupabaseAdmin: () => (db.configured ? client : null),
    supabase: {
      from: (table: string) => {
        if (!db.configured) throw new Error('Supabase not configured')
        return from(table)
      },
    },
  }
})

import {
  isValidSessionToken,
  invalidateSessionCache,
  validateSession,
  loginUser,
  logoutUser,
  SESSION_COOKIE_NAME,
} from './user-auth'

const MASTER = 'senha-mestra-de-teste'
const SERVER_SECRET = 'sb_secret_test_0123456789abcdefghijklmnopqrstuvwxyz'
const DAY_MS = 24 * 60 * 60 * 1000
const ENV_KEYS = ['MASTER_PASSWORD', 'SESSION_SECRET', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'] as const

const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')

function sessionKey(master = MASTER, server = SERVER_SECRET): Buffer {
  return createHmac('sha256', server).update(`dispara-session-v2|${master}`).digest()
}

/** Token no formato atual (s2), assinado com a chave derivada do segredo de servidor. */
function signedToken(id = randomUUID(), opts: { master?: string; server?: string } = {}): string {
  const sig = createHmac('sha256', sessionKey(opts.master ?? MASTER, opts.server ?? SERVER_SECRET))
    .update(`dispara-session:s2.${id}`)
    .digest('base64url')
  return `s2.${id}.${sig}`
}

/** Token do formato aposentado (s1): HMAC com a própria MASTER_PASSWORD como chave. */
function retiredS1Token(id = randomUUID(), secret = MASTER): string {
  const sig = createHmac('sha256', secret).update(`dispara-session:s1.${id}`).digest('base64url')
  return `s1.${id}.${sig}`
}

type Entry = { token?: string; tokenHash?: string; createdAt: string }

function nextUpdatedAt(): string {
  return new Date(Date.UTC(2026, 9, 11, 12, 0, 0) + ++db.clock).toISOString()
}

function setSessions(sessions: Entry[]) {
  db.rows = db.rows.filter((r) => r.key !== 'session_tokens')
  db.rows.push({ key: 'session_tokens', value: JSON.stringify(sessions), updated_at: nextUpdatedAt() })
}

/** Entrada como as versões novas gravam: só o hash. */
function hashed(token: string, createdAt = new Date().toISOString()): Entry {
  return { tokenHash: sha256(token), createdAt }
}

function storedSessions(): Entry[] {
  const row = db.rows.find((r) => r.key === 'session_tokens')
  return row ? JSON.parse(row.value) : []
}

function storedHashes(): string[] {
  return storedSessions().map((s) => s.tokenHash ?? `plain:${s.token}`)
}

describe('user-auth — sessões', () => {
  const savedEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const key of ENV_KEYS) savedEnv[key] = process.env[key]
    process.env.MASTER_PASSWORD = MASTER
    process.env.SUPABASE_SECRET_KEY = SERVER_SECRET
    delete process.env.SESSION_SECRET
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    db.configured = true
    db.rows = []
    db.readError = null
    db.sessionReads = 0
    db.writes = []
    db.beforeSessionsWrite = null
    db.readGate = null
    cookieJar.clear()
    invalidateSessionCache()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key]
      else process.env[key] = savedEnv[key]
    }
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // ==========================================================================
  // isValidSessionToken
  // ==========================================================================
  describe('isValidSessionToken', () => {
    it('token malformado (cookie forjado qualquer) → invalid sem consultar o banco', async () => {
      expect(await isValidSessionToken('x')).toBe('invalid')
      expect(await isValidSessionToken('')).toBe('invalid')
      expect(await isValidSessionToken('a'.repeat(300))).toBe('invalid')
      expect(db.sessionReads).toBe(0)
    })

    it('token com formato assinado mas assinatura errada → invalid sem consultar o banco', async () => {
      const forged = signedToken(randomUUID(), { master: 'outra-senha' })
      expect(await isValidSessionToken(forged)).toBe('invalid')
      expect(await isValidSessionToken(`s2.${randomUUID()}.`)).toBe('invalid')
      expect(db.sessionReads).toBe(0)
    })

    it('token legado (UUID) presente na lista → valid; ausente → invalid', async () => {
      const token = randomUUID()
      setSessions([{ token, createdAt: new Date().toISOString() }])
      expect(await isValidSessionToken(token)).toBe('valid')
      expect(await isValidSessionToken(randomUUID())).toBe('invalid')
    })

    it('entrada nova (só sha256 do token) valida o token assinado', async () => {
      const token = signedToken()
      setSessions([hashed(token)])
      expect(await isValidSessionToken(token)).toBe('valid')
    })

    it('sessão expirada (> 7 dias) → invalid', async () => {
      const token = randomUUID()
      setSessions([{ token, createdAt: new Date(Date.now() - 8 * DAY_MS).toISOString() }])
      expect(await isValidSessionToken(token)).toBe('invalid')
    })

    it('Supabase não configurado: token assinado → unavailable; UUID legado → unverified', async () => {
      db.configured = false
      expect(await isValidSessionToken(signedToken())).toBe('unavailable')
      expect(await isValidSessionToken(randomUUID())).toBe('unverified')
    })

    it('erro de banco: só token ASSINADO vira unavailable (UUID forjado não abre o modo degradado)', async () => {
      db.readError = { message: 'connection refused' }
      // Cenário do achado: qualquer UUID passava como 'legacy' e virava 'unavailable'.
      expect(await isValidSessionToken('00000000-0000-4000-8000-000000000000')).toBe('unverified')
      expect(await isValidSessionToken(randomUUID())).toBe('unverified')
      expect(await isValidSessionToken(signedToken())).toBe('unavailable')

      db.readError = null
      invalidateSessionCache()
      setSessions([])
      expect(await isValidSessionToken(randomUUID())).toBe('invalid')
    })

    it('cacheia a LISTA por ~15s: flood de cookies forjados custa 1 query', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-10-11T12:00:00Z'))
      setSessions([{ token: randomUUID(), createdAt: new Date().toISOString() }])

      for (let i = 0; i < 50; i++) {
        expect(await isValidSessionToken(randomUUID())).toBe('invalid')
      }
      expect(db.sessionReads).toBe(1)

      vi.setSystemTime(new Date('2026-10-11T12:00:14Z'))
      await isValidSessionToken(randomUUID())
      expect(db.sessionReads).toBe(1)

      vi.setSystemTime(new Date('2026-10-11T12:00:16Z'))
      await isValidSessionToken(randomUUID())
      expect(db.sessionReads).toBe(2)
    })

    it('requests concorrentes compartilham a mesma leitura', async () => {
      setSessions([])
      await Promise.all(Array.from({ length: 20 }, () => isValidSessionToken(randomUUID())))
      expect(db.sessionReads).toBe(1)
    })

    it('NÃO escreve nada por request (nem poda sessões expiradas)', async () => {
      const valid = randomUUID()
      setSessions([
        { token: randomUUID(), createdAt: new Date(Date.now() - 30 * DAY_MS).toISOString() },
        { token: valid, createdAt: new Date().toISOString() },
      ])
      expect(await isValidSessionToken(valid)).toBe('valid')
      expect(await isValidSessionToken(randomUUID())).toBe('invalid')
      expect(db.writes).toHaveLength(0)
      expect(storedSessions()).toHaveLength(2)
    })

    it('legado de token único (sem session_tokens): valida e respeita a expiração', async () => {
      const token = randomUUID()
      db.rows.push({ key: 'session_token', value: token, updated_at: new Date().toISOString() })
      expect(await isValidSessionToken(token)).toBe('valid')

      invalidateSessionCache()
      db.rows = [{ key: 'session_token', value: token, updated_at: new Date(Date.now() - 8 * DAY_MS).toISOString() }]
      expect(await isValidSessionToken(token)).toBe('invalid')
      expect(db.writes).toHaveLength(0)
    })

    it('token assinado criado por OUTRA instância depois do cache → relê a lista uma vez', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-10-11T12:00:00Z'))
      setSessions([])
      expect(await isValidSessionToken(randomUUID())).toBe('invalid') // aquece o cache
      expect(db.sessionReads).toBe(1)

      // login em outra instância grava um token novo no banco
      const fresh = signedToken()
      setSessions([hashed(fresh)])

      expect(await isValidSessionToken(fresh)).toBe('valid')
      expect(db.sessionReads).toBe(2)
      // a releitura atualizou o cache: próxima validação não consulta
      expect(await isValidSessionToken(fresh)).toBe('valid')
      expect(db.sessionReads).toBe(2)
    })

    it('token assinado revogado força no máximo UMA releitura por janela de cache', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-10-11T12:00:00Z'))
      setSessions([])
      const revoked = signedToken()

      expect(await isValidSessionToken(revoked)).toBe('invalid')
      expect(db.sessionReads).toBe(2) // leitura normal + releitura forçada
      for (let i = 0; i < 10; i++) expect(await isValidSessionToken(revoked)).toBe('invalid')
      expect(db.sessionReads).toBe(2)
    })

    it('trocar a MASTER_PASSWORD invalida tokens assinados', async () => {
      const token = signedToken()
      setSessions([hashed(token)])
      expect(await isValidSessionToken(token)).toBe('valid')

      process.env.MASTER_PASSWORD = 'senha-nova'
      expect(await isValidSessionToken(token)).toBe('invalid')
    })
  })

  // ==========================================================================
  // Chave da assinatura (achado: HMAC com a MASTER_PASSWORD era oráculo da senha)
  // ==========================================================================
  describe('chave da assinatura', () => {
    it('a assinatura depende do segredo de servidor: só a senha não reproduz o token', async () => {
      const id = randomUUID()
      // Quem tem só a senha (ou tenta senhas offline) calcula HMAC(senha, ...):
      const passwordOnly = createHmac('sha256', MASTER).update(`dispara-session:s2.${id}`).digest('base64url')
      const token = signedToken(id)
      expect(token).not.toBe(`s2.${id}.${passwordOnly}`)

      setSessions([hashed(token), hashed(`s2.${id}.${passwordOnly}`)])
      expect(await isValidSessionToken(`s2.${id}.${passwordOnly}`)).toBe('invalid')
      expect(await isValidSessionToken(token)).toBe('valid')
    })

    it('trocar o segredo de servidor também invalida as sessões', async () => {
      const token = signedToken()
      setSessions([hashed(token)])
      expect(await isValidSessionToken(token)).toBe('valid')

      process.env.SUPABASE_SECRET_KEY = 'sb_secret_rotacionada_0123456789abcdefghij'
      expect(await isValidSessionToken(token)).toBe('invalid')
    })

    it('tokens s1 (assinados com a senha) não são mais aceitos, nem estando na lista', async () => {
      const old = retiredS1Token()
      setSessions([{ token: old, createdAt: new Date().toISOString() }])
      expect(await isValidSessionToken(old)).toBe('invalid')
      expect(db.sessionReads).toBe(0)
    })

    it('SESSION_SECRET (>= 32 caracteres) tem prioridade sobre a chave do Supabase', async () => {
      const dedicated = 'x'.repeat(16) + 'session-secret-dedicado-0123456789'
      process.env.SESSION_SECRET = dedicated
      await loginUser(MASTER)
      const token = cookieJar.get(SESSION_COOKIE_NAME)!
      const id = token.split('.')[1]
      expect(token).toBe(signedToken(id, { server: dedicated }))
    })

    it('SESSION_SECRET curto é ignorado (cai na chave do Supabase) com aviso', async () => {
      process.env.SESSION_SECRET = 'curto'
      await loginUser(MASTER)
      const token = cookieJar.get(SESSION_COOKIE_NAME)!
      const id = token.split('.')[1]
      expect(token).toBe(signedToken(id))
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('SESSION_SECRET ignorado'))
    })

    it('SUPABASE_SERVICE_ROLE_KEY serve de segredo quando não há SUPABASE_SECRET_KEY', async () => {
      delete process.env.SUPABASE_SECRET_KEY
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-jwt-de-teste-0123456789'
      await loginUser(MASTER)
      const token = cookieJar.get(SESSION_COOKIE_NAME)!
      expect(token).toBe(signedToken(token.split('.')[1], { server: 'service-role-jwt-de-teste-0123456789' }))
    })

    it('sem segredo de servidor o token é UUID puro (comportamento documentado)', async () => {
      delete process.env.SUPABASE_SECRET_KEY
      await loginUser(MASTER)
      const token = cookieJar.get(SESSION_COOKIE_NAME)!
      expect(token).toMatch(/^[0-9a-f-]{36}$/)
      expect(await isValidSessionToken(token)).toBe('valid')
    })
  })

  // ==========================================================================
  // Corrida na releitura de token novo
  // ==========================================================================
  describe('releitura de token novo (requests concorrentes)', () => {
    it('requests simultâneas com token recém-criado esperam a MESMA releitura → todas valid', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-10-11T12:00:00Z'))
      const other = signedToken()
      setSessions([hashed(other)])
      expect(await isValidSessionToken(other)).toBe('valid') // cache quente sem o token novo
      expect(db.sessionReads).toBe(1)

      const fresh = signedToken()
      setSessions([hashed(other), hashed(fresh)])

      const results = await Promise.all(Array.from({ length: 4 }, () => isValidSessionToken(fresh)))
      // Antes: ['valid','invalid','invalid','invalid'] (e o proxy apagava o cookie).
      expect(results).toEqual(['valid', 'valid', 'valid', 'valid'])
      expect(db.sessionReads).toBe(2)
    })

    it('releitura forçada não aproveita uma leitura que começou ANTES do login', async () => {
      const other = signedToken()
      setSessions([hashed(other)])
      expect(await isValidSessionToken(other)).toBe('valid') // cache quente

      // Um token assinado desconhecido (ex.: cookie de um dispositivo já deslogado)
      // força uma releitura, que lê a lista ANTIGA e fica presa...
      let release!: () => void
      db.readGate = new Promise<void>((resolve) => (release = resolve))
      const unknownCheck = isValidSessionToken(signedToken())
      await vi.waitFor(() => expect(db.sessionReads).toBe(2))

      // ...enquanto outra instância grava um login e chega a 1ª request do token novo.
      const fresh = signedToken()
      setSessions([hashed(other), hashed(fresh)])
      const freshCheck = isValidSessionToken(fresh)
      await new Promise((resolve) => setTimeout(resolve, 0))

      db.readGate = null
      release()
      // Antes: o token novo pegava carona na leitura antiga → 'invalid' (cookie apagado).
      expect(await freshCheck).toBe('valid')
      expect(await unknownCheck).toBe('invalid')
      expect(db.sessionReads).toBe(3)
    })
  })

  // ==========================================================================
  // Stale-if-error
  // ==========================================================================
  describe('stale-if-error', () => {
    it('falha ao reler depois de um snapshot bom mantém as sessões válidas', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-10-11T12:00:00Z'))
      const token = signedToken()
      setSessions([hashed(token)])
      expect(await isValidSessionToken(token)).toBe('valid')

      db.readError = { message: 'PostgREST 503' }
      vi.setSystemTime(new Date('2026-10-11T12:00:16Z'))
      // Antes: o erro substituía o snapshot e TODAS as APIs davam 503 por 5s.
      expect(await isValidSessionToken(token)).toBe('valid')
      expect(db.sessionReads).toBe(2)
      // Nova tentativa só depois de SESSION_STORE_ERROR_TTL_MS.
      expect(await isValidSessionToken(token)).toBe('valid')
      expect(db.sessionReads).toBe(2)
    })

    it('o snapshot antigo vale por no máximo ~60s numa queda longa', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-10-11T12:00:00Z'))
      const token = signedToken()
      setSessions([hashed(token)])
      expect(await isValidSessionToken(token)).toBe('valid')

      db.readError = { message: 'down' }
      vi.setSystemTime(new Date('2026-10-11T12:00:30Z'))
      expect(await isValidSessionToken(token)).toBe('valid')

      vi.setSystemTime(new Date('2026-10-11T12:01:01Z'))
      expect(await isValidSessionToken(token)).toBe('unavailable')
    })

    it('sem snapshot bom anterior, falha → unavailable', async () => {
      db.readError = { message: 'down' }
      expect(await isValidSessionToken(signedToken())).toBe('unavailable')
    })

    it('falha da releitura forçada de UM token não derruba os outros', async () => {
      const active = signedToken()
      setSessions([hashed(active)])
      expect(await isValidSessionToken(active)).toBe('valid')
      const readsAfterWarmup = db.sessionReads

      db.readError = { message: 'timeout' }
      const unknown = signedToken() // ex.: cookie de um dispositivo já deslogado
      expect(await isValidSessionToken(unknown)).toBe('unavailable')
      expect(db.sessionReads).toBe(readsAfterWarmup + 1)

      // O cache bom continua intacto: o token ativo segue válido sem nova leitura.
      expect(await isValidSessionToken(active)).toBe('valid')
      expect(db.sessionReads).toBe(readsAfterWarmup + 1)
    })

    it("'unavailable' de uma releitura forçada expira: com o banco de volta o token é reavaliado", async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-10-11T12:00:00Z'))
      setSessions([])
      expect(await isValidSessionToken(randomUUID())).toBe('invalid') // aquece

      const fresh = signedToken()
      db.readError = { message: 'timeout' }
      expect(await isValidSessionToken(fresh)).toBe('unavailable')

      db.readError = null
      setSessions([hashed(fresh)])
      vi.setSystemTime(new Date('2026-10-11T12:00:06Z'))
      expect(await isValidSessionToken(fresh)).toBe('valid')
    })
  })

  // ==========================================================================
  // validateSession
  // ==========================================================================
  describe('validateSession', () => {
    it('true só para valid', async () => {
      const token = randomUUID()
      setSessions([{ token, createdAt: new Date().toISOString() }])

      expect(await validateSession()).toBe(false) // sem cookie

      cookieJar.set(SESSION_COOKIE_NAME, token)
      expect(await validateSession()).toBe(true)

      cookieJar.set(SESSION_COOKIE_NAME, 'forjado')
      expect(await validateSession()).toBe(false)

      cookieJar.set(SESSION_COOKIE_NAME, randomUUID())
      db.readError = { message: 'down' }
      invalidateSessionCache()
      expect(await validateSession()).toBe(false)
    })
  })

  // ==========================================================================
  // createSession (via loginUser) / logoutUser
  // ==========================================================================
  describe('login/logout', () => {
    it('login cria token s2, grava SÓ o hash, poda expiradas e invalida o cache local', async () => {
      const expired = randomUUID()
      const active = randomUUID()
      setSessions([
        { token: expired, createdAt: new Date(Date.now() - 9 * DAY_MS).toISOString() },
        { token: active, createdAt: new Date().toISOString() },
      ])
      // aquece o cache SEM o token novo
      expect(await isValidSessionToken(active)).toBe('valid')
      const readsBefore = db.sessionReads

      const result = await loginUser(MASTER)
      expect(result.success).toBe(true)

      const token = cookieJar.get(SESSION_COOKIE_NAME)!
      expect(token).toMatch(/^s2\.[0-9a-f-]{36}\.[A-Za-z0-9_-]+$/)

      const hashes = storedHashes()
      expect(hashes).toContain(sha256(active)) // legado convertido para hash
      expect(hashes).toContain(sha256(token))
      expect(hashes).not.toContain(sha256(expired))
      // Nenhum token em texto puro no banco (nem na lista, nem no legado session_token).
      const allValues = db.rows.map((r) => r.value).join('\n')
      expect(allValues).not.toContain(token)
      expect(allValues).not.toContain(active)
      expect(db.rows.some((r) => r.key === 'session_token')).toBe(false)

      expect(await isValidSessionToken(token)).toBe('valid')
      expect(await isValidSessionToken(active)).toBe('valid')
      expect(db.sessionReads).toBeGreaterThan(readsBefore)
    })

    it('login remove entradas s1 e o session_token legado em texto puro', async () => {
      const s1 = retiredS1Token()
      const other = signedToken()
      setSessions([{ token: s1, createdAt: new Date().toISOString() }, hashed(other)])
      db.rows.push({ key: 'session_token', value: s1, updated_at: new Date().toISOString() })

      expect((await loginUser(MASTER)).success).toBe(true)

      const hashes = storedHashes()
      expect(hashes).not.toContain(sha256(s1))
      expect(hashes).not.toContain(`plain:${s1}`)
      expect(hashes).toContain(sha256(other))
      expect(db.rows.map((r) => r.value).join('\n')).not.toContain(s1)
    })

    it('senha errada não cria sessão', async () => {
      const result = await loginUser('errada')
      expect(result.success).toBe(false)
      expect(cookieJar.has(SESSION_COOKIE_NAME)).toBe(false)
    })

    it('erro ao ler as sessões no login NÃO apaga as outras sessões', async () => {
      const active = randomUUID()
      setSessions([{ token: active, createdAt: new Date().toISOString() }])
      db.readError = { message: 'timeout' }

      const result = await loginUser(MASTER)
      expect(result.success).toBe(false)
      expect(cookieJar.has(SESSION_COOKIE_NAME)).toBe(false)
      expect(storedSessions().map((s) => s.token)).toEqual([active])
    })

    it('login concorrente gravando entre a leitura e a escrita NÃO perde a outra sessão', async () => {
      const otherDevice = signedToken()
      setSessions([])
      // Outra instância conclui um login no meio do read-modify-write deste.
      db.beforeSessionsWrite = () => setSessions([hashed(otherDevice)])

      expect((await loginUser(MASTER)).success).toBe(true)
      const mine = cookieJar.get(SESSION_COOKIE_NAME)!

      // Antes: último upsert vencia e a sessão do outro dispositivo sumia.
      expect(storedHashes()).toEqual(expect.arrayContaining([sha256(otherDevice), sha256(mine)]))
      invalidateSessionCache()
      expect(await isValidSessionToken(otherDevice)).toBe('valid')
      expect(await isValidSessionToken(mine)).toBe('valid')
    })

    it('primeira sessão: duas instâncias criando a linha ao mesmo tempo não se apagam', async () => {
      const otherDevice = signedToken()
      db.beforeSessionsWrite = () => setSessions([hashed(otherDevice)])

      expect((await loginUser(MASTER)).success).toBe(true)
      const mine = cookieJar.get(SESSION_COOKIE_NAME)!
      expect(storedHashes()).toEqual(expect.arrayContaining([sha256(otherDevice), sha256(mine)]))
    })

    it('dois loginUser em paralelo mantêm as duas sessões', async () => {
      setSessions([])
      const tokens: string[] = []
      const realSet = cookieJar.set.bind(cookieJar)
      vi.spyOn(cookieJar, 'set').mockImplementation((name: string, value: string) => {
        if (name === SESSION_COOKIE_NAME) tokens.push(value)
        return realSet(name, value)
      })

      const results = await Promise.all([loginUser(MASTER), loginUser(MASTER)])
      expect(results.every((r) => r.success)).toBe(true)
      expect(tokens).toHaveLength(2)
      expect(storedHashes()).toEqual(expect.arrayContaining(tokens.map(sha256)))
    })

    it('logout remove o token atual, poda expiradas e invalida o cache', async () => {
      const current = randomUUID()
      const other = randomUUID()
      const expired = randomUUID()
      setSessions([
        { token: current, createdAt: new Date().toISOString() },
        { token: other, createdAt: new Date().toISOString() },
        { token: expired, createdAt: new Date(Date.now() - 10 * DAY_MS).toISOString() },
      ])
      expect(await isValidSessionToken(current)).toBe('valid')

      cookieJar.set(SESSION_COOKIE_NAME, current)
      await logoutUser()

      expect(cookieJar.has(SESSION_COOKIE_NAME)).toBe(false)
      expect(storedHashes()).toEqual([sha256(other)])
      expect(await isValidSessionToken(current)).toBe('invalid')
      expect(await isValidSessionToken(other)).toBe('valid')
    })

    it('logout concorrente com um login NÃO apaga a sessão recém-criada', async () => {
      const current = signedToken()
      const other = signedToken()
      setSessions([hashed(current), hashed(other)])
      const newer = signedToken()
      db.beforeSessionsWrite = () => setSessions([hashed(current), hashed(other), hashed(newer)])

      cookieJar.set(SESSION_COOKIE_NAME, current)
      await logoutUser()

      expect(storedHashes()).toEqual([sha256(other), sha256(newer)])
    })

    it('logout com cookie malformado/assinatura errada não toca no banco nem no cache', async () => {
      const valid = signedToken()
      setSessions([hashed(valid)])
      expect(await isValidSessionToken(valid)).toBe('valid') // cache quente
      const reads = db.sessionReads

      for (const forged of ['forjado', retiredS1Token(), signedToken(randomUUID(), { master: 'chute' })]) {
        cookieJar.set(SESSION_COOKIE_NAME, forged)
        await logoutUser()
        expect(cookieJar.has(SESSION_COOKIE_NAME)).toBe(false)
      }
      expect(db.sessionReads).toBe(reads)
      expect(db.writes).toHaveLength(0)
      // cache não foi invalidado: validar de novo não relê
      expect(await isValidSessionToken(valid)).toBe('valid')
      expect(db.sessionReads).toBe(reads)
    })

    it('logout com UUID forjado usa só a lista em cache: sem gravação nem invalidação', async () => {
      setSessions([hashed(signedToken())])
      cookieJar.set(SESSION_COOKIE_NAME, randomUUID())
      await logoutUser()
      cookieJar.set(SESSION_COOKIE_NAME, randomUUID())
      await logoutUser()
      expect(db.sessionReads).toBe(1)
      expect(db.writes).toHaveLength(0)
    })
  })
})
