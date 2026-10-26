import { z } from 'zod'
import { generateFlowJsonFromFormSpec, normalizeFlowFormSpec } from '@/lib/flow-form'

// ============================================================================
// ZOD SCHEMAS - Validação de dados do Flow Dinâmico
// ============================================================================

/** Schema para opção de serviço (dropdown) */
export const BookingServiceSchema = z.object({
  id: z.string().min(1, 'ID do serviço é obrigatório'),
  title: z.string().min(1, 'Título do serviço é obrigatório'),
  durationMinutes: z.number().positive().optional(),
})

/** Schema para array de serviços */
export const BookingServicesArraySchema = z
  .array(BookingServiceSchema)
  .min(1, 'Pelo menos um serviço é obrigatório')

/** Valida serviços e retorna resultado tipado */
export function validateBookingServices(
  services: unknown,
): { success: true; data: BookingServiceOption[] } | { success: false; error: string } {
  const result = BookingServicesArraySchema.safeParse(services)
  if (!result.success) {
    const firstIssue = result.error.issues[0]
    return { success: false, error: firstIssue?.message || 'Serviços inválidos' }
  }
  return { success: true, data: result.data }
}

export type BookingDateComponent = 'calendar' | 'dropdown'

export type BookingServiceOption = z.infer<typeof BookingServiceSchema>

type DynamicFlowComponent = Record<string, unknown>

export type DynamicFlowActionType = 'data_exchange' | 'navigate' | 'complete'

export type DynamicFlowBranchOpV1 =
  | 'is_filled'
  | 'is_empty'
  | 'equals'
  | 'contains'
  | 'gt'
  | 'lt'
  | 'is_true'
  | 'is_false'

export type DynamicFlowBranchRuleV1 = {
  /** nome do campo do form (ex: `customer_name`) */
  field: string
  op: DynamicFlowBranchOpV1
  /** quando o operador exigir */
  value?: string | number | boolean | null
  /** null = Concluir */
  next: string | null
}

export type DynamicFlowActionV1 = {
  type: DynamicFlowActionType
  payload?: Record<string, unknown>
  /** usado quando o tipo for navigate */
  screen?: string
  label?: string
}

export type DynamicFlowScreenV1 = {
  id: string
  title: string
  terminal?: boolean
  data?: Record<string, unknown>
  components: DynamicFlowComponent[]
  action?: DynamicFlowActionV1
}

export type BookingFlowConfigV1 = {
  version: 1
  start: {
    title: string
    subtitle: string
    serviceLabel: string
    dateLabel: string
    ctaLabel: string
  }
  time: {
    title: string
    subtitle: string
    timeLabel: string
    ctaLabel: string
  }
  customer: {
    title: string
    subtitle: string
    nameLabel: string
    phoneLabel: string
    notesLabel: string
    ctaLabel: string
  }
  success: {
    title: string
    heading: string
    message: string
    closeLabel: string
  }
  services: BookingServiceOption[]
  dateComponent: BookingDateComponent
  routingModel?: Record<string, string[]>
}

export type DynamicFlowSpecV1 = {
  version: 1
  screens: DynamicFlowScreenV1[]
  routingModel: Record<string, string[]>
  /** destino “padrão” do botão principal por tela (null = Concluir) */
  defaultNextByScreen: Record<string, string | null>
  /** ramificações por tela */
  branchesByScreen: Record<string, DynamicFlowBranchRuleV1[]>
  /** campos de apoio para templates de agendamento */
  services?: BookingServiceOption[]
  dateComponent?: BookingDateComponent
}

function injectEditorKeysIntoTree(screenId: string, components: DynamicFlowComponent[]): DynamicFlowComponent[] {
  const walk = (node: DynamicFlowComponent, path: string[]): DynamicFlowComponent => {
    const comp: any = { ...(node as any) }
    const stableId = typeof comp.__builder_id === 'string' && comp.__builder_id.trim() ? comp.__builder_id.trim() : path.join('.')
    const keyBase = `screen:${screenId}:${stableId}`

    // Normaliza `__editor_key` para um formato único (screen:*), inclusive para flows legados (ex: booking).
    if (comp.type === 'Footer') {
      comp.__editor_key = `screen:${screenId}:cta`
    } else if (typeof comp.text === 'string' && String(comp.type || '').startsWith('Text')) {
      comp.__editor_key = `${keyBase}:text`
    } else if (typeof comp.label === 'string') {
      comp.__editor_key = `${keyBase}:label`
    } else if (comp.type === 'OptIn' && typeof comp.text === 'string') {
      comp.__editor_key = `${keyBase}:text`
    }

    if (Array.isArray(comp.children)) {
      comp.children = comp.children.map((child: any, idx: number) => {
        if (!child || typeof child !== 'object') return child
        return walk(child as DynamicFlowComponent, [...path, 'children', String(idx)])
      })
    }
    return comp as DynamicFlowComponent
  }

  return (components || []).map((c, idx) => {
    if (!c || typeof c !== 'object') return c
    return walk(c, [String(idx)])
  })
}

const DEFAULT_BOOKING_CONFIG: BookingFlowConfigV1 = {
  version: 1,
  start: {
    title: 'Agendar Atendimento',
    subtitle: 'Escolha o tipo de atendimento e a data desejada',
    serviceLabel: 'Tipo de Atendimento',
    dateLabel: 'Data',
    ctaLabel: 'Ver Horários',
  },
  time: {
    title: 'Escolha o Horário',
    subtitle: 'Horários disponíveis',
    timeLabel: 'Horário',
    ctaLabel: 'Continuar',
  },
  customer: {
    title: 'Seus Dados',
    subtitle: 'Preencha seus dados',
    nameLabel: 'Seu Nome',
    phoneLabel: 'Telefone (opcional)',
    notesLabel: 'Observações (opcional)',
    ctaLabel: 'Confirmar Agendamento',
  },
  success: {
    title: 'Confirmado!',
    heading: 'Agendamento Confirmado',
    message: 'Agendamento confirmado!',
    closeLabel: 'Fechar',
  },
  services: [
    { id: 'consulta', title: 'Consulta' },
    { id: 'visita', title: 'Visita' },
    { id: 'suporte', title: 'Suporte' },
  ],
  dateComponent: 'calendar',
  routingModel: {
    BOOKING_START: ['SELECT_TIME'],
    SELECT_TIME: ['CUSTOMER_INFO'],
    CUSTOMER_INFO: ['SUCCESS'],
    SUCCESS: [],
  },
}

export function getDefaultBookingFlowConfig(): BookingFlowConfigV1 {
  return DEFAULT_BOOKING_CONFIG
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function safeString(input: unknown, fallback: string): string {
  return typeof input === 'string' ? input.trim() : fallback
}

function normalizeBranchOp(input: unknown): DynamicFlowBranchOpV1 {
  const raw = safeString(input, '')
  const allowed: DynamicFlowBranchOpV1[] = ['is_filled', 'is_empty', 'equals', 'contains', 'gt', 'lt', 'is_true', 'is_false']
  return allowed.includes(raw as any) ? (raw as DynamicFlowBranchOpV1) : 'equals'
}

function normalizeBranchesByScreen(input: unknown): Record<string, DynamicFlowBranchRuleV1[]> {
  if (!isPlainObject(input)) return {}
  const out: Record<string, DynamicFlowBranchRuleV1[]> = {}
  for (const [screenId, raw] of Object.entries(input)) {
    if (!Array.isArray(raw)) continue
    const rules = raw
      .map((r) => {
        if (!r || typeof r !== 'object') return null
        const field = safeString((r as any).field, '')
        const op = normalizeBranchOp((r as any).op)
        const nextRaw = (r as any).next
        const next = typeof nextRaw === 'string' ? safeString(nextRaw, '') || null : nextRaw === null ? null : null
        const value = (r as any).value
        return {
          field,
          op,
          ...(value !== undefined ? { value } : {}),
          next,
        } as DynamicFlowBranchRuleV1
      })
      .filter(Boolean) as DynamicFlowBranchRuleV1[]
    if (rules.length) out[String(screenId)] = rules
  }
  return out
}

function buildRoutingModelFromPaths(input: {
  screenIds: string[]
  defaultNextByScreen: Record<string, string | null>
  branchesByScreen: Record<string, DynamicFlowBranchRuleV1[]>
}): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const id of input.screenIds) {
    const nexts = new Set<string>()
    const d = input.defaultNextByScreen[id]
    if (typeof d === 'string' && d) nexts.add(d)
    const rules = input.branchesByScreen[id] || []
    for (const r of rules) {
      if (typeof r?.next === 'string' && r.next) nexts.add(r.next)
    }
    out[id] = Array.from(nexts)
  }
  return out
}

function normalizeScreenId(input: unknown, fallback: string): string {
  const raw = safeString(input, fallback).toUpperCase()
  const cleaned = raw.replace(/[^A-Z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '')
  return cleaned || fallback
}

function indexToLetters(index: number): string {
  // 0 -> A, 25 -> Z, 26 -> AA ...
  let n = Math.max(0, Math.floor(index))
  let out = ''
  do {
    const r = n % 26
    out = String.fromCharCode(65 + r) + out
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return out || 'A'
}

function makeMetaSafeScreenIdFromLegacy(legacyId: string, indexHint: number): string {
  const raw = safeString(legacyId, `SCREEN_${indexToLetters(indexHint)}`).toUpperCase()

  // Migra o padrão legado SCREEN_1/2/3... para SCREEN_A/B/C...
  const m = raw.match(/^SCREEN_(\d+)$/)
  if (m?.[1]) {
    const num = Number.parseInt(m[1], 10)
    if (Number.isFinite(num) && num > 0) return `SCREEN_${indexToLetters(num - 1)}`
  }

  // Mantém apenas letras e underscore (sem dígitos).
  const cleaned = raw.replace(/[^A-Z_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '')
  if (!cleaned || !/^[A-Z]/.test(cleaned)) return `SCREEN_${indexToLetters(indexHint)}`
  return cleaned
}

function ensureUniqueMetaId(base: string, used: Set<string>): string {
  if (!used.has(base)) return base
  for (let i = 0; i < 2000; i++) {
    const candidate = `${base}_${indexToLetters(i)}`
    if (!used.has(candidate)) return candidate
  }
  return `${base}_${indexToLetters(0)}`
}

function normalizeComponents(input: unknown): DynamicFlowComponent[] {
  if (!Array.isArray(input)) return []
  return input.filter((item) => item && typeof item === 'object') as DynamicFlowComponent[]
}

function normalizeTextForCompare(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '')
}

function resolveDataBindingTextForCompare(raw: unknown, data: Record<string, unknown> | undefined): string {
  const text = typeof raw === 'string' ? raw : ''
  const match = text.match(/^\$\{data\.([a-zA-Z0-9_]+)\}$/)
  const key = match?.[1]
  if (!key || !data || typeof data !== 'object') return text
  const entry = (data as any)[key]
  if (entry && typeof entry === 'object' && '__example__' in entry) {
    const value = (entry as any).__example__
    return value != null ? String(value) : text
  }
  return text
}

function dedupeSuccessTextBlocks(
  components: DynamicFlowComponent[],
  data: Record<string, unknown> | undefined,
): DynamicFlowComponent[] {
  // #region agent log
  // #endregion
  const headingIdx = components.findIndex((c: any) => String(c?.type || '') === 'TextHeading')
  const bodyIdx = components.findIndex((c: any) => String(c?.type || '') === 'TextBody')
  if (headingIdx < 0 || bodyIdx < 0) {
    // #region agent log
    // #endregion
    return components
  }
  const heading = resolveDataBindingTextForCompare((components[headingIdx] as any)?.text, data)
  const body = resolveDataBindingTextForCompare((components[bodyIdx] as any)?.text, data)
  // #region agent log
  // #endregion
  if (!heading || !body) return components
  const same = normalizeTextForCompare(heading) === normalizeTextForCompare(body)
  if (!same) return components
  // #region agent log
  // #endregion
  return components.filter((_, idx) => idx !== headingIdx)
}

function extractFieldNamesFromComponents(components: DynamicFlowComponent[]): string[] {
  const out: string[] = []
  const supported = new Set([
    'TextInput',
    'TextArea',
    'Dropdown',
    'RadioButtonsGroup',
    'CheckboxGroup',
    'DatePicker',
    'CalendarPicker',
    'OptIn',
  ])
  const walk = (nodes: DynamicFlowComponent[]) => {
    for (const node of nodes || []) {
      if (!node || typeof node !== 'object') continue
      const type = safeString((node as any).type, '')
      const name = safeString((node as any).name, '')
      if (name && supported.has(type)) out.push(name)
      const children = Array.isArray((node as any).children) ? ((node as any).children as DynamicFlowComponent[]) : null
      if (children?.length) walk(children)
    }
  }
  walk(components || [])
  return out
}

function normalizeAction(input: unknown): DynamicFlowActionV1 | undefined {
  if (!isPlainObject(input)) return undefined
  const rawType = safeString(input.type, '')
  const allowed: DynamicFlowActionType[] = ['data_exchange', 'navigate', 'complete']
  const type: DynamicFlowActionType = allowed.includes(rawType as DynamicFlowActionType)
    ? (rawType as DynamicFlowActionType)
    : 'navigate'
  // `payload` só é inválido para `navigate` (quebra publish na Meta).
  const payload = type !== 'navigate' && isPlainObject(input.payload) ? (input.payload as Record<string, unknown>) : undefined
  const screen = safeString(input.screen, '')
  const label = typeof input.label === 'string' ? input.label : ''
  return {
    type,
    ...(payload ? { payload } : {}),
    ...(screen ? { screen } : {}),
    ...(label ? { label } : {}),
  }
}

function normalizeServices(input: unknown): BookingServiceOption[] {
  if (!Array.isArray(input)) {
    // Silencia warning durante build (SSG) - input undefined é esperado
    if (typeof window !== 'undefined' || process.env.VERCEL_ENV) {
      console.warn('[normalizeServices] Input não é array, usando serviços padrão')
    }
    return DEFAULT_BOOKING_CONFIG.services
  }
  
  // Tenta validar com Zod primeiro
  const zodResult = BookingServicesArraySchema.safeParse(input)
  if (zodResult.success) {
    return zodResult.data
  }
  
  // Fallback: normaliza manualmente
  const sanitized = input
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const raw = item as BookingServiceOption
      const id = safeString(raw.id, '')
      const title = safeString(raw.title, '')
      if (!id || !title) return null
      return { id, title }
    })
    .filter(Boolean) as BookingServiceOption[]
  
  if (!sanitized.length) {
    console.warn('[normalizeServices] Nenhum serviço válido encontrado, usando padrão')
    return DEFAULT_BOOKING_CONFIG.services
  }
  
  return sanitized
}

export function normalizeBookingFlowConfig(input?: Partial<BookingFlowConfigV1>): BookingFlowConfigV1 {
  return {
    version: 1,
    start: {
      title: safeString(input?.start?.title, DEFAULT_BOOKING_CONFIG.start.title),
      subtitle: safeString(input?.start?.subtitle, DEFAULT_BOOKING_CONFIG.start.subtitle),
      serviceLabel: safeString(input?.start?.serviceLabel, DEFAULT_BOOKING_CONFIG.start.serviceLabel),
      dateLabel: safeString(input?.start?.dateLabel, DEFAULT_BOOKING_CONFIG.start.dateLabel),
      ctaLabel: safeString(input?.start?.ctaLabel, DEFAULT_BOOKING_CONFIG.start.ctaLabel),
    },
    time: {
      title: safeString(input?.time?.title, DEFAULT_BOOKING_CONFIG.time.title),
      subtitle: safeString(input?.time?.subtitle, DEFAULT_BOOKING_CONFIG.time.subtitle),
      timeLabel: safeString(input?.time?.timeLabel, DEFAULT_BOOKING_CONFIG.time.timeLabel),
      ctaLabel: safeString(input?.time?.ctaLabel, DEFAULT_BOOKING_CONFIG.time.ctaLabel),
    },
    customer: {
      title: safeString(input?.customer?.title, DEFAULT_BOOKING_CONFIG.customer.title),
      subtitle: safeString(input?.customer?.subtitle, DEFAULT_BOOKING_CONFIG.customer.subtitle),
      nameLabel: safeString(input?.customer?.nameLabel, DEFAULT_BOOKING_CONFIG.customer.nameLabel),
      phoneLabel: safeString(input?.customer?.phoneLabel, DEFAULT_BOOKING_CONFIG.customer.phoneLabel),
      notesLabel: safeString(input?.customer?.notesLabel, DEFAULT_BOOKING_CONFIG.customer.notesLabel),
      ctaLabel: safeString(input?.customer?.ctaLabel, DEFAULT_BOOKING_CONFIG.customer.ctaLabel),
    },
    success: {
      title: safeString(input?.success?.title, DEFAULT_BOOKING_CONFIG.success.title),
      heading: safeString(input?.success?.heading, DEFAULT_BOOKING_CONFIG.success.heading),
      message: safeString(input?.success?.message, DEFAULT_BOOKING_CONFIG.success.message),
      closeLabel: safeString(input?.success?.closeLabel, DEFAULT_BOOKING_CONFIG.success.closeLabel),
    },
    services: normalizeServices(input?.services),
    dateComponent: input?.dateComponent === 'dropdown' ? 'dropdown' : 'calendar',
    routingModel: input?.routingModel || DEFAULT_BOOKING_CONFIG.routingModel,
  }
}

export function normalizeDynamicFlowSpec(input?: Partial<DynamicFlowSpecV1>, fallbackTitle?: string): DynamicFlowSpecV1 {
  const baseTitle = (fallbackTitle || 'Flow dinâmico').trim() || 'Flow dinâmico'
  const rawScreens = Array.isArray(input?.screens) ? input?.screens : []
  let screens: DynamicFlowScreenV1[] = rawScreens
    .map((screen, idx) => {
      if (!screen || typeof screen !== 'object') return null
      const id = normalizeScreenId((screen as any).id, `SCREEN_${idx + 1}`)
      const title = safeString((screen as any).title, `${baseTitle} ${idx + 1}`).trim() || `${baseTitle} ${idx + 1}`
      const terminal = typeof (screen as any).terminal === 'boolean' ? (screen as any).terminal : false
      const data = isPlainObject((screen as any).data) ? ((screen as any).data as Record<string, unknown>) : undefined
      let components = normalizeComponents((screen as any).components)
      // #region agent log
      // #endregion
      if ((screen as any).success === true) {
        components = dedupeSuccessTextBlocks(components, data)
        // #region agent log
        // #endregion
      }
      const action = normalizeAction((screen as any).action)
      return {
        id,
        title,
        terminal,
        ...(data ? { data } : {}),
        components,
        ...(action ? { action } : {}),
      }
    })
    .filter(Boolean) as DynamicFlowScreenV1[]

  if (screens.length === 0) {
    screens.push({
      id: 'SCREEN_1',
      title: baseTitle,
      terminal: true,
      components: [{ type: 'TextBody', text: 'Nova tela dinâmica' }],
      action: { type: 'complete' },
    })
  }

  // A Meta impõe: IDs do routing_model só podem conter letras e underscore.
  // Normalizamos IDs aqui (o usuário não vê IDs) para evitar publish quebrado.
  const usedMetaIds = new Set<string>()
  const idMap = new Map<string, string>()
  for (const [idx, s] of screens.entries()) {
    const base = makeMetaSafeScreenIdFromLegacy(s.id, idx)
    const unique = ensureUniqueMetaId(base, usedMetaIds)
    usedMetaIds.add(unique)
    idMap.set(s.id, unique)
  }

  const remapId = (id: unknown): string | null => {
    const raw = safeString(id, '')
    if (!raw) return null
    return idMap.get(raw) || raw
  }

  screens = screens.map((s) => {
    const nextId = idMap.get(s.id) || s.id
    const action =
      s.action?.type === 'navigate' && s.action.screen
        ? {
            ...s.action,
            screen: remapId(s.action.screen) || s.action.screen,
          }
        : s.action
    return { ...s, id: nextId, ...(action ? { action } : {}) }
  })

  const routingModelInput = isPlainObject(input?.routingModel) ? (input?.routingModel as Record<string, string[]>) : null
  const routingModel = routingModelInput
    ? Object.entries(routingModelInput).reduce<Record<string, string[]>>((acc, [k, arr]) => {
        const key = remapId(k)
        if (!key) return acc
        const nexts = Array.isArray(arr) ? arr.map((x) => remapId(x)).filter(Boolean) : []
        acc[key] = nexts as string[]
        return acc
      }, {})
    : screens.reduce<Record<string, string[]>>((acc, screen, idx) => {
        acc[screen.id] = idx < screens.length - 1 ? [screens[idx + 1].id] : []
        return acc
      }, {})

  const defaultNextByScreenInput = isPlainObject((input as any)?.defaultNextByScreen)
    ? (((input as any).defaultNextByScreen || {}) as Record<string, string | null>)
    : screens.reduce<Record<string, string | null>>((acc, screen) => {
        const next = routingModel?.[screen.id]?.[0]
        acc[screen.id] = typeof next === 'string' && next ? next : null
        return acc
      }, {})

  const defaultNextByScreen = Object.entries(defaultNextByScreenInput).reduce<Record<string, string | null>>((acc, [k, v]) => {
    const key = remapId(k)
    if (!key) return acc
    acc[key] = v === null ? null : remapId(v) || null
    return acc
  }, {})

  const branchesByScreenInput = normalizeBranchesByScreen((input as any)?.branchesByScreen)
  const branchesByScreen = Object.entries(branchesByScreenInput).reduce<Record<string, DynamicFlowBranchRuleV1[]>>(
    (acc, [k, rules]) => {
      const key = remapId(k)
      if (!key) return acc
      const nextRules = (Array.isArray(rules) ? rules : []).map((r) => {
        if (!r || typeof r !== 'object') return r
        const next = r.next === null ? null : remapId(r.next)
        return { ...r, ...(next !== undefined ? { next } : {}) }
      })
      acc[key] = nextRules as DynamicFlowBranchRuleV1[]
      return acc
    },
    {}
  )

  const computedRoutingModel = buildRoutingModelFromPaths({
    screenIds: screens.map((s) => s.id),
    defaultNextByScreen: screens.reduce<Record<string, string | null>>((acc, s) => {
      acc[s.id] = s.id in defaultNextByScreen ? defaultNextByScreen[s.id] : null
      return acc
    }, {}),
    branchesByScreen,
  })

  return {
    version: 1,
    screens,
    routingModel: computedRoutingModel,
    defaultNextByScreen: screens.reduce<Record<string, string | null>>((acc, s) => {
      acc[s.id] = s.id in defaultNextByScreen ? defaultNextByScreen[s.id] : null
      return acc
    }, {}),
    branchesByScreen,
    services: input?.services ? normalizeServices(input?.services) : undefined,
    dateComponent:
      input?.dateComponent === 'dropdown' ? 'dropdown' : input?.dateComponent === 'calendar' ? 'calendar' : undefined,
  }
}

function findFooterInTree(components: DynamicFlowComponent[]): DynamicFlowComponent | null {
  for (const comp of components) {
    if (!comp || typeof comp !== 'object') continue
    if ((comp as any).type === 'Footer') return comp
    const children = Array.isArray((comp as any).children) ? ((comp as any).children as DynamicFlowComponent[]) : null
    if (children && children.length) {
      const nested = findFooterInTree(children)
      if (nested) return nested
    }
  }
  return null
}

function extractFooterAction(components: DynamicFlowComponent[]): DynamicFlowActionV1 | undefined {
  const footer = findFooterInTree(components)
  if (!footer) return undefined
  const action = isPlainObject((footer as any)['on-click-action']) ? ((footer as any)['on-click-action'] as Record<string, unknown>) : null
  if (!action) return undefined
  const type = safeString(action.name, '') as DynamicFlowActionType
  const allowed: DynamicFlowActionType[] = ['data_exchange', 'navigate', 'complete']
  if (!allowed.includes(type)) return undefined
  const payload = isPlainObject(action.payload) ? (action.payload as Record<string, unknown>) : undefined
  const next = isPlainObject((action as any).next) ? ((action as any).next as Record<string, unknown>) : undefined
  const screen =
    type === 'navigate'
      ? next && next.type === 'screen' && typeof next.name === 'string'
        ? String(next.name)
        : payload && typeof (payload as any).screen === 'string'
          ? String((payload as any).screen)
          : undefined
      : undefined
  const label = typeof (footer as any).label === 'string' ? String((footer as any).label).trim() : ''
  if (typeof (footer as any).label === 'string') {
    const rawLabel = String((footer as any).label)
    const trimmed = rawLabel.trim()
    // #region agent log
    // #endregion
  }
  return {
    type,
    ...(payload ? { payload } : {}),
    ...(screen ? { screen } : {}),
    ...(label ? { label } : {}),
  }
}

function buildFooterComponent(action?: DynamicFlowActionV1): DynamicFlowComponent | null {
  if (!action) return null
  const payload = action.payload ? { ...action.payload } : {}
  const next =
    action.type === 'navigate' && action.screen
      ? {
          type: 'screen',
          name: action.screen,
        }
      : undefined
  return {
    type: 'Footer',
    label: action.label || 'Continuar',
    'on-click-action': {
      name: action.type,
      ...(next ? { next } : {}),
      ...(Object.keys(payload).length ? { payload } : {}),
    },
  }
}

function applyFooterAction(components: DynamicFlowComponent[], action?: DynamicFlowActionV1): DynamicFlowComponent[] {
  if (!action) return components
  const next = [...components]

  // Prefer colocar o Footer dentro do primeiro Form (mais parecido com o builder da Meta).
  const formIndex = next.findIndex((c) => c && typeof c === 'object' && (c as any).type === 'Form' && Array.isArray((c as any).children))
  if (formIndex >= 0) {
    const form = { ...(next[formIndex] as any) }
    const formChildren: DynamicFlowComponent[] = Array.isArray(form.children) ? [...form.children] : []

    const footerIndexInForm = formChildren.findIndex((child) => child?.type === 'Footer')
    const footerInForm = footerIndexInForm >= 0 ? { ...formChildren[footerIndexInForm] } : buildFooterComponent(action)
    if (!footerInForm) return next

    const payload = action.payload ? { ...action.payload } : {}
    const nextTarget =
      action.type === 'navigate' && action.screen
        ? {
            type: 'screen',
            name: action.screen,
          }
        : undefined
    footerInForm.label = action.label || footerInForm.label || 'Continuar'
    footerInForm['on-click-action'] = {
      name: action.type,
      ...(nextTarget ? { next: nextTarget } : {}),
      ...(Object.keys(payload).length ? { payload } : {}),
    }

    if (footerIndexInForm >= 0) {
      formChildren[footerIndexInForm] = footerInForm
    } else {
      formChildren.push(footerInForm)
    }

    // Remove qualquer footer no root para evitar duplicidade.
    const rootWithoutFooter = next.filter((c) => c?.type !== 'Footer')
    const replaced = [...rootWithoutFooter]
    const newFormIndex = replaced.findIndex((c) => c && typeof c === 'object' && (c as any).type === 'Form')
    if (newFormIndex >= 0) {
      replaced[newFormIndex] = { ...form, children: formChildren }
      return replaced
    }
    return [...replaced, { ...form, children: formChildren }]
  }

  const footerIndex = next.findIndex((child) => child?.type === 'Footer')
  const footer = footerIndex >= 0 ? { ...next[footerIndex] } : buildFooterComponent(action)
  if (!footer) return next

  const payload = action.payload ? { ...action.payload } : {}
  const nextTarget =
    action.type === 'navigate' && action.screen
      ? {
          type: 'screen',
          name: action.screen,
        }
      : undefined
  footer.label = action.label || footer.label || 'Continuar'
  footer['on-click-action'] = {
    name: action.type,
    ...(nextTarget ? { next: nextTarget } : {}),
    ...(Object.keys(payload).length ? { payload } : {}),
  }

  if (footerIndex >= 0) {
    next[footerIndex] = footer
    return next
  }
  return [...next, footer]
}

export function dynamicFlowSpecFromJson(flowJson: Record<string, unknown>): DynamicFlowSpecV1 {
  const base = normalizeDynamicFlowSpec({}, 'Flow dinâmico')
  if (!flowJson || typeof flowJson !== 'object') return base
  const screensRaw = Array.isArray((flowJson as any).screens) ? (flowJson as any).screens : []
  const screens: DynamicFlowScreenV1[] = screensRaw
    .map((screen: any, idx: number) => {
      if (!screen || typeof screen !== 'object') return null
      const layout = isPlainObject(screen.layout) ? screen.layout : null
      const components = normalizeComponents(layout?.children)
      const action = extractFooterAction(components)
      return {
        id: normalizeScreenId(screen.id, `SCREEN_${idx + 1}`),
        title: safeString(screen.title, `Tela ${idx + 1}`) || `Tela ${idx + 1}`,
        terminal: typeof screen.terminal === 'boolean' ? screen.terminal : false,
        data: isPlainObject(screen.data) ? (screen.data as Record<string, unknown>) : undefined,
        components,
        ...(action ? { action } : {}),
      }
    })
    .filter(Boolean) as DynamicFlowScreenV1[]

  const routingModel = isPlainObject((flowJson as any).routing_model)
    ? ((flowJson as any).routing_model as Record<string, string[]>)
    : base.routingModel

  return normalizeDynamicFlowSpec({
    version: 1,
    screens,
    routingModel,
  })
}

export function generateDynamicFlowJson(input: DynamicFlowSpecV1): Record<string, unknown> {
  const spec = normalizeDynamicFlowSpec(input)
  const usesDataExchange = spec.screens.some((s) => s?.action?.type === 'data_exchange')
  const usesBranching = Object.values(spec.branchesByScreen || {}).some((arr) => Array.isArray(arr) && arr.length > 0)
  const allFieldNames = Array.from(new Set(spec.screens.flatMap((s) => extractFieldNamesFromComponents(s.components || [])))).slice(
    0,
    200,
  )
  return {
    version: '7.3',
    ...((usesDataExchange || usesBranching) ? { data_api_version: '3.0' } : {}),
    ...((usesDataExchange || usesBranching) ? { routing_model: spec.routingModel } : {}),
    screens: spec.screens.map((screen) => {
      const baseComponents = screen.components || []
      const screenFieldNames = extractFieldNamesFromComponents(baseComponents).slice(0, 200)
      const computedNext =
        screen.action?.type === 'navigate'
          ? screen.action.screen ||
            (typeof spec.defaultNextByScreen?.[screen.id] === 'string' ? spec.defaultNextByScreen[screen.id] || undefined : undefined) ||
            spec.routingModel?.[screen.id]?.[0] ||
            undefined
          : undefined
      let action: DynamicFlowActionV1 | undefined =
        screen.action?.type === 'navigate' ? { ...screen.action, ...(computedNext ? { screen: computedNext } : {}) } : screen.action

      // Para fluxos "form-like": `navigate` deve carregar somente os campos DA TELA (igual o FlowForm multi-etapas),
      // evitando payload com chaves que não existem naquela tela (Meta rejeita).
      if (action?.type === 'navigate') {
        const payload: Record<string, string> = {}
        for (const n of screenFieldNames) payload[n] = `\${form.${n}}`
        action = {
          ...action,
          ...(Object.keys(payload).length ? { payload } : {}),
        }
      }

      // UX: respostas + confirmação dependem do payload no `complete`.
      // A Meta rejeita payload em `navigate`, mas aceita em `complete`/`data_exchange`.
      // IMPORTANTE: ${form.*} só funciona para campos DA MESMA TELA. Campos de telas anteriores
      // são passados via data_exchange e estão disponíveis como ${data.*}.
      const isComplete = action?.type === 'complete' || !!screen.terminal
      if (isComplete) {
        const extra =
          action?.payload && isPlainObject(action.payload) ? (action.payload as Record<string, unknown>) : {}
        
        // Usa apenas campos que existem NESTA tela para ${form.*}
        // Campos de outras telas já chegaram via data_exchange e estão em ${data.*}
        const thisScreenFieldNames = screenFieldNames
        const selectedFromConfig = Array.isArray((extra as any).confirmation_fields)
          ? ((extra as any).confirmation_fields as unknown[])
              .filter((x) => typeof x === 'string')
              .map((x) => String(x).trim())
              .filter(Boolean)
          : null
        const selectedFieldNames =
          selectedFromConfig && selectedFromConfig.length
            ? selectedFromConfig.filter((n) => thisScreenFieldNames.includes(n))
            : thisScreenFieldNames

        const baseCompletePayload: Record<string, string> = {}
        for (const n of selectedFieldNames) baseCompletePayload[n] = `\${form.${n}}`
        const mergedPayload: Record<string, unknown> = { ...baseCompletePayload, ...extra }
        action = {
          type: 'complete',
          label: action?.label || screen.action?.label || 'Concluir',
          ...(Object.keys(mergedPayload).length ? { payload: mergedPayload } : {}),
        }
      }
      const children = injectEditorKeysIntoTree(screen.id, applyFooterAction(baseComponents, action))
      return {
        id: screen.id,
        title: screen.title,
        __editor_title_key: `screen:${screen.id}:title`,
        terminal: !!screen.terminal,
        ...(screen.data ? { data: screen.data } : {}),
        layout: {
          type: 'SingleColumnLayout',
          children,
        },
      }
    }),
  }
}

export function generateBookingDynamicFlowJson(configInput?: Partial<BookingFlowConfigV1>): Record<string, unknown> {
  const config = normalizeBookingFlowConfig(configInput)
  const routing_model = config.routingModel || DEFAULT_BOOKING_CONFIG.routingModel

  const dateComponent =
    config.dateComponent === 'dropdown'
      ? {
          type: 'Dropdown',
          name: 'selected_date',
          label: config.start.dateLabel,
          __editor_key: 'start.dateLabel',
          required: true,
          'data-source': '${data.dates}',
        }
      : {
          type: 'CalendarPicker',
          name: 'selected_date',
          label: config.start.dateLabel,
          __editor_key: 'start.dateLabel',
          required: true,
          mode: 'single',
          'min-date': '${data.min_date}',
          'max-date': '${data.max_date}',
          'include-days': '${data.include_days}',
          'unavailable-dates': '${data.unavailable_dates}',
        }

  return {
    version: '7.3',
    data_api_version: '3.0',
    routing_model,
    screens: [
      {
        id: 'BOOKING_START',
        title: '${data.title}',
        __editor_title_key: 'start.title',
        data: {
          title: { type: 'string', __example__: config.start.title },
          subtitle: { type: 'string', __example__: config.start.subtitle },
          services: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
              },
            },
            __example__: config.services,
          },
          dates: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
              },
            },
            __example__: [{ id: '2026-01-15', title: '15/01/2026' }],
          },
          min_date: { type: 'string', __example__: '2026-01-15' },
          max_date: { type: 'string', __example__: '2026-01-22' },
          include_days: { type: 'array', items: { type: 'string' }, __example__: ['Mon', 'Tue'] },
          unavailable_dates: { type: 'array', items: { type: 'string' }, __example__: [] },
          error_message: { type: 'string', __example__: 'Nenhum horário disponível para esta data. Escolha outra data.' },
          has_error: { type: 'boolean', __example__: false },
        },
        layout: {
          type: 'SingleColumnLayout',
          children: [
            {
              type: 'Form',
              name: 'booking_form',
              children: [
                { type: 'TextSubheading', text: '${data.subtitle}', __editor_key: 'start.subtitle' },
                {
                  type: 'Dropdown',
                  name: 'selected_service',
                  label: config.start.serviceLabel,
                  __editor_key: 'start.serviceLabel',
                  required: true,
                  'data-source': '${data.services}',
                },
                dateComponent,
                { type: 'TextCaption', text: '${data.error_message}', visible: '${data.has_error}', __editor_label: 'Mensagem de erro (quando não houver horários)' },
                {
                  type: 'Footer',
                  label: config.start.ctaLabel,
                  __editor_key: 'start.ctaLabel',
                  'on-click-action': {
                    name: 'data_exchange',
                    payload: {
                      selected_service: '${form.selected_service}',
                      selected_date: '${form.selected_date}',
                    },
                  },
                },
              ],
            },
          ],
        },
      },
      {
        id: 'SELECT_TIME',
        title: '${data.title}',
        __editor_title_key: 'time.title',
        refresh_on_back: true,
        data: {
          title: { type: 'string', __example__: config.time.title },
          subtitle: { type: 'string', __example__: config.time.subtitle },
          selected_service: { type: 'string', __example__: 'consulta' },
          selected_date: { type: 'string', __example__: '2026-01-15' },
          slots: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
              },
            },
            __example__: [{ id: '2026-01-15T09:00:00Z', title: '09:00' }],
          },
        },
        layout: {
          type: 'SingleColumnLayout',
          children: [
            {
              type: 'Form',
              name: 'time_form',
              children: [
                { type: 'TextSubheading', text: '${data.subtitle}', __editor_key: 'time.subtitle' },
                {
                  type: 'Dropdown',
                  name: 'selected_slot',
                  label: config.time.timeLabel,
                  __editor_key: 'time.timeLabel',
                  required: true,
                  'data-source': '${data.slots}',
                },
                {
                  type: 'Footer',
                  label: config.time.ctaLabel,
                  __editor_key: 'time.ctaLabel',
                  'on-click-action': {
                    name: 'data_exchange',
                    payload: {
                      selected_service: '${data.selected_service}',
                      selected_date: '${data.selected_date}',
                      selected_slot: '${form.selected_slot}',
                    },
                  },
                },
              ],
            },
          ],
        },
      },
      {
        id: 'CUSTOMER_INFO',
        title: '${data.title}',
        __editor_title_key: 'customer.title',
        data: {
          title: { type: 'string', __example__: config.customer.title },
          subtitle: { type: 'string', __example__: config.customer.subtitle },
          selected_service: { type: 'string', __example__: 'consulta' },
          selected_date: { type: 'string', __example__: '2026-01-15' },
          selected_slot: { type: 'string', __example__: '2026-01-15T09:00:00Z' },
        },
        layout: {
          type: 'SingleColumnLayout',
          children: [
            {
              type: 'Form',
              name: 'customer_form',
              children: [
                { type: 'TextSubheading', text: '${data.subtitle}', __editor_key: 'customer.subtitle' },
                { type: 'TextInput', name: 'customer_name', label: config.customer.nameLabel, __editor_key: 'customer.nameLabel', required: true, 'input-type': 'text' },
                { type: 'TextInput', name: 'customer_phone', label: config.customer.phoneLabel, __editor_key: 'customer.phoneLabel', required: false, 'input-type': 'phone' },
                { type: 'TextArea', name: 'notes', label: config.customer.notesLabel, __editor_key: 'customer.notesLabel', required: false },
                {
                  type: 'Footer',
                  label: config.customer.ctaLabel,
                  __editor_key: 'customer.ctaLabel',
                  'on-click-action': {
                    name: 'data_exchange',
                    payload: {
                      selected_service: '${data.selected_service}',
                      selected_date: '${data.selected_date}',
                      selected_slot: '${data.selected_slot}',
                      customer_name: '${form.customer_name}',
                      customer_phone: '${form.customer_phone}',
                      notes: '${form.notes}',
                    },
                  },
                },
              ],
            },
          ],
        },
      },
      {
        id: 'SUCCESS',
        title: config.success.title,
        __editor_title_key: 'success.title',
        terminal: true,
        success: true,
        data: {
          message: { type: 'string', __example__: config.success.message },
          event_id: { type: 'string', __example__: 'abc123' },
        },
        layout: {
          type: 'SingleColumnLayout',
          children: (() => {
            // Apenas TextBody - heading duplicado é removido automaticamente
            const content: any[] = []
            content.push({ type: 'TextBody', text: '${data.message}', __editor_key: 'success.message' })
            content.push({
              type: 'Footer',
              label: config.success.closeLabel,
              __editor_key: 'success.closeLabel',
              'on-click-action': {
                name: 'complete',
                payload: {
                  event_id: '${data.event_id}',
                  status: 'confirmed',
                  confirmation_title: '${data.message}',
                },
              },
            })
            // #region agent log
            // #endregion
            return content
          })(),
        },
      },
    ],
  }
}

export function validateDynamicFlowSpec(spec: DynamicFlowSpecV1): string[] {
  const issues: string[] = []
  if (!spec.screens.length) {
    issues.push('Adicione pelo menos uma tela')
    return issues
  }
  const ids = new Set<string>()
  for (const screen of spec.screens) {
    if (!screen.id.trim()) issues.push('Existe uma tela sem ID')
    if (ids.has(screen.id)) issues.push(`ID de tela duplicado: ${screen.id}`)
    ids.add(screen.id)
    if (!screen.title.trim()) issues.push(`Tela ${screen.id}: titulo vazio`)
  }

  const screenIds = new Set(spec.screens.map((s) => s.id))
  for (const [screenId, rules] of Object.entries(spec.branchesByScreen || {})) {
    if (!screenIds.has(screenId)) {
      issues.push(`Caminhos: tela inexistente nas regras: ${screenId}`)
      continue
    }
    if (!Array.isArray(rules) || rules.length === 0) continue
    // fallback obrigatório (pode ser Concluir = null)
    if (!(screenId in (spec.defaultNextByScreen || {}))) {
      issues.push(`Caminhos: tela ${screenId} precisa de um destino padrão`)
    }
    for (const [idx, r] of rules.entries()) {
      const prefix = `Caminhos: ${screenId} regra ${idx + 1}`
      if (!r.field || !String(r.field).trim()) issues.push(`${prefix}: campo vazio`)
      const op = normalizeBranchOp(r.op)
      if (op !== r.op) issues.push(`${prefix}: operador inválido`)
      const requiresValue = op === 'equals' || op === 'contains' || op === 'gt' || op === 'lt'
      if (requiresValue && r.value === undefined) issues.push(`${prefix}: valor obrigatório`)
      if (r.next !== null && !screenIds.has(r.next)) issues.push(`${prefix}: destino inválido (${String(r.next)})`)
      if (typeof r.next === 'string' && r.next === screenId) issues.push(`${prefix}: destino não pode ser a própria tela`)
    }
  }
  return issues
}

/**
 * Converte um Flow “form-like” (FlowFormSpecV1) para o modelo canônico DynamicFlowSpecV1.
 * A estratégia é gerar um Flow JSON válido do form e reimportar como DynamicSpec.
 */
export function formSpecToDynamicSpec(formSpec: unknown, fallbackTitle?: string): DynamicFlowSpecV1 {
  const normalized = normalizeFlowFormSpec(formSpec as any, fallbackTitle)
  const flowJson = generateFlowJsonFromFormSpec(normalized)
  return normalizeDynamicFlowSpec(dynamicFlowSpecFromJson(flowJson as any), normalized.title || fallbackTitle)
}

/**
 * Converte config de agendamento para DynamicFlowSpecV1 (canônico).
 * Mantém `services/dateComponent` também no spec para o “assistente” do editor.
 */
export function bookingConfigToDynamicSpec(configInput?: Partial<BookingFlowConfigV1>): DynamicFlowSpecV1 {
  const config = normalizeBookingFlowConfig(configInput)
  const flowJson = generateBookingDynamicFlowJson(config)
  const spec = normalizeDynamicFlowSpec(dynamicFlowSpecFromJson(flowJson as any), config.start?.title || 'Agendamento')
  return {
    ...spec,
    services: config.services,
    dateComponent: config.dateComponent,
  }
}
