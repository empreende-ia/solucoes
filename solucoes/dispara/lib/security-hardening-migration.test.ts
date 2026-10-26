import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DB_BROADCAST_TABLES } from '@/lib/realtime-db-change'

const MIGRATIONS_DIR = resolve(process.cwd(), 'supabase/migrations')
const HARDENING_FILE = '20261011000000_security_hardening.sql'

function readMigration(file: string): string {
  return readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8')
}

/** Remove comentários `--` e normaliza espaços (para casar statements). */
function normalizeSql(sql: string): string {
  return sql
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Corpo ($$ ... $$) da função dispara_broadcast_change. */
function broadcastFunctionBody(sql: string): string {
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.dispara_broadcast_change()')
  expect(start).toBeGreaterThanOrEqual(0)
  const bodyStart = sql.indexOf('$$', start)
  const bodyEnd = sql.indexOf('$$', bodyStart + 2)
  expect(bodyStart).toBeGreaterThan(start)
  expect(bodyEnd).toBeGreaterThan(bodyStart)
  return sql.slice(bodyStart + 2, bodyEnd)
}

interface Projection {
  /** Colunas de `new` (INSERT/UPDATE) */
  new: string[]
  /** Colunas de `old` (UPDATE/DELETE) */
  old: string[]
}

/** Chaves de `<variable> := jsonb_build_object('col', <RECORD>.col, ...)` num trecho. */
function projectionKeys(chunk: string, variable: 'v_new' | 'v_old', record: 'NEW' | 'OLD', table: string): string[] {
  const match = new RegExp(`${variable} := jsonb_build_object\\(([^)]*)\\);`).exec(chunk)
  if (!match) return []
  const args = match[1]
    .split(',')
    .map((arg) => arg.trim())
    .filter(Boolean)
  expect(args.length % 2, `${table}.${variable}: pares chave/valor`).toBe(0)

  const keys: string[] = []
  for (let i = 0; i < args.length; i += 2) {
    const key = /^'([a-z_]+)'$/.exec(args[i])?.[1]
    expect(key, `${table}.${variable}: chave literal`).toBeDefined()
    // Valor é SEMPRE a própria coluna (sem expressão, sem renomear, sem linha inteira)
    expect(args[i + 1], `${table}.${variable}.${key}`).toBe(`${record}.${key}`)
    keys.push(key!)
  }
  return keys
}

/** Projeção explícita por tabela: { campaigns: { new: ['id', ...], old: ['id', ...] }, ... } */
function parseProjections(body: string): Record<string, Projection> {
  const result: Record<string, Projection> = {}
  // [antes, tabela1, trecho1, tabela2, trecho2, ...]
  const parts = body.split(/(?:ELSIF|IF) TG_TABLE_NAME = '([a-z_]+)' THEN/)
  for (let i = 1; i < parts.length; i += 2) {
    const table = parts[i]
    const chunk = parts[i + 1]
    result[table] = {
      new: projectionKeys(chunk, 'v_new', 'NEW', table),
      old: projectionKeys(chunk, 'v_old', 'OLD', table),
    }
  }
  return result
}

interface TriggerSpec {
  table: string
  name: string
  /** Definição depois do nome (`AFTER ... EXECUTE FUNCTION ...`), espaços normalizados */
  definition: string
}

/**
 * Triggers declaradas na lista `(tabela, trigger, $d$definição$d$)` do DO block de broadcast
 * (a migration cria cada uma com `CREATE OR REPLACE TRIGGER <nome> <definição>`).
 */
function parseTriggerSpecs(raw: string): TriggerSpec[] {
  const specs: TriggerSpec[] = []
  for (const match of raw.matchAll(/\('([a-z_]+)',\s*'([a-z_]+)',\s*\$d\$([\s\S]*?)\$d\$\)/g)) {
    specs.push({ table: match[1], name: match[2], definition: match[3].replace(/\s+/g, ' ').trim() })
  }
  return specs
}

function triggerDefinition(specs: TriggerSpec[], table: string, name: string): string {
  const found = specs.filter((spec) => spec.table === table && spec.name === name)
  expect(found, `trigger ${name} ON public.${table}`).toHaveLength(1)
  return found[0].definition
}

/**
 * Critério de realtime.send, igual na guarda da função e no DO block (espaços normalizados):
 * o fonte, sem literais e comentários, tem EXCEPTION WHEN OTHERS THEN e nenhum comando que
 * lance erro (só RAISE DEBUG/LOG/INFO/NOTICE/WARNING; RAISE; que relança, RAISE sem nível,
 * RAISE EXCEPTION e ASSERT reprovam). O comportamento (send do Supabase aceito; sem handler,
 * handler que relança etc. recusados, sem derrubar escrita) é verificado em Postgres por
 * `npm run db:check`, que também confere que usa estes mesmos três regex.
 */
const SEND_SAFE_CRITERION = String.raw`SELECT 1 FROM pg_catalog.pg_proc p, LATERAL (SELECT regexp_replace(p.prosrc, '''(?:[^'']|'''')*''|-{2}[^\n]*|/\*(?:[^*]|\*+[^/*])*\*+/', ' ', 'g') AS src) s WHERE p.oid = v_send::oid AND s.src ~* '\mexception\s+when\s+others\s+then\M' AND s.src !~* '\m(?:assert|raise(?!\s+(?:debug|log|info|notice|warning)\M))\M'`

/** USAGE no schema realtime antes do to_regprocedure (sem ele, to_regprocedure ERRA). */
const REALTIME_USAGE_GUARD =
  "IF NOT EXISTS ( SELECT 1 FROM pg_catalog.pg_namespace n WHERE n.nspname = 'realtime' AND has_schema_privilege(n.oid, 'USAGE') ) THEN RETURN NULL; END IF;"

/** SQL sem o texto das mensagens de RAISE WARNING (que citam GRANT/CREATE POLICY como correção). */
function withoutWarningMessages(sql: string): string {
  return sql.replace(/RAISE WARNING '(?:[^']|'')*'/g, "RAISE WARNING ''")
}

interface ColumnInfo {
  name: string
  /** Primeira palavra do tipo (text, jsonb, timestamp, integer...) */
  type: string
}

/**
 * Colunas de public.<table> segundo as migrations: CREATE TABLE + ADD/DROP COLUMN
 * posteriores, em ordem de arquivo. Serve de tripwire para os WHEN das triggers.
 */
function tableColumns(table: string): ColumnInfo[] {
  const columns = new Map<string, string>()
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  const name = `"?${table}"?`
  for (const file of files) {
    const sql = readMigration(file)
      .split(/\r?\n/)
      .map((line) => line.replace(/--.*$/, ''))
      .join('\n')
    const create = new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?(?:public\\.)?${name} \\(([\\s\\S]*?)\\n\\);`, 'i').exec(sql)
    if (create) {
      for (const line of create[1].split('\n')) {
        const column = /^\s*"?([a-z_][a-z0-9_]*)"?\s+([a-z][a-z0-9_]*)/i.exec(line)
        if (!column || /^(constraint|primary|unique|check|foreign|exclude)$/i.test(column[1])) continue
        columns.set(column[1], column[2].toLowerCase())
      }
    }
    for (const statement of sql.split(';')) {
      if (!new RegExp(`ALTER TABLE (?:ONLY )?(?:IF EXISTS )?(?:ONLY )?(?:public\\.)?${name}\\s`, 'i').test(statement)) continue
      for (const added of statement.matchAll(/ADD COLUMN (?:IF NOT EXISTS )?"?([a-z_][a-z0-9_]*)"?\s+([a-z][a-z0-9_]*)/gi)) {
        columns.set(added[1], added[2].toLowerCase())
      }
      for (const dropped of statement.matchAll(/DROP COLUMN (?:IF EXISTS )?"?([a-z_][a-z0-9_]*)"?/gi)) {
        columns.delete(dropped[1])
      }
    }
  }
  return Array.from(columns, ([column, type]) => ({ name: column, type }))
}

/** Colunas do WHEN `( (OLD.a, ...) IS DISTINCT FROM (NEW.a, ...) )` (mesma lista e ordem nos dois lados). */
function whenTupleColumns(definition: string): string[] {
  const match = / WHEN \( \(([^()]*)\) IS DISTINCT FROM \(([^()]*)\) \) EXECUTE FUNCTION /.exec(definition)
  expect(match, `WHEN em tupla: ${definition}`).not.toBeNull()
  const side = (list: string, record: 'OLD' | 'NEW') =>
    list.split(',').map((item) => {
      const column = new RegExp(`^${record}\\.([a-z_]+)$`).exec(item.trim())?.[1]
      expect(column, `${record}: ${item}`).toBeDefined()
      return column!
    })
  const oldColumns = side(match![1], 'OLD')
  expect(side(match![2], 'NEW')).toEqual(oldColumns)
  expect(new Set(oldColumns).size, 'coluna repetida no WHEN').toBe(oldColumns.length)
  return oldColumns
}

/**
 * Colunas que NÃO disparam o UPDATE (mudam sem mudança visível na UI). Todo o resto da
 * tabela tem de estar no WHEN: coluna nova faz o teste falhar até ser classificada.
 */
const UPDATE_WHEN_IGNORED: Record<'templates' | 'flows' | 'template_project_items', string[]> = {
  // sync da Meta / refresh no disparo regravam fetched_at/updated_at/spec_hash; o disparo
  // regrava a URL assinada do preview do header
  templates: [
    'id',
    'created_at',
    'updated_at',
    'fetched_at',
    'spec_hash',
    'header_media_preview_url',
    'header_media_preview_expires_at',
    'header_media_preview_updated_at',
  ],
  // salvar sem mudança e checar status na Meta
  flows: ['id', 'created_at', 'updated_at', 'meta_last_checked_at'],
  // sync de projetos regrava meta_id/meta_status iguais
  template_project_items: ['id', 'created_at', 'updated_at'],
}

// -----------------------------------------------------------------------------
// Mini avaliador das triggers (eventos, nível e WHEN) para simular o volume em
// realtime.messages. Cobre só o subconjunto de SQL usado nos WHEN das tabelas do inbox:
// OLD.col / NEW.col, NEW.col ->> 'chave', literais, tuplas, IS DISTINCT FROM, AND, OR.
// -----------------------------------------------------------------------------

type SqlValue = unknown
type Row = Record<string, unknown>

interface ParsedTrigger {
  events: string[]
  level: 'ROW' | 'STATEMENT'
  when: string | null
}

function parseTrigger(definition: string): ParsedTrigger {
  const match = /^AFTER ((?:INSERT|UPDATE|DELETE)(?: OR (?:INSERT|UPDATE|DELETE))*) ON public\.[a-z_]+ FOR EACH (ROW|STATEMENT)(?: WHEN \((.*)\))? EXECUTE FUNCTION public\.dispara_broadcast_change\(\)$/.exec(
    definition
  )
  expect(match, `definição de trigger inesperada: ${definition}`).not.toBeNull()
  return { events: match![1].split(' OR '), level: match![2] as ParsedTrigger['level'], when: match![3] ?? null }
}

function tokenize(expression: string): string[] {
  const tokens = expression.match(/'[^']*'|->>|<>|[(),]|[A-Za-z_][A-Za-z0-9_.]*/g) ?? []
  return tokens
}

function evaluateWhen(expression: string, oldRow: Row | null, newRow: Row | null): boolean {
  const tokens = tokenize(expression)
  let pos = 0
  const peek = () => tokens[pos]
  const take = (expected?: string) => {
    const token = tokens[pos++]
    if (expected !== undefined && token?.toUpperCase() !== expected) {
      throw new Error(`esperado ${expected}, veio ${token} em: ${expression}`)
    }
    return token
  }

  const distinct = (a: SqlValue, b: SqlValue): boolean => {
    if (Array.isArray(a) && Array.isArray(b)) return a.length !== b.length || a.some((v, i) => distinct(v, b[i]))
    const na = a === undefined ? null : a
    const nb = b === undefined ? null : b
    return JSON.stringify(na) !== JSON.stringify(nb)
  }

  const primary = (): SqlValue => {
    const token = take()
    if (token === '(') {
      const items = [orExpr()]
      while (peek() === ',') {
        take(',')
        items.push(orExpr())
      }
      take(')')
      return items.length === 1 ? items[0] : items
    }
    if (token.startsWith("'")) return token.slice(1, -1)
    if (token.toUpperCase() === 'NULL') return null
    const ref = /^(OLD|NEW)\.([a-z_]+)$/.exec(token)
    if (!ref) throw new Error(`token não suportado: ${token} em: ${expression}`)
    const row = ref[1] === 'OLD' ? oldRow : newRow
    if (!row) throw new Error(`${ref[1]} indisponível neste evento: ${expression}`)
    let value: SqlValue = row[ref[2]]
    if (peek() === '->>') {
      take('->>')
      const key = take().slice(1, -1)
      value = value && typeof value === 'object' ? ((value as Row)[key] ?? null) : null
      if (value !== null) value = String(value)
    }
    return value
  }

  const comparison = (): SqlValue => {
    const left = primary()
    if (peek()?.toUpperCase() === 'IS') {
      take('IS')
      take('DISTINCT')
      take('FROM')
      return distinct(left, primary())
    }
    return left
  }

  const andExpr = (): SqlValue => {
    let value = comparison()
    while (peek()?.toUpperCase() === 'AND') {
      take('AND')
      const right = comparison()
      value = value === false || right === false ? false : value === true && right === true ? true : null
    }
    return value
  }

  function orExpr(): SqlValue {
    let value = andExpr()
    while (peek()?.toUpperCase() === 'OR') {
      take('OR')
      const right = andExpr()
      value = value === true || right === true ? true : value === false && right === false ? false : null
    }
    return value
  }

  const result = orExpr()
  if (pos !== tokens.length) throw new Error(`sobrou expressão: ${tokens.slice(pos).join(' ')}`)
  return result === true
}

interface TableWrite {
  table: string
  op: 'INSERT' | 'UPDATE' | 'DELETE'
  rows: Array<{ old: Row | null; new: Row | null }>
}

/** Quantos eventos (linhas em realtime.messages) um statement gera com as triggers dadas. */
function countBroadcastEvents(specs: TriggerSpec[], write: TableWrite): number {
  let events = 0
  for (const spec of specs.filter((s) => s.table === write.table)) {
    const trigger = parseTrigger(spec.definition)
    if (!trigger.events.includes(write.op)) continue
    if (trigger.level === 'STATEMENT') {
      events += 1
      continue
    }
    for (const row of write.rows) {
      if (!trigger.when || evaluateWhen(trigger.when, row.old, row.new)) events += 1
    }
  }
  return events
}

// Nomes de coluna que NUNCA podem sair pelo canal público.
const FORBIDDEN_COLUMNS = ['phone', 'name', 'email', 'content', 'body', 'custom_fields', 'text', 'message']

// Outras colunas com PII/dados de negócio/segredos que também não podem vazar.
const ALSO_SENSITIVE = [
  'from_phone',
  'last_message_preview',
  'handoff_summary',
  'automation_paused_by',
  'notes',
  'tags',
  'details',
  'title',
  'prompt',
  'user_id',
  'payload',
  'media_url',
  'button_payload',
  'whatsapp_message_id',
  'message_id',
  'failure_reason',
  'ai_sources',
  'response_json',
  'response_json_raw',
  'mapped_data',
  'flow_token',
  'template_name',
  'flow_name',
  'template_variables',
  'template_snapshot',
  'quick_reply_responses',
  'fallback_response',
  'components',
  'spec',
  'flow_json',
  'mapping',
  'meta_preview_url',
  'rejected_reason',
  'sample_variables',
  'marketing_variables',
  'variables',
  'header',
  'footer',
  'buttons',
]

describe('migration 20261011000000_security_hardening.sql', () => {
  const raw = readMigration(HARDENING_FILE)
  const sql = normalizeSql(raw)

  it('não cria nenhuma policy de leitura anônima irrestrita', () => {
    expect(sql).not.toMatch(/TO anon USING \(true\)/i)
    // CREATE POLICY só aparece como correção sugerida num WARNING, nunca executado
    expect(withoutWarningMessages(sql)).not.toMatch(/CREATE POLICY/i)
  })

  it('remove as 7 policies anon_select_*', () => {
    for (const table of [
      'campaigns',
      'contacts',
      'templates',
      'flows',
      'inbox_conversations',
      'inbox_messages',
      'account_alerts',
    ]) {
      expect(sql).toContain(`DROP POLICY IF EXISTS "anon_select_${table}" ON public.${table};`)
      expect(sql).toContain(`REVOKE ALL ON TABLE public.${table} FROM anon, authenticated;`)
    }
  })

  it('DROP POLICY (ACCESS EXCLUSIVE nas 7 tabelas quentes) fica por último, depois do REVOKE', () => {
    const firstDropPolicy = sql.indexOf('DROP POLICY')
    // Nada que pegue lock ou espere depois dele: só os outros DROP POLICY até o fim
    expect(sql.slice(firstDropPolicy)).toMatch(/^(DROP POLICY IF EXISTS "anon_select_[a-z_]+" ON public\.[a-z_]+; ?)+$/)
    for (const marker of [
      'ENABLE ROW LEVEL SECURITY',
      'CREATE OR REPLACE TRIGGER',
      'ALTER PUBLICATION',
      'REVOKE EXECUTE ON ALL FUNCTIONS',
      'ALTER DEFAULT PRIVILEGES',
    ]) {
      expect(sql.lastIndexOf(marker), marker).toBeLessThan(firstDropPolicy)
    }
    // O acesso de anon fecha ANTES (vale até para quem aplicar fora de transação)
    expect(sql.indexOf('REVOKE ALL ON TABLE public.campaigns FROM anon, authenticated;')).toBeLessThan(firstDropPolicy)
  })

  it('nenhum bloco de exceção de DDL engole erro de lock: lock_timeout aborta a migration inteira', () => {
    // Fora da função de broadcast (best-effort por definição), todo handler é estreito
    // ou relança lock_not_available/deadlock antes do WHEN OTHERS.
    const body = broadcastFunctionBody(raw)
    const ddl = withoutWarningMessages(normalizeSql(raw.replace(body, '')))

    const handlers = ddl.match(/EXCEPTION WHEN [\s\S]*? END;/g) ?? []
    expect(handlers.length).toBe(3)
    for (const handler of handlers) {
      if (!handler.includes('WHEN OTHERS')) continue
      expect(handler, handler).toMatch(/^EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE; WHEN OTHERS THEN/)
    }
    expect(handlers.some((h) => /WHEN (lock_not_available|deadlock_detected|query_canceled)[^;]*THEN RAISE WARNING/.test(h))).toBe(false)

    // ENABLE RLS: só pula tabela de outro dono
    expect(ddl).toContain(
      "EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname); EXCEPTION WHEN insufficient_privilege THEN RAISE WARNING"
    )
    // Publicação: só "já saiu/não existe" e permissão
    expect(ddl).toContain(
      "EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE %I.%I', r.schemaname, r.tablename); EXCEPTION WHEN undefined_object OR undefined_table OR insufficient_privilege THEN RAISE WARNING"
    )
    // ALTER FUNCTION: relança lock/deadlock
    expect(ddl).toContain(
      "EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.signature); EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE; WHEN OTHERS THEN RAISE WARNING"
    )
  })

  it('limita a espera por lock (lock_timeout) e a duração dos statements antes de qualquer DDL', () => {
    const lockTimeout = sql.indexOf("SET LOCAL lock_timeout = '5s';")
    const statementTimeout = sql.indexOf("SET LOCAL statement_timeout = '60s';")
    expect(lockTimeout).toBeGreaterThanOrEqual(0)
    expect(statementTimeout).toBeGreaterThanOrEqual(0)

    // Antes do primeiro statement que pega lock em tabela
    const firstDdl = sql.search(/DROP POLICY|REVOKE|ALTER TABLE|CREATE TRIGGER|DROP TRIGGER/)
    expect(firstDdl).toBeGreaterThan(lockTimeout)
    expect(firstDdl).toBeGreaterThan(statementTimeout)

    // O cabeçalho documenta a janela de baixo tráfego e que re-executar é seguro
    expect(raw).toMatch(/BAIXO TRÁFEGO/)
    expect(raw).toMatch(/SEGURO DE RE-EXECUTAR/)
  })

  it('só liga RLS (ACCESS EXCLUSIVE) nas tabelas que ainda não têm', () => {
    expect(sql).toContain('SELECT c.oid, c.relname, c.relkind, c.relrowsecurity FROM pg_class c')
    expect(sql).toContain(
      "IF r.relkind IN ('r', 'p') AND NOT r.relrowsecurity THEN BEGIN EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);"
    )
  })

  it('revoga anon/authenticated de TODAS as tabelas de public via inventário dinâmico', () => {
    expect(sql).toMatch(/FROM pg_class c JOIN pg_namespace n ON n\.oid = c\.relnamespace WHERE n\.nspname = 'public'/)
    expect(sql).toContain("EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', r.relname);")
    expect(sql).toContain("EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);")
    expect(sql).toContain('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;')
    expect(sql).toContain('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;')
    expect(sql).toContain('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;')
    expect(sql).not.toMatch(/GRANT [A-Z, ]+ ON [^;]* TO (anon|authenticated)\b/i)
  })

  it('revoga EXECUTE em funções de PUBLIC/anon/authenticated e mantém service_role', () => {
    expect(sql).toContain('REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;')
    expect(sql).toContain('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;')
    expect(sql).toContain(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;'
    )
    expect(sql).toContain('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;')

    // O REVOKE geral vem DEPOIS da criação da função de broadcast (cobre ela também).
    expect(sql.indexOf('REVOKE EXECUTE ON ALL FUNCTIONS')).toBeGreaterThan(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.dispara_broadcast_change()')
    )
  })

  it('fixa search_path das SECURITY DEFINER que não têm', () => {
    expect(sql).toMatch(/AND p\.prosecdef/)
    expect(sql).toContain("EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.signature);")
  })

  describe('broadcast realtime (dispara_broadcast_change)', () => {
    const body = broadcastFunctionBody(raw)
    const normalizedBody = normalizeSql(body)
    const projections = parseProjections(body)

    it('é SECURITY DEFINER com search_path fixo', () => {
      const header = normalizeSql(raw.slice(raw.indexOf('CREATE OR REPLACE FUNCTION public.dispara_broadcast_change()'), raw.indexOf(body)))
      expect(header).toMatch(/SECURITY DEFINER/)
      expect(header).toMatch(/SET search_path = ''/)
    })

    it('publica no canal público dispara-db, evento db_change', () => {
      expect(normalizedBody).toMatch(/PERFORM realtime\.send\( jsonb_build_object\(/)
      expect(normalizedBody).toContain("'db_change', 'dispara-db', false );")
    })

    it('payload só usa as projeções explícitas (nunca a linha inteira)', () => {
      const build = /PERFORM realtime\.send\(\s*jsonb_build_object\(([\s\S]*?)\),\s*'db_change'/.exec(body)
      expect(build).not.toBeNull()
      const args = normalizeSql(build![1])
      expect(args).toBe(
        "'table', TG_TABLE_NAME, 'eventType', TG_OP, 'new', v_new, 'old', v_old, 'commit_timestamp', now()"
      )

      // to_jsonb(NEW)/row_to_json destoastam template_snapshot, components, content... a cada escrita
      expect(normalizedBody).not.toMatch(/to_jsonb\s*\(/i)
      expect(normalizedBody).not.toMatch(/row_to_json|jsonb_each|hstore/i)
      // v_new/v_old só recebem jsonb_build_object com colunas explícitas
      const assignments = normalizedBody.match(/v_(?:new|old) := [^;]*;/g) ?? []
      expect(assignments.length).toBeGreaterThan(0)
      for (const assignment of assignments) {
        expect(assignment).toMatch(/^v_(?:new|old) := jsonb_build_object\( ?(?:'[a-z_]+', (?:NEW|OLD)\.[a-z_]+(?:, )?)+ ?\);$/)
      }
    })

    it('campaigns: payload com colunas explícitas e old só com id/status/completed_at', () => {
      expect(projections.campaigns.new).toEqual(
        expect.arrayContaining(['id', 'status', 'sent', 'delivered', 'read', 'failed', 'completed_at', 'cancelled_at'])
      )
      // old enxuto: só o que useRealtimeNotifications usa para detectar a transição
      expect(projections.campaigns.old).toEqual(['id', 'status', 'completed_at'])
      for (const big of ['template_snapshot', 'ab_template_snapshot_b', 'template_variables', 'quick_reply_responses']) {
        expect(projections.campaigns.new).not.toContain(big)
        expect(normalizedBody).not.toContain(`NEW.${big}`)
      }
    })

    it('tem projeção para todas as tabelas com trigger por linha, e só para elas', () => {
      const tables = Object.keys(projections).sort()
      // contacts só tem trigger por statement (sem linha)
      expect(tables).toEqual(DB_BROADCAST_TABLES.filter((t) => t !== 'contacts').sort())
      for (const [table, projection] of Object.entries(projections)) {
        expect(projection.new.length, `${table}.new`).toBeGreaterThan(0)
        expect(projection.old.length, `${table}.old`).toBeGreaterThan(0)
      }
    })

    it('as projeções não referenciam colunas PII', () => {
      for (const [table, projection] of Object.entries(projections)) {
        for (const columns of [projection.new, projection.old]) {
          expect(columns, `${table} precisa de id`).toContain('id')
          for (const column of columns) {
            expect(FORBIDDEN_COLUMNS, `${table}.${column}`).not.toContain(column)
            expect(ALSO_SENSITIVE, `${table}.${column}`).not.toContain(column)
          }
        }
      }
    })

    it('mantém os campos de que o frontend depende (filtros e transições)', () => {
      expect(projections.campaigns.new).toEqual(expect.arrayContaining(['id', 'status', 'completed_at', 'sent', 'failed']))
      expect(projections.inbox_messages.new).toEqual(
        expect.arrayContaining(['id', 'conversation_id', 'direction', 'delivery_status'])
      )
      expect(projections.inbox_messages.old).toEqual(expect.arrayContaining(['id', 'conversation_id']))
      expect(projections.inbox_conversations.new).toEqual(expect.arrayContaining(['id', 'status', 'unread_count']))
      expect(projections.template_project_items.new).toEqual(expect.arrayContaining(['id', 'project_id']))
      expect(projections.template_project_items.old).toEqual(expect.arrayContaining(['id', 'project_id']))
      expect(projections.flow_submissions.new).toEqual(expect.arrayContaining(['id', 'campaign_id']))
      expect(projections.account_alerts.new).toEqual(expect.arrayContaining(['id', 'dismissed']))
    })

    it('nunca derruba a escrita, com UMA subtransação com XID por evento (a do realtime.send)', () => {
      // Um único bloco EXCEPTION, só na projeção: sem escrita lá dentro a subtransação
      // não recebe XID. realtime.send fica FORA dele (tem o próprio EXCEPTION no INSERT).
      const exceptionBlocks = normalizedBody.match(/\bEXCEPTION\b/g) ?? []
      expect(exceptionBlocks).toHaveLength(1)

      const blockStart = normalizedBody.indexOf("BEGIN IF TG_LEVEL = 'ROW' THEN")
      const handler = normalizedBody.indexOf(
        "EXCEPTION WHEN OTHERS THEN RAISE WARNING 'dispara_broadcast_change(%): %', TG_TABLE_NAME, SQLERRM; RETURN NULL; END;"
      )
      const send = normalizedBody.indexOf('PERFORM realtime.send(')
      expect(blockStart).toBeGreaterThan(0)
      expect(handler).toBeGreaterThan(blockStart)
      expect(send).toBeGreaterThan(handler)

      // Dentro do bloco: só projeção (nenhuma escrita, nenhuma chamada ao realtime)
      const block = normalizedBody.slice(blockStart, handler)
      expect(block).not.toMatch(/PERFORM|EXECUTE|INSERT INTO|UPDATE [a-z]|DELETE FROM|realtime\./i)

      // Guardas ANTES do bloco: sem USAGE no schema realtime (checado ANTES do
      // to_regprocedure, que erra sem ele), sem realtime.send, sem EXECUTE nele, ou com um
      // send que não trata/relança os próprios erros, não publica (o send fora do bloco
      // nunca derruba a escrita por permissão revogada nem por falha no INSERT).
      const guard = normalizedBody.indexOf(
        `${REALTIME_USAGE_GUARD} v_send := to_regprocedure('realtime.send(jsonb,text,text,boolean)'); IF v_send IS NULL THEN RETURN NULL; END IF; IF NOT has_function_privilege(v_send::oid, 'EXECUTE') THEN RETURN NULL; END IF; ` +
          `IF NOT EXISTS ( ${SEND_SAFE_CRITERION} ) THEN RETURN NULL; END IF;`
      )
      expect(guard).toBeGreaterThanOrEqual(0)
      expect(guard).toBeLessThan(blockStart)
      // Nenhum to_regprocedure/to_regclass em realtime antes da checagem de USAGE
      expect(normalizedBody.indexOf("to_regprocedure('realtime.")).toBeGreaterThan(normalizedBody.indexOf(REALTIME_USAGE_GUARD))
      expect(normalizedBody).not.toMatch(/to_regclass\('realtime\./)
      // A checagem é a cada evento: nada entre as guardas e o send pula a verificação
      expect(normalizedBody.indexOf('PERFORM realtime.send(')).toBeGreaterThan(guard)
      expect(normalizedBody.match(/PERFORM realtime\.send\(/g)).toHaveLength(1)
    })
  })

  describe('triggers de broadcast', () => {
    const specs = parseTriggerSpecs(raw)
    const def = (table: string, name: string) => triggerDefinition(specs, table, name)

    it('sem realtime.send: WARNING acionável (não NOTICE) e nenhuma trigger', () => {
      // USAGE no schema realtime antes do to_regprocedure (sem ele, to_regprocedure erra)
      const lookup = sql.indexOf(
        "SELECT n.oid INTO v_realtime FROM pg_catalog.pg_namespace n WHERE n.nspname = 'realtime'; IF v_realtime IS NOT NULL AND has_schema_privilege(v_realtime, 'USAGE') THEN v_send := to_regprocedure('realtime.send(jsonb,text,text,boolean)'); END IF;"
      )
      expect(lookup).toBeGreaterThan(0)
      const missing = sql.indexOf("IF v_send IS NULL THEN RAISE WARNING 'security_hardening: realtime.send indisponível", lookup)
      expect(missing).toBeGreaterThan(lookup)
      // Diz o que fazer, e sai do DO block antes de criar qualquer trigger
      const statement = sql.slice(missing, sql.indexOf('END IF;', missing))
      expect(statement).toMatch(/Reaplique esta migration depois que o Realtime estiver ativo/)
      expect(statement).toMatch(/; RETURN; $/)
      expect(missing).toBeLessThan(sql.indexOf("EXECUTE format('CREATE OR REPLACE TRIGGER"))
      // NOTICE some no log do SQL editor/installer
      expect(sql).not.toMatch(/RAISE NOTICE/i)
    })

    it('só cria as triggers se realtime.send tratar os próprios erros sem relançar (send fora de bloco de exceção)', () => {
      const check = sql.indexOf(
        `IF NOT EXISTS ( ${SEND_SAFE_CRITERION} ) THEN RAISE WARNING 'security_hardening: realtime.send não trata os próprios erros`
      )
      expect(check).toBeGreaterThan(sql.indexOf('IF v_send IS NULL THEN RAISE WARNING'))
      const statement = sql.slice(check, sql.indexOf('END IF;', check))
      // Explica o motivo (inclusive o handler que relança) e sai antes de criar triggers
      expect(statement).toMatch(/derrubaria a escrita do app/)
      expect(statement).toMatch(/RAISE;/)
      expect(statement).toMatch(/Reaplique esta migration/)
      expect(statement).toMatch(/'; RETURN; $/)
      expect(check).toBeLessThan(sql.indexOf("EXECUTE format('CREATE OR REPLACE TRIGGER"))

      // Mesmo critério na guarda da função (vale também para triggers já existentes).
      expect(sql.split(SEND_SAFE_CRITERION)).toHaveLength(3)
      expect(raw).toMatch(/PREMISSA do realtime\.send/)
    })

    it('avisa (sem impedir as triggers) quando o dono não pode chamar o send ou gravar em realtime.messages', () => {
      const start = sql.indexOf("SELECT f.proowner, CASE WHEN s.prosecdef THEN s.proowner ELSE f.proowner END")
      const loop = sql.indexOf("EXECUTE format('CREATE OR REPLACE TRIGGER")
      expect(start).toBeGreaterThan(sql.indexOf(`IF NOT EXISTS ( ${SEND_SAFE_CRITERION} ) THEN RAISE WARNING`))
      expect(start).toBeLessThan(loop)
      const block = sql.slice(start, sql.indexOf('END IF;', sql.indexOf("tem RLS ligado", start)) + 'END IF;'.length)
      // Quem chama o send é o DONO de dispara_broadcast_change; quem insere, ele ou o dono do send SECURITY DEFINER
      expect(block).toContain("WHERE f.oid = 'public.dispara_broadcast_change()'::regprocedure AND s.oid = v_send::oid;")
      expect(block).toContain("has_schema_privilege(v_fn_owner, v_realtime, 'USAGE') AND has_function_privilege(v_fn_owner, v_send::oid, 'EXECUTE')")
      expect(block).toContain("has_table_privilege(v_inserter, v_messages, 'INSERT')")
      // RLS: superusuário, BYPASSRLS, dono sem FORCE ou policy PERMISSIVE de INSERT/ALL aplicável
      expect(block).toMatch(/AND c\.relrowsecurity AND NOT a\.rolsuper AND NOT a\.rolbypassrls AND NOT \(pg_has_role\(v_inserter, c\.relowner, 'USAGE'\) AND NOT c\.relforcerowsecurity\)/)
      expect(block).toContain("pol.polcmd IN ('a', '*') AND pol.polpermissive")
      // Mensagens acionáveis (o GRANT/policy que falta), sem RETURN: as triggers são criadas
      expect(block).toMatch(/sem USAGE no schema realtime ou sem EXECUTE em realtime\.send .*GRANT EXECUTE ON FUNCTION realtime\.send/)
      expect(block).toMatch(/sem INSERT em realtime\.messages .*GRANT INSERT ON realtime\.messages TO %/)
      expect(block).toMatch(/tem RLS ligado .*CREATE POLICY dispara_broadcast_insert ON realtime\.messages FOR INSERT TO %/)
      expect(block).not.toMatch(/RETURN;/)
    })

    it('cobrem as tabelas do frontend, todas pela função de broadcast', () => {
      const tables = Array.from(new Set(specs.map((spec) => spec.table))).sort()
      expect(tables).toEqual([...DB_BROADCAST_TABLES].sort())
      for (const spec of specs) {
        expect(spec.definition, `${spec.table}.${spec.name}`).toMatch(
          new RegExp(`^AFTER [A-Z ]+ ON public\\.${spec.table} FOR EACH (ROW|STATEMENT) .*EXECUTE FUNCTION public\\.dispara_broadcast_change\\(\\)$`)
        )
        expect(spec.name).toMatch(/^dispara_realtime_broadcast(_update|_delete)?$/)
      }

      // Volume baixo: por linha, em INSERT/UPDATE/DELETE
      for (const table of ['account_alerts', 'template_projects']) {
        expect(def(table, 'dispara_realtime_broadcast')).toBe(
          `AFTER INSERT OR UPDATE OR DELETE ON public.${table} FOR EACH ROW EXECUTE FUNCTION public.dispara_broadcast_change()`
        )
      }
      // INSERT/DELETE sem condição; UPDATE com WHEN (ver o teste dos WHEN abaixo)
      for (const table of ['templates', 'flows', 'template_project_items']) {
        expect(def(table, 'dispara_realtime_broadcast')).toBe(
          `AFTER INSERT OR DELETE ON public.${table} FOR EACH ROW EXECUTE FUNCTION public.dispara_broadcast_change()`
        )
        expect(def(table, 'dispara_realtime_broadcast_update')).toMatch(
          new RegExp(`^AFTER UPDATE ON public\\.${table} FOR EACH ROW WHEN \\(`)
        )
      }
      expect(def('contacts', 'dispara_realtime_broadcast')).toBe(
        'AFTER INSERT OR UPDATE OR DELETE ON public.contacts FOR EACH STATEMENT EXECUTE FUNCTION public.dispara_broadcast_change()'
      )
      expect(def('flow_submissions', 'dispara_realtime_broadcast')).toBe(
        'AFTER INSERT ON public.flow_submissions FOR EACH ROW EXECUTE FUNCTION public.dispara_broadcast_change()'
      )
    })

    it('re-executar não trava tabela: CREATE OR REPLACE só quando a definição muda ou a trigger foi mexida à mão, sem DROP TRIGGER', () => {
      // DROP TRIGGER pega ACCESS EXCLUSIVE (até o COMMIT) mesmo para recriar igual
      expect(sql).not.toMatch(/DROP TRIGGER/i)
      expect(sql).not.toMatch(/CREATE TRIGGER/)
      expect(sql).toContain(
        "v_definition := regexp_replace(btrim(r.definition), '\\s+', ' ', 'g'); v_spec_md5 := md5(v_definition);"
      )
      expect(sql).toContain(
        "SELECT tg.oid, obj_description(tg.oid, 'pg_trigger'), tg.tgenabled INTO v_trigger, v_current, v_enabled FROM pg_trigger tg"
      )

      // search_path canônico (pg_get_triggerdef qualifica a função conforme ele) e de volta no fim
      const canonical = sql.indexOf("v_search_path := current_setting('search_path'); PERFORM set_config('search_path', 'pg_catalog', true);")
      // Pula só se: existe, está habilitada, a 1ª parte da marca é a definição deste arquivo e
      // a 2ª é o pg_get_triggerdef de AGORA (CREATE OR REPLACE TRIGGER manual mantém OID e COMMENT)
      const skip = sql.indexOf(
        "IF v_trigger IS NOT NULL AND v_enabled IN ('O', 'A') AND v_current = 'dispara_broadcast:' || v_spec_md5 || ':' || md5(pg_get_triggerdef(v_trigger)) THEN CONTINUE; END IF;"
      )
      const create = sql.indexOf("EXECUTE format('CREATE OR REPLACE TRIGGER %I %s', r.trigger_name, v_definition);")
      const marker = sql.indexOf(
        "SELECT 'dispara_broadcast:' || v_spec_md5 || ':' || md5(pg_get_triggerdef(tg.oid)) INTO v_marker FROM pg_trigger tg"
      )
      const comment = sql.indexOf(
        "EXECUTE format('COMMENT ON TRIGGER %I ON public.%I IS %L', r.trigger_name, r.table_name, v_marker);"
      )
      const restore = sql.indexOf("END LOOP; PERFORM set_config('search_path', v_search_path, true); END $$;")
      expect(canonical).toBeGreaterThan(0)
      expect(skip).toBeGreaterThan(canonical)
      expect(create).toBeGreaterThan(skip)
      expect(marker).toBeGreaterThan(create)
      expect(comment).toBeGreaterThan(marker)
      expect(restore).toBeGreaterThan(comment)
      // Nenhum RETURN entre o search_path canônico e a restauração
      expect(sql.slice(canonical, restore)).not.toMatch(/RETURN;/)
    })

    it('campaigns: INSERT/DELETE sem condição e UPDATE com WHEN (nunca 1 evento por webhook de status)', () => {
      expect(def('campaigns', 'dispara_realtime_broadcast')).toBe(
        'AFTER INSERT OR DELETE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.dispara_broadcast_change()'
      )
      // Nenhuma trigger de campaigns dispara em TODO update
      for (const spec of specs.filter((s) => s.table === 'campaigns')) {
        const trigger = parseTrigger(spec.definition)
        if (trigger.events.includes('UPDATE')) expect(trigger.when, spec.name).not.toBeNull()
      }

      const update = def('campaigns', 'dispara_realtime_broadcast_update')
      expect(update).toMatch(/^AFTER UPDATE ON public\.campaigns FOR EACH ROW WHEN \(/)
      expect(update).toMatch(/\) EXECUTE FUNCTION public\.dispara_broadcast_change\(\)$/)

      // Sempre publica mudança de status/conclusão/cancelamento/pasta
      for (const column of ['status', 'completed_at', 'cancelled_at', 'folder_id']) {
        expect(update).toContain(`OLD.${column} IS DISTINCT FROM NEW.${column} OR`)
      }
      // Contadores: só se mudaram E no primeiro UPDATE da janela fixa de 2s
      expect(update).toMatch(/\(OLD\.sent, OLD\.delivered, OLD\.read, OLD\.failed, OLD\.skipped,[^)]*\) IS DISTINCT FROM \(NEW\.sent, NEW\.delivered, NEW\.read, NEW\.failed, NEW\.skipped,/)
      expect(update).toContain(
        'AND ( OLD.updated_at IS NULL OR floor(extract(epoch FROM OLD.updated_at) / 2) <> floor(extract(epoch FROM now()) / 2) )'
      )
      // try_lock/release_campaign_dispatch_lock (só dispatch_lock_* + updated_at) não publicam
      expect(update).not.toMatch(/dispatch_lock|dispatch_locked_by/)
      // throttle por OLD.updated_at < now() - interval nunca dispara sob fluxo contínuo
      expect(update).not.toMatch(/interval/i)
    })

    it('inbox_messages: sem template de campanha, UPDATE só quando o status muda, DELETE por statement', () => {
      expect(def('inbox_messages', 'dispara_realtime_broadcast')).toBe(
        "AFTER INSERT ON public.inbox_messages FOR EACH ROW WHEN ((NEW.payload ->> 'type') IS DISTINCT FROM 'campaign_template') EXECUTE FUNCTION public.dispara_broadcast_change()"
      )
      expect(def('inbox_messages', 'dispara_realtime_broadcast_update')).toBe(
        "AFTER UPDATE ON public.inbox_messages FOR EACH ROW WHEN ( OLD.delivery_status IS DISTINCT FROM NEW.delivery_status AND (NEW.payload ->> 'type') IS DISTINCT FROM 'campaign_template' ) EXECUTE FUNCTION public.dispara_broadcast_change()"
      )
      expect(def('inbox_messages', 'dispara_realtime_broadcast_delete')).toBe(
        'AFTER DELETE ON public.inbox_messages FOR EACH STATEMENT EXECUTE FUNCTION public.dispara_broadcast_change()'
      )
    })

    it('inbox_conversations: sem INSERT; UPDATE só quando muda o estado do atendimento', () => {
      const conversationTriggers = specs
        .filter((s) => s.table === 'inbox_conversations')
        .map((s) => parseTrigger(s.definition))
      expect(conversationTriggers.some((t) => t.events.includes('INSERT'))).toBe(false)

      expect(def('inbox_conversations', 'dispara_realtime_broadcast')).toBe(
        'AFTER DELETE ON public.inbox_conversations FOR EACH ROW EXECUTE FUNCTION public.dispara_broadcast_change()'
      )
      const update = def('inbox_conversations', 'dispara_realtime_broadcast_update')
      expect(update).toContain(
        '(OLD.status, OLD.mode, OLD.priority, OLD.unread_count, OLD.ai_agent_id, OLD.automation_paused_until, OLD.human_mode_expires_at) IS DISTINCT FROM (NEW.status, NEW.mode, NEW.priority, NEW.unread_count, NEW.ai_agent_id, NEW.automation_paused_until, NEW.human_mode_expires_at)'
      )
      // Contador de saída e SET NULL de contact_id (bulk_delete_contacts) não publicam
      for (const column of ['total_messages', 'last_message_at', 'last_message_preview', 'contact_id', 'updated_at']) {
        expect(update).not.toContain(column)
      }
    })

    it('templates/flows/template_project_items: UPDATE só quando muda coluna que a UI mostra', () => {
      for (const [table, ignored] of Object.entries(UPDATE_WHEN_IGNORED)) {
        const update = def(table, 'dispara_realtime_broadcast_update')
        const watched = whenTupleColumns(update)
        const columns = tableColumns(table)
        expect(columns.length, `colunas de public.${table}`).toBeGreaterThan(5)
        const names = columns.map((c) => c.name)

        // Toda coluna é classificada: ou entra no WHEN ou está na lista de ignoradas
        const unclassified = names.filter((c) => !watched.includes(c) && !ignored.includes(c))
        expect(unclassified, `${table}: coluna nova? inclua no WHEN ou em UPDATE_WHEN_IGNORED`).toEqual([])
        expect(watched.filter((c) => !names.includes(c)), `${table}: WHEN com coluna inexistente`).toEqual([])
        expect(ignored.filter((c) => !names.includes(c)), `${table}: ignorada inexistente`).toEqual([])
        expect(watched.filter((c) => ignored.includes(c)), `${table}: ignorada no WHEN`).toEqual([])

        // Colunas de controle nunca disparam sozinhas
        for (const column of ['updated_at', 'created_at', 'id']) expect(watched).not.toContain(column)
        expect(watched).toEqual(expect.arrayContaining(['name', 'status']))

        // Comparação barata primeiro: jsonb só no fim da tupla (OR com curto-circuito)
        const types = new Map(columns.map((c) => [c.name, c.type]))
        const firstJsonb = watched.findIndex((c) => types.get(c) === 'jsonb')
        if (firstJsonb >= 0) {
          expect(watched.slice(firstJsonb).every((c) => types.get(c) === 'jsonb'), `${table}: ${watched.join(', ')}`).toBe(true)
        }
        // json (sem =) quebraria o IS DISTINCT FROM em tempo de execução, derrubando a escrita
        expect(watched.filter((c) => types.get(c) === 'json'), `${table}: coluna json no WHEN`).toEqual([])
      }

      // O que muda a cada sync/salvar fica de fora
      expect(whenTupleColumns(def('templates', 'dispara_realtime_broadcast_update'))).not.toEqual(
        expect.arrayContaining(['fetched_at'])
      )
      expect(whenTupleColumns(def('templates', 'dispara_realtime_broadcast_update'))).toEqual(
        expect.arrayContaining(['name', 'status', 'category', 'language', 'parameter_format', 'components'])
      )
      expect(whenTupleColumns(def('flows', 'dispara_realtime_broadcast_update'))).toEqual(
        expect.arrayContaining(['meta_status', 'meta_flow_id', 'spec', 'flow_json'])
      )
      expect(whenTupleColumns(def('template_project_items', 'dispara_realtime_broadcast_update'))).toEqual(
        expect.arrayContaining(['project_id', 'meta_status', 'meta_id', 'content'])
      )
    })

    it('toda trigger por linha de UPDATE em tabela com escrita recorrente tem WHEN', () => {
      const conditional = ['campaigns', 'inbox_messages', 'inbox_conversations', 'templates', 'flows', 'template_project_items']
      for (const spec of specs.filter((s) => conditional.includes(s.table))) {
        const trigger = parseTrigger(spec.definition)
        if (trigger.level === 'ROW' && trigger.events.includes('UPDATE')) {
          expect(trigger.when, `${spec.table}.${spec.name}`).not.toBeNull()
        }
      }
    })

    it('NÃO cria trigger em campaign_contacts (volume do disparo)', () => {
      expect(sql).not.toMatch(/ON public\.campaign_contacts/)
      expect(sql).not.toMatch(/'campaign_contacts'/)
    })

    it('tira as tabelas de public da publicação do postgres_changes', () => {
      expect(sql).toContain("EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE %I.%I', r.schemaname, r.tablename);")
    })
  })

  describe('volume em realtime.messages (simulação das triggers do inbox)', () => {
    const specs = parseTriggerSpecs(raw)
    const count = (write: TableWrite) => countBroadcastEvents(specs, write)

    const conversation = (overrides: Row = {}): Row => ({
      id: 'conv1',
      contact_id: 'ct1',
      ai_agent_id: 'agent1',
      status: 'open',
      mode: 'bot',
      priority: 'normal',
      unread_count: 0,
      total_messages: 0,
      last_message_at: null,
      last_message_preview: null,
      automation_paused_until: null,
      human_mode_expires_at: null,
      updated_at: '2026-10-11T10:00:00Z',
      ...overrides,
    })
    const message = (overrides: Row = {}): Row => ({
      id: 'm1',
      conversation_id: 'conv1',
      direction: 'outbound',
      delivery_status: 'sent',
      payload: null,
      ...overrides,
    })
    const campaignPayload = { type: 'campaign_template', campaign_id: 'c1', template_name: 't' }

    /** O que o disparo grava por contato (syncCampaignTemplateToInbox + webhooks de status). */
    function campaignContactWrites(index: number): TableWrite[] {
      const conv = conversation({ id: `conv${index}` })
      const sent = message({ id: `m${index}`, conversation_id: conv.id, payload: campaignPayload })
      const delivered = { ...sent, delivery_status: 'delivered' }
      const read = { ...sent, delivery_status: 'read' }
      return [
        // getOrCreateConversation (contato sem conversa)
        { table: 'inbox_conversations', op: 'INSERT', rows: [{ old: null, new: conv }] },
        // createMessage do template
        { table: 'inbox_messages', op: 'INSERT', rows: [{ old: null, new: sent }] },
        // increment_conversation_counters(outbound)
        {
          table: 'inbox_conversations',
          op: 'UPDATE',
          rows: [
            {
              old: conv,
              new: { ...conv, total_messages: 1, last_message_at: 'x', last_message_preview: 'Olá', updated_at: 'y' },
            },
          ],
        },
        // webhooks sent (repetido), delivered e read → handleDeliveryStatus
        { table: 'inbox_messages', op: 'UPDATE', rows: [{ old: sent, new: sent }] },
        { table: 'inbox_messages', op: 'UPDATE', rows: [{ old: sent, new: delivered }] },
        { table: 'inbox_messages', op: 'UPDATE', rows: [{ old: delivered, new: read }] },
      ]
    }

    it('disparo de campanha: nenhuma linha em realtime.messages por contato', () => {
      // As duas tabelas do inbox têm trigger (o zero abaixo não é por falta de trigger)
      expect(specs.filter((s) => s.table === 'inbox_messages').length).toBeGreaterThan(0)
      expect(specs.filter((s) => s.table === 'inbox_conversations').length).toBeGreaterThan(0)

      let events = 0
      for (let i = 0; i < 1000; i++) {
        for (const write of campaignContactWrites(i)) events += count(write)
      }
      expect(events).toBe(0)
    })

    it('referência: as triggers anteriores (sem WHEN no inbox) gravavam 6 linhas por contato', () => {
      const previous: TriggerSpec[] = [
        {
          table: 'inbox_messages',
          name: 'dispara_realtime_broadcast',
          definition:
            'AFTER INSERT OR UPDATE ON public.inbox_messages FOR EACH ROW EXECUTE FUNCTION public.dispara_broadcast_change()',
        },
        {
          table: 'inbox_conversations',
          name: 'dispara_realtime_broadcast',
          definition:
            'AFTER INSERT OR UPDATE OR DELETE ON public.inbox_conversations FOR EACH ROW EXECUTE FUNCTION public.dispara_broadcast_change()',
        },
      ]
      let events = 0
      for (let i = 0; i < 1000; i++) {
        for (const write of campaignContactWrites(i)) events += countBroadcastEvents(previous, write)
      }
      // INSERT da conversa + INSERT da mensagem + UPDATE do contador + 3 webhooks de status
      expect(events).toBe(6 * 1000)
    })

    it('mensagem recebida, resposta humana e atendimento continuam ao vivo', () => {
      const conv = conversation({ total_messages: 3, unread_count: 0 })

      // process_inbound_message: UPDATE (não lidas +1) + INSERT da mensagem recebida
      expect(
        count({
          table: 'inbox_conversations',
          op: 'UPDATE',
          rows: [{ old: conv, new: { ...conv, unread_count: 1, total_messages: 4 } }],
        })
      ).toBe(1)
      expect(
        count({
          table: 'inbox_messages',
          op: 'INSERT',
          rows: [{ old: null, new: message({ direction: 'inbound', delivery_status: 'delivered' }) }],
        })
      ).toBe(1)

      // Resposta humana: INSERT publica; o contador de saída não
      const reply = message({ id: 'm2', delivery_status: 'pending' })
      expect(count({ table: 'inbox_messages', op: 'INSERT', rows: [{ old: null, new: reply }] })).toBe(1)
      expect(
        count({
          table: 'inbox_conversations',
          op: 'UPDATE',
          rows: [{ old: conv, new: { ...conv, total_messages: 4, last_message_at: 'x' } }],
        })
      ).toBe(0)
      // Status de entrega da resposta: publica quando muda, não quando repete
      const sentReply = { ...reply, delivery_status: 'sent' }
      expect(count({ table: 'inbox_messages', op: 'UPDATE', rows: [{ old: reply, new: sentReply }] })).toBe(1)
      expect(count({ table: 'inbox_messages', op: 'UPDATE', rows: [{ old: sentReply, new: sentReply }] })).toBe(0)

      // Atendimento: takeover, marcar como lida, fechar, apagar
      expect(count({ table: 'inbox_conversations', op: 'UPDATE', rows: [{ old: conv, new: { ...conv, mode: 'human' } }] })).toBe(1)
      expect(
        count({ table: 'inbox_conversations', op: 'UPDATE', rows: [{ old: { ...conv, unread_count: 2 }, new: conv }] })
      ).toBe(1)
      expect(
        count({ table: 'inbox_conversations', op: 'UPDATE', rows: [{ old: conv, new: { ...conv, status: 'closed' } }] })
      ).toBe(1)
      expect(count({ table: 'inbox_conversations', op: 'DELETE', rows: [{ old: conv, new: null }] })).toBe(1)
    })

    it('SET NULL em massa de contact_id (bulk_delete_contacts) não publica nada', () => {
      const rows = Array.from({ length: 500 }, (_, i) => {
        const conv = conversation({ id: `conv${i}` })
        return { old: conv, new: { ...conv, contact_id: null } }
      })
      expect(count({ table: 'inbox_conversations', op: 'UPDATE', rows })).toBe(0)
      // Apagar uma conversa com N mensagens em cascata: 1 evento (STATEMENT), não N
      const cascade = Array.from({ length: 500 }, (_, i) => ({ old: message({ id: `m${i}` }), new: null }))
      expect(count({ table: 'inbox_messages', op: 'DELETE', rows: cascade })).toBe(1)
    })
  })

  describe('volume em realtime.messages (templates, flows e itens de projeto)', () => {
    const specs = parseTriggerSpecs(raw)
    const count = (write: TableWrite) => countBroadcastEvents(specs, write)

    const template = (index: number, overrides: Row = {}): Row => ({
      id: `tpl_${index}`,
      name: `template_${index}`,
      category: 'MARKETING',
      language: 'pt_BR',
      status: 'APPROVED',
      parameter_format: 'positional',
      components: [{ type: 'BODY', text: `Olá {{1}} (${index})` }],
      spec_hash: `hash_${index}`,
      fetched_at: '2026-10-11T10:00:00Z',
      created_at: '2026-10-01T10:00:00Z',
      updated_at: '2026-10-11T10:00:00Z',
      header_media_preview_url: null,
      header_media_preview_expires_at: null,
      header_media_preview_updated_at: null,
      ...overrides,
    })

    it('sync de templates (upsert de todos a cada GET) sem mudança real não publica', () => {
      const rows = Array.from({ length: 200 }, (_, i) => {
        const old = template(i)
        // syncTemplatesToLocalDb: fetched_at/updated_at novos, spec_hash recalculado (igual)
        return { old, new: { ...old, fetched_at: '2026-10-11T11:00:00Z', updated_at: '2026-10-11T11:00:00Z' } }
      })
      expect(count({ table: 'templates', op: 'UPDATE', rows })).toBe(0)

      // Referência: com a trigger anterior (UPDATE sem WHEN) eram 200 linhas por sync
      const previous: TriggerSpec[] = [
        {
          table: 'templates',
          name: 'dispara_realtime_broadcast',
          definition: 'AFTER INSERT OR UPDATE OR DELETE ON public.templates FOR EACH ROW EXECUTE FUNCTION public.dispara_broadcast_change()',
        },
      ]
      expect(countBroadcastEvents(previous, { table: 'templates', op: 'UPDATE', rows })).toBe(200)

      // Disparo regravando a URL assinada do preview do header: não publica
      const preview = template(1)
      expect(
        count({
          table: 'templates',
          op: 'UPDATE',
          rows: [{ old: preview, new: { ...preview, header_media_preview_url: 'https://x/signed?t=2', updated_at: 'y' } }],
        })
      ).toBe(0)
    })

    it('templates: mudança visível publica 1 evento por linha mudada; INSERT/DELETE sempre', () => {
      const rows = Array.from({ length: 200 }, (_, i) => {
        const old = template(i)
        const changed: Row =
          i === 3 ? { status: 'REJECTED' } : i === 7 ? { components: [{ type: 'BODY', text: 'novo' }] } : i === 9 ? { category: 'UTILIDADE' } : {}
        return { old, new: { ...old, ...changed, fetched_at: 'x', updated_at: 'x' } }
      })
      expect(count({ table: 'templates', op: 'UPDATE', rows })).toBe(3)
      expect(count({ table: 'templates', op: 'INSERT', rows: [{ old: null, new: template(500) }] })).toBe(1)
      expect(count({ table: 'templates', op: 'DELETE', rows: [{ old: template(1), new: null }] })).toBe(1)
    })

    it('flows: salvar/checar sem mudança não publica; nome, status Meta e spec publicam', () => {
      const flow: Row = {
        id: 'fl_1',
        name: 'Agendamento',
        status: 'DRAFT',
        meta_flow_id: null,
        meta_status: null,
        meta_preview_url: null,
        meta_published_at: null,
        meta_validation_errors: null,
        meta_last_checked_at: null,
        template_key: null,
        flow_version: null,
        mapping: {},
        spec: { form: { fields: [] } },
        flow_json: null,
        created_at: 'c',
        updated_at: 'u',
      }
      const update = (changes: Row) =>
        count({ table: 'flows', op: 'UPDATE', rows: [{ old: flow, new: { ...flow, updated_at: 'u2', ...changes } }] })

      expect(update({})).toBe(0)
      expect(update({ meta_last_checked_at: 'agora' })).toBe(0)
      expect(update({ name: 'Agendamento 2' })).toBe(1)
      expect(update({ meta_status: 'PUBLISHED', meta_flow_id: '123' })).toBe(1)
      expect(update({ spec: { form: { fields: [{ id: 'nome' }] } } })).toBe(1)
      expect(update({ meta_validation_errors: { source: 'local', errors: ['x'] }, meta_last_checked_at: 'agora' })).toBe(1)
    })

    it('template_project_items: sync de projeto que regrava o mesmo meta_id/meta_status não publica', () => {
      const item = (index: number, overrides: Row = {}): Row => ({
        id: `tpi_${index}`,
        project_id: 'tp_1',
        name: `item_${index}`,
        content: 'Olá {{1}}',
        language: 'pt_BR',
        category: 'UTILITY',
        status: 'submitted',
        meta_id: `meta_${index}`,
        meta_status: 'PENDING',
        rejected_reason: null,
        submitted_at: 's',
        components: null,
        header: null,
        footer: null,
        buttons: null,
        variables: null,
        sample_variables: null,
        marketing_variables: null,
        created_at: 'c',
        updated_at: null,
        ...overrides,
      })
      const sync = Array.from({ length: 50 }, (_, i) => ({ old: item(i), new: item(i) }))
      expect(count({ table: 'template_project_items', op: 'UPDATE', rows: sync })).toBe(0)

      const approved = Array.from({ length: 50 }, (_, i) => ({ old: item(i), new: item(i, i < 2 ? { meta_status: 'APPROVED' } : {}) }))
      expect(count({ table: 'template_project_items', op: 'UPDATE', rows: approved })).toBe(2)
      expect(
        count({ table: 'template_project_items', op: 'UPDATE', rows: [{ old: item(1), new: item(1, { content: 'Oi {{1}}' }) }] })
      ).toBe(1)
    })
  })

  it('é idempotente (sem CREATE sem IF NOT EXISTS/OR REPLACE fora dos DO blocks guardados)', () => {
    expect(sql).not.toMatch(/CREATE FUNCTION/i)
    expect(sql).not.toMatch(/CREATE TABLE(?! IF NOT EXISTS)/i)
    expect(sql).not.toMatch(/CREATE TRIGGER/)
    expect(withoutWarningMessages(sql)).not.toMatch(/CREATE POLICY/i)
  })
})

describe('migrations posteriores ao hardening', () => {
  const later = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && f > HARDENING_FILE)
    .sort()

  // O EXECUTE para PUBLIC é default GLOBAL do Postgres e não pode ser revogado por schema:
  // toda função nova precisa de REVOKE explícito na própria migration.
  it.each(later.length ? later : ['(nenhuma)'])('%s revoga EXECUTE das funções novas e não reabre anon', (file) => {
    if (file === '(nenhuma)') return
    const sql = normalizeSql(readMigration(file))

    expect(sql).not.toMatch(/TO anon USING \(true\)/i)
    expect(sql).not.toMatch(/GRANT [A-Z, ]+ ON [^;]* TO (anon|authenticated)\b/i)

    const functions = Array.from(
      sql.matchAll(/CREATE (?:OR REPLACE )?FUNCTION public\.([a-zA-Z0-9_]+)\s*\(/gi)
    ).map((m) => m[1])
    for (const fn of functions) {
      const revoke = new RegExp(`REVOKE (?:ALL|EXECUTE) ON FUNCTION public\\.${fn}\\b[^;]*FROM PUBLIC`, 'i')
      const blanket = /REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC/i
      expect(revoke.test(sql) || blanket.test(sql), `${file}: public.${fn} sem REVOKE ... FROM PUBLIC`).toBe(true)
    }
  })
})
