/**
 * Supabase em memória (com estado) para testes de unidade.
 *
 * Diferente de createMockQueryBuilder (resultado fixo), aqui as escritas valem para
 * as leituras seguintes. Suporta o subconjunto usado pelo código de assinatura da
 * Meta e alertas: select / upsert (onConflict, ignoreDuplicates) / insert / update /
 * delete com eq, neq, in, like ('prefixo%'), lt, order, limit, single e maybeSingle.
 * Cada instrução roda inteira de uma vez (como um UPDATE ... WHERE no Postgres).
 *
 * @example
 * ```ts
 * const db = createInMemorySupabase({ settings: [{ key: 'x', value: '1' }] }, { settings: 'key' })
 * vi.mocked(getSupabaseAdmin).mockReturnValue(db.client as never)
 * db.rows('settings') // estado atual
 * ```
 */

type Row = Record<string, unknown>
type Filter = (row: Row) => boolean

interface QueryState {
  op: 'select' | 'update' | 'delete'
  patch: Row | null
  filters: Filter[]
  order: { column: string; ascending: boolean } | null
  limit: number | null
}

export interface InMemorySupabase {
  client: { from: (table: string) => unknown }
  rows: (table: string) => Row[]
  /** Faz a próxima operação na tabela falhar com este erro (uma vez). */
  failNext: (table: string, message: string) => void
  /** Tabelas acessadas, em ordem. */
  accessed: string[]
}

function likeToPredicate(pattern: string): (value: unknown) => boolean {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.')
  const re = new RegExp(`^${escaped}$`)
  return (value) => re.test(String(value ?? ''))
}

export function createInMemorySupabase(
  seed: Record<string, Row[]> = {},
  primaryKeys: Record<string, string> = {}
): InMemorySupabase {
  const tables = new Map<string, Row[]>()
  for (const [name, rows] of Object.entries(seed)) tables.set(name, rows.map((r) => ({ ...r })))
  const failures = new Map<string, string>()
  const accessed: string[] = []

  const table = (name: string): Row[] => {
    if (!tables.has(name)) tables.set(name, [])
    return tables.get(name)!
  }
  const pk = (name: string): string => primaryKeys[name] || 'id'

  const takeFailure = (name: string) => {
    const message = failures.get(name)
    if (message === undefined) return null
    failures.delete(name)
    return { message }
  }

  function from(name: string) {
    accessed.push(name)
    const state: QueryState = { op: 'select', patch: null, filters: [], order: null, limit: null }

    const run = (): { data: unknown; error: { message: string } | null } => {
      const failure = takeFailure(name)
      if (failure) return { data: null, error: failure }
      const rows = table(name)
      const matched = rows.filter((r) => state.filters.every((f) => f(r)))
      if (state.op === 'update') {
        for (const r of matched) Object.assign(r, state.patch)
        return { data: matched.map((r) => ({ ...r })), error: null }
      }
      if (state.op === 'delete') {
        tables.set(name, rows.filter((r) => !matched.includes(r)))
        return { data: null, error: null }
      }
      let out = matched.map((r) => ({ ...r }))
      if (state.order) {
        const { column, ascending } = state.order
        out.sort((a, b) => {
          const av = String(a[column] ?? '')
          const bv = String(b[column] ?? '')
          return ascending ? av.localeCompare(bv) : bv.localeCompare(av)
        })
      }
      if (state.limit !== null) out = out.slice(0, state.limit)
      return { data: out, error: null }
    }

    const builder: Record<string, unknown> = {
      select: () => builder,
      update: (patch: Row) => {
        state.op = 'update'
        state.patch = patch
        return builder
      },
      delete: () => {
        state.op = 'delete'
        return builder
      },
      insert: (input: Row | Row[]) => {
        const failure = takeFailure(name)
        if (failure) return Promise.resolve({ data: null, error: failure })
        const list = Array.isArray(input) ? input : [input]
        for (const r of list) table(name).push({ ...r })
        return Promise.resolve({ data: null, error: null })
      },
      upsert: (input: Row | Row[], options?: { onConflict?: string; ignoreDuplicates?: boolean }) => {
        const failure = takeFailure(name)
        if (failure) return Promise.resolve({ data: null, error: failure })
        const key = options?.onConflict || pk(name)
        const list = Array.isArray(input) ? input : [input]
        const rows = table(name)
        for (const r of list) {
          const existing = rows.find((x) => x[key] === r[key])
          if (existing) {
            if (!options?.ignoreDuplicates) Object.assign(existing, r)
          } else {
            rows.push({ ...r })
          }
        }
        return Promise.resolve({ data: null, error: null })
      },
      eq: (column: string, value: unknown) => {
        state.filters.push((r) => r[column] === value)
        return builder
      },
      neq: (column: string, value: unknown) => {
        state.filters.push((r) => r[column] !== value)
        return builder
      },
      in: (column: string, values: unknown[]) => {
        state.filters.push((r) => values.includes(r[column]))
        return builder
      },
      like: (column: string, pattern: string) => {
        const test = likeToPredicate(pattern)
        state.filters.push((r) => test(r[column]))
        return builder
      },
      // Número com número compara numericamente; o resto como texto (coluna text no Postgres).
      lt: (column: string, value: unknown) => {
        state.filters.push((r) => {
          const current = r[column]
          if (current === null || current === undefined) return false
          return typeof current === 'number' && typeof value === 'number'
            ? current < value
            : String(current) < String(value)
        })
        return builder
      },
      order: (column: string, options?: { ascending?: boolean }) => {
        state.order = { column, ascending: options?.ascending !== false }
        return builder
      },
      limit: (n: number) => {
        state.limit = n
        return builder
      },
      maybeSingle: () => {
        const res = run()
        if (res.error) return Promise.resolve(res)
        const list = res.data as Row[]
        return Promise.resolve({ data: list[0] ?? null, error: null })
      },
      single: () => {
        const res = run()
        if (res.error) return Promise.resolve(res)
        const list = res.data as Row[]
        return Promise.resolve(
          list.length === 1 ? { data: list[0], error: null } : { data: null, error: { message: 'not single' } }
        )
      },
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(run()).then(resolve, reject),
    }
    return builder
  }

  return {
    client: { from },
    rows: (name) => table(name).map((r) => ({ ...r })),
    failNext: (name, message) => {
      failures.set(name, message)
    },
    accessed,
  }
}
