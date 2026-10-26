export type FlowJsonIssue = {
  path: string
  message: string
}

export type FlowJsonValidationResult = {
  isValid: boolean
  errors: FlowJsonIssue[]
  warnings: FlowJsonIssue[]
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string')
}

function pushIssue(list: FlowJsonIssue[], path: string, message: string) {
  list.push({ path, message })
}

const ALLOWED_COMPONENT_TYPES = new Set<string>([
  // Text
  'TextHeading',
  'TextSubheading',
  'TextBody',
  'TextCaption',
  'RichText',

  // Text Entry
  'TextInput',
  'TextArea',

  // Inputs / selection
  'CheckboxGroup',
  'RadioButtonsGroup',
  'Dropdown',
  'DatePicker',
  'CalendarPicker',
  'OptIn',

  // Other basics
  'Form',
  'Footer',
  'EmbeddedLink',
  'Image',
  'If',
  'Switch',
])

const INPUT_LIKE_COMPONENT_TYPES = new Set<string>([
  'TextInput',
  'TextArea',
  'CheckboxGroup',
  'RadioButtonsGroup',
  'Dropdown',
  'DatePicker',
  'CalendarPicker',
  'OptIn',
])

const TEXT_COMPONENT_TYPES = new Set<string>([
  'TextHeading',
  'TextSubheading',
  'TextBody',
  'TextCaption',
  'RichText',
])

const DATA_SOURCE_COMPONENT_TYPES = new Set<string>(['Dropdown', 'CheckboxGroup', 'RadioButtonsGroup'])

function validateDataSource(value: unknown, path: string, out: FlowJsonValidationResult) {
  if (typeof value === 'string') return
  if (!Array.isArray(value)) {
    pushIssue(out.errors, path, 'Esperado "data-source" como array (estático) ou string (binding dinâmico).')
    return
  }

  value.forEach((item, idx) => {
    const p = `${path}[${idx}]`
    if (!isPlainObject(item)) {
      pushIssue(out.errors, p, 'Opção inválida: esperado objeto { id, title }.')
      return
    }
    if (typeof item.id !== 'string' || !item.id.trim()) pushIssue(out.errors, `${p}.id`, 'Obrigatório')
    if (typeof item.title !== 'string' || !item.title.trim()) pushIssue(out.errors, `${p}.title`, 'Obrigatório')
  })
}

function validateComponent(component: unknown, path: string, out: FlowJsonValidationResult, ctx: {
  names: Set<string>
  footerCount: number
}): { footerCount: number } {
  if (!isPlainObject(component)) {
    pushIssue(out.errors, path, 'Componente inválido: esperado objeto.')
    return { footerCount: ctx.footerCount }
  }

  const type = typeof component.type === 'string' ? component.type : ''
  if (!type) {
    pushIssue(out.errors, `${path}.type`, 'Campo obrigatório')
    return { footerCount: ctx.footerCount }
  }

  // Ajuda para os casos que geravam o erro (100) Invalid parameter
  if (type === 'BasicText') {
    pushIssue(out.errors, `${path}.type`, 'Tipo "BasicText" não é suportado. Use "TextBody" (ou TextHeading/TextCaption).')
    return { footerCount: ctx.footerCount }
  }
  if (type === 'TextEntry') {
    pushIssue(out.errors, `${path}.type`, 'Tipo "TextEntry" não é suportado no Flow JSON. Use "TextInput" ou "TextArea".')
    return { footerCount: ctx.footerCount }
  }

  if (!ALLOWED_COMPONENT_TYPES.has(type)) {
    pushIssue(out.errors, `${path}.type`, `Tipo de componente não suportado: "${type}".`)
    return { footerCount: ctx.footerCount }
  }

  if (TEXT_COMPONENT_TYPES.has(type)) {
    const text = (component as any).text
    if (!(typeof text === 'string' || isStringArray(text))) {
      pushIssue(out.errors, `${path}.text`, 'Obrigatório (string ou array de strings).')
    }
  }

  if (type === 'Form') {
    const children = (component as any).children
    if (!Array.isArray(children)) {
      pushIssue(out.errors, `${path}.children`, 'Obrigatório (array).')
      return { footerCount: ctx.footerCount }
    }
    children.forEach((c: unknown, idx: number) => {
      const cp = `${path}.children[${idx}]`
      ;({ footerCount: ctx.footerCount } = validateComponent(c, cp, out, ctx))
    })
    return { footerCount: ctx.footerCount }
  }

  if (type === 'Footer') {
    const label = (component as any).label
    const action = (component as any)['on-click-action']
    if (typeof label !== 'string' || !label.trim()) pushIssue(out.errors, `${path}.label`, 'Obrigatório')
    if (!isPlainObject(action) || typeof action.name !== 'string' || !action.name.trim()) {
      pushIssue(out.errors, `${path}["on-click-action"].name`, 'Obrigatório')
    }

    ctx.footerCount += 1
    if (ctx.footerCount > 1) {
      pushIssue(out.errors, path, 'A tela deve ter no máximo 1 componente Footer.')
    }

    return { footerCount: ctx.footerCount }
  }

  if (INPUT_LIKE_COMPONENT_TYPES.has(type)) {
    const name = (component as any).name
    const label = (component as any).label

    if (typeof name !== 'string' || !name.trim()) {
      pushIssue(out.errors, `${path}.name`, 'Obrigatório')
    } else {
      if (ctx.names.has(name)) pushIssue(out.errors, `${path}.name`, `Nome duplicado: "${name}".`)
      ctx.names.add(name)

      if (!/^[a-z0-9_]+$/.test(name)) {
        pushIssue(out.warnings, `${path}.name`, 'Recomendado usar apenas a-z, 0-9 e _ (snake_case).')
      }
    }

    // OptIn costuma usar label/text, mas para manter o builder consistente, exigimos label.
    if (type !== 'OptIn') {
      if (typeof label !== 'string' || !label.trim()) pushIssue(out.errors, `${path}.label`, 'Obrigatório')
    }
  }

  if (DATA_SOURCE_COMPONENT_TYPES.has(type)) {
    const ds = (component as any)['data-source']
    const legacyOptions = (component as any).options

    if (ds == null && legacyOptions != null) {
      pushIssue(out.errors, `${path}["data-source"]`, 'Use "data-source" (não "options") para opções.')
    }

    if (ds == null) {
      pushIssue(out.errors, `${path}["data-source"]`, 'Obrigatório')
    } else {
      validateDataSource(ds, `${path}["data-source"]`, out)
    }
  }

  if (type === 'OptIn') {
    const label = (component as any).label
    const text = (component as any).text
    if ((typeof label !== 'string' || !label.trim()) && (typeof text !== 'string' || !text.trim())) {
      pushIssue(out.errors, `${path}.label`, 'Obrigatório (use "label").')
    }
  }

  return { footerCount: ctx.footerCount }
}

export function validateMetaFlowJson(input: unknown): FlowJsonValidationResult {
  const out: FlowJsonValidationResult = { isValid: true, errors: [], warnings: [] }

  let flow: unknown = input
  if (typeof flow === 'string') {
    const trimmed = flow.trim()
    if (!trimmed) {
      pushIssue(out.errors, 'flow_json', 'Flow JSON vazio.')
      out.isValid = false
      return out
    }
    try {
      flow = JSON.parse(trimmed)
    } catch {
      pushIssue(out.errors, 'flow_json', 'Flow JSON inválido (não foi possível fazer parse do JSON).')
      out.isValid = false
      return out
    }
  }

  if (!isPlainObject(flow)) {
    pushIssue(out.errors, 'flow_json', 'Flow JSON inválido: esperado um objeto.')
    out.isValid = false
    return out
  }

  const version = (flow as any).version
  if (typeof version !== 'string' || !version.trim()) pushIssue(out.errors, 'version', 'Obrigatório')

  const screens = (flow as any).screens
  if (!Array.isArray(screens) || screens.length === 0) {
    pushIssue(out.errors, 'screens', 'Obrigatório (array com pelo menos 1 tela).')
    out.isValid = false
    return out
  }

  screens.forEach((screen, sidx) => {
    const sp = `screens[${sidx}]`
    if (!isPlainObject(screen)) {
      pushIssue(out.errors, sp, 'Tela inválida: esperado objeto.')
      return
    }

    const id = (screen as any).id
    if (typeof id !== 'string' || !id.trim()) pushIssue(out.errors, `${sp}.id`, 'Obrigatório')

    const layout = (screen as any).layout
    if (!isPlainObject(layout)) {
      pushIssue(out.errors, `${sp}.layout`, 'Obrigatório')
      return
    }

    const layoutType = (layout as any).type
    if (layoutType !== 'SingleColumnLayout') {
      pushIssue(out.errors, `${sp}.layout.type`, 'Esperado "SingleColumnLayout".')
    }

    const children = (layout as any).children
    if (!Array.isArray(children)) {
      pushIssue(out.errors, `${sp}.layout.children`, 'Obrigatório (array).')
      return
    }

    if (children.length > 50) {
      pushIssue(out.warnings, `${sp}.layout.children`, `Meta recomenda no máximo 50 componentes por tela (${children.length}/50).`)
    }

    const names = new Set<string>()
    let footerCount = 0

    children.forEach((c, cidx) => {
      const cp = `${sp}.layout.children[${cidx}]`
      ;({ footerCount } = validateComponent(c, cp, out, { names, footerCount }))
    })
  })

  out.isValid = out.errors.length === 0
  return out
}
