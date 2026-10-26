'use client'

import React from 'react'
import { ArrowUpRight, FileText, Image, Phone, Video } from 'lucide-react'
import type { TemplateButton, TemplateComponent } from '@/types'
import { replaceTemplatePlaceholders, type TemplateParameterFormat } from '@/lib/whatsapp/placeholder'
import { cn } from '@/lib/utils'
import { Container } from '@/components/ui/container'

type PreviewButtonKind = 'url' | 'phone_number' | 'quick_reply' | 'copy_code' | 'other'

const iconForButton = (btn: TemplateButton): React.ReactNode => {
  const t = String(btn.type || '').toUpperCase()
  if (t === 'URL') return <ArrowUpRight size={16} className="text-primary-300" />
  if (t === 'PHONE_NUMBER') return <Phone size={16} className="text-primary-300" />
  return <ArrowUpRight size={16} className="text-primary-300 opacity-70" />
}

const kindForButton = (btn: TemplateButton): PreviewButtonKind => {
  const t = String(btn.type || '').toUpperCase()
  if (t === 'URL') return 'url'
  if (t === 'PHONE_NUMBER') return 'phone_number'
  if (t === 'QUICK_REPLY') return 'quick_reply'
  if (t === 'COPY_CODE' || t === 'OTP') return 'copy_code'
  return 'other'
}

const splitByTripleBackticks = (
  text: string
): Array<{ type: 'text' | 'codeblock'; value: string }> => {
  const out: Array<{ type: 'text' | 'codeblock'; value: string }> = []
  let i = 0
  while (i < text.length) {
    const start = text.indexOf('```', i)
    if (start === -1) {
      out.push({ type: 'text', value: text.slice(i) })
      break
    }
    const end = text.indexOf('```', start + 3)
    if (end === -1) {
      out.push({ type: 'text', value: text.slice(i) })
      break
    }
    if (start > i) out.push({ type: 'text', value: text.slice(i, start) })
    out.push({ type: 'codeblock', value: text.slice(start + 3, end) })
    i = end + 3
  }
  return out.filter((t) => t.value.length > 0)
}

const splitPlaceholders = (text: string) => {
  // matches {{1}} and {{foo_bar}}
  return text.split(/(\{\{[^}]+\}\})/g).filter(Boolean)
}

const isHttpUrl = (value: string) => /^https?:\/\//i.test(String(value || '').trim())

const getHeaderExampleUrl = (components?: TemplateComponent[]): string | null => {
  if (!Array.isArray(components)) return null
  const header = components.find((c) => c.type === 'HEADER')
  if (!header) return null
  const format = header.format ? String(header.format).toUpperCase() : ''
  if (!['IMAGE', 'VIDEO', 'DOCUMENT', 'GIF'].includes(format)) return null

  let exampleObj: any = header.example
  if (typeof exampleObj === 'string') {
    try {
      exampleObj = JSON.parse(exampleObj)
    } catch {
      exampleObj = undefined
    }
  }
  const arr = exampleObj?.header_handle
  const candidate = Array.isArray(arr) ? arr.find((item: any) => typeof item === 'string' && item.trim()) : null
  if (!candidate) return null
  return isHttpUrl(candidate) ? String(candidate).trim() : null
}

const OTP_OPEN = '[[OTP]]'
const OTP_CLOSE = '[[/OTP]]'

const injectOtpSentinel = (text: string): string => {
  // Captura o primeiro segmento em negrito via *...* e assume que é o código
  // Regras conservadoras para não transformar qualquer ênfase em "pill".
  const re = /\*([^*\r\n]{1,32})\*/g
  const m = re.exec(text)
  if (!m) return text

  const inner = (m[1] || '').trim()
  if (!inner) {
    // Se o template está "*{{1}}*" mas veio vazio, a lógica de preview já deve manter {{1}}.
    // Aqui não tentamos inferir nada.
    return text
  }

  // Aceita placeholders {{1}}/{{code}} ou códigos simples (OTP). Evita frases com espaços.
  const isPlaceholder = /^\{\{[^}]+\}\}$/.test(inner)
  const isLikelyCode = /^[0-9A-Za-z_-]{3,32}$/.test(inner)
  if (!isPlaceholder && !isLikelyCode) return text

  const start = m.index
  const end = start + m[0].length
  return `${text.slice(0, start)}${OTP_OPEN}${inner}${OTP_CLOSE}${text.slice(end)}`
}

const renderInline = (text: string, keyPrefix: string): React.ReactNode[] => {
  const nodes: React.ReactNode[] = []
  let i = 0
  let key = 0

  const pushText = (value: string) => {
    if (!value) return
    nodes.push(<React.Fragment key={`${keyPrefix}-t-${key++}`}>{value}</React.Fragment>)
  }

  while (i < text.length) {
    // Inline code: `text`
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1)
      if (end > i + 1) {
        const code = text.slice(i + 1, end)
        nodes.push(
          <code
            key={`${keyPrefix}-code-${key++}`}
            className="rounded bg-[var(--ds-bg-elevated)] px-1 py-0.5 font-mono text-[12px] text-[var(--ds-text-secondary)] border border-[var(--ds-border-default)]"
          >
            {code}
          </code>
        )
        i = end + 1
        continue
      }
    }

    const ch = text[i]
    if (ch === '*' || ch === '_' || ch === '~') {
      const end = text.indexOf(ch, i + 1)
      if (end > i + 1) {
        const inner = text.slice(i + 1, end)
        const innerNodes = renderInline(inner, `${keyPrefix}-in-${key}`)

        if (ch === '*') {
          nodes.push(
            <strong key={`${keyPrefix}-b-${key++}`} className="font-semibold text-[var(--ds-text-primary)]">
              {innerNodes}
            </strong>
          )
        } else if (ch === '_') {
          nodes.push(
            <em key={`${keyPrefix}-i-${key++}`} className="italic text-[var(--ds-text-secondary)]">
              {innerNodes}
            </em>
          )
        } else {
          nodes.push(
            <s key={`${keyPrefix}-s-${key++}`} className="line-through text-[var(--ds-text-muted)]">
              {innerNodes}
            </s>
          )
        }

        i = end + 1
        continue
      }
    }

    const nextSpecial = (() => {
      const candidates = ['`', '*', '_', '~']
        .map((sym) => text.indexOf(sym, i + 1))
        .filter((pos) => pos !== -1)
      return candidates.length ? Math.min(...candidates) : -1
    })()

    if (nextSpecial === -1) {
      pushText(text.slice(i))
      break
    }

    pushText(text.slice(i, nextSpecial))
    i = nextSpecial
  }

  return nodes
}

const renderInlineWithPlaceholders = (text: string, keyPrefix: string) => {
  // Primeiro: quebra por pills OTP (se existirem)
  const otpParts = text.split(/(\[\[OTP\]\][\s\S]*?\[\[\/OTP\]\])/g).filter(Boolean)
  let idx = 0

  const renderPlain = (chunk: string, chunkKey: string) => {
    const parts = splitPlaceholders(chunk)
    return (
      <>
        {parts.map((p) => {
          const isPh = /^\{\{[^}]+\}\}$/.test(p)
          if (isPh) {
            const k = `${chunkKey}-ph-${idx++}`
            return (
              <span
                key={k}
                className="rounded-md border border-primary-500/25 bg-primary-500/10 px-1.5 py-0.5 font-mono text-[12px] text-primary-200"
              >
                {p}
              </span>
            )
          }

          const k = `${chunkKey}-seg-${idx++}`
          return <React.Fragment key={k}>{renderInline(p, k)}</React.Fragment>
        })}
      </>
    )
  }

  return (
    <>
      {otpParts.map((p, partIdx) => {
        const k = `${keyPrefix}-otp-${partIdx}`
        const isOtp = p.startsWith(OTP_OPEN) && p.endsWith(OTP_CLOSE)
        if (!isOtp) return <React.Fragment key={k}>{renderPlain(p, k)}</React.Fragment>

        const inner = p.slice(OTP_OPEN.length, p.length - OTP_CLOSE.length)
        return (
          <span
            key={k}
            className={cn(
              'inline-flex items-center justify-center align-baseline',
              'rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] px-4 py-2',
              'font-mono text-[14px] text-[var(--ds-text-primary)]',
              'tracking-[0.28em]',
              'shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
            )}
          >
            {inner}
          </span>
        )
      })}
    </>
  )
}

const renderRichText = (text: string, keyPrefix: string) => {
  const tokens = splitByTripleBackticks(text)

  return (
    <div className="space-y-3">
      {tokens.map((t, idx) => {
        const k = `${keyPrefix}-${idx}`
        if (t.type === 'codeblock') {
          return (
            <pre
              key={k}
              className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-4 font-mono text-[12px] leading-relaxed text-[var(--ds-text-secondary)]"
            >
              <code>{t.value.replace(/^\n+|\n+$/g, '')}</code>
            </pre>
          )
        }

        const lines = t.value.split(/\r?\n/)
        return (
          <div key={k} className="text-[15px] leading-7 text-[var(--ds-text-secondary)]">
            {lines.map((line, lineIdx) => (
              <React.Fragment key={`${k}-ln-${lineIdx}`}>
                {renderInlineWithPlaceholders(line, `${k}-ln-${lineIdx}`)}
                {lineIdx < lines.length - 1 ? <br /> : null}
              </React.Fragment>
            ))}
          </div>
        )
      })}
    </div>
  )
}

export interface TemplatePreviewCardProps {
  templateName: string
  components?: TemplateComponent[]
  fallbackContent?: string
  parameterFormat?: TemplateParameterFormat
  variables?: string[]
  headerVariables?: string[]
  namedVariables?: Record<string, string>
  namedHeaderVariables?: Record<string, string>
  headerMediaPreviewUrl?: string | null
  /** Mostra título/kicker dentro do card. Desligado por padrão (para evitar duplicação no layout da página). */
  showTitle?: boolean
  /** Rótulo pequeno acima do título quando showTitle=true */
  titleKicker?: string
  /** Força/disable comportamento OTP (code pill). Default: auto (ativa quando houver botões OTP/COPY_CODE). */
  otpMode?: 'auto' | 'on' | 'off'
  className?: string
}

export const TemplatePreviewCard: React.FC<TemplatePreviewCardProps> = ({
  templateName,
  components,
  fallbackContent,
  parameterFormat = 'positional',
  variables,
  headerVariables,
  namedVariables,
  namedHeaderVariables,
  headerMediaPreviewUrl,
  showTitle = false,
  titleKicker = 'Template',
  otpMode = 'auto',
  className = '',
}) => {
  const header = components?.find((c) => c.type === 'HEADER')
  const body = components?.find((c) => c.type === 'BODY')
  const footer = components?.find((c) => c.type === 'FOOTER')
  const buttonsComp = components?.find((c) => c.type === 'BUTTONS')
  const buttons = (buttonsComp?.buttons || []) as TemplateButton[]

  const isOtpByButtons = buttons.some((b) => {
    const t = String(b?.type || '').toUpperCase()
    return t === 'COPY_CODE' || t === 'OTP'
  })
  const otpEnabled = otpMode === 'on' ? true : otpMode === 'off' ? false : isOtpByButtons

  const replaceText = (text: string, scope: 'header' | 'body') => {
    const replaced = replaceTemplatePlaceholders({
      text,
      parameterFormat,
      positionalValues: scope === 'header' ? headerVariables || variables : variables,
      namedValues: scope === 'header' ? namedHeaderVariables || namedVariables : namedVariables,
    })

    if (!otpEnabled || scope !== 'body') return replaced
    return injectOtpSentinel(replaced)
  }

  const headerFormat = header?.format ? String(header.format).toUpperCase() : undefined
  const headerText = headerFormat === 'TEXT' ? header?.text : undefined
  const headerExampleUrl = getHeaderExampleUrl(components)
  const resolvedHeaderMediaPreviewUrl = headerMediaPreviewUrl || headerExampleUrl || null
  const showHeaderMedia =
    Boolean(resolvedHeaderMediaPreviewUrl) &&
    Boolean(headerFormat && ['IMAGE', 'VIDEO', 'DOCUMENT', 'GIF'].includes(headerFormat))
  const showHeaderPlaceholder =
    !resolvedHeaderMediaPreviewUrl && Boolean(headerFormat && ['IMAGE', 'VIDEO', 'DOCUMENT', 'GIF'].includes(headerFormat))
  const bodyText = body?.text || fallbackContent || ''
  const footerText = footer?.text || ''

  return (
    <Container
      variant="glass"
      padding="lg"
      className={cn(
        'shadow-[0_18px_45px_rgba(0,0,0,0.1)] dark:shadow-[0_18px_45px_rgba(0,0,0,0.45)] overflow-hidden',
        className
      )}
      aria-label={`Preview do template ${templateName}`}
    >
      {showTitle ? (
        <div className="mb-6">
          <div className="text-xs uppercase tracking-widest text-[var(--ds-text-muted)]">{titleKicker}</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-[var(--ds-text-primary)]">{templateName}</div>
        </div>
      ) : null}

      {showHeaderMedia ? (
        <div className="mb-5 overflow-hidden rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)]">
          {headerFormat === 'DOCUMENT' ? (
            <a
              href={resolvedHeaderMediaPreviewUrl || '#'}
              target="_blank"
              rel="noreferrer"
              className="block px-4 py-3 text-xs font-semibold text-primary-200 hover:text-primary-100"
            >
              Abrir documento
            </a>
          ) : headerFormat === 'VIDEO' || headerFormat === 'GIF' ? (
            <video
              src={resolvedHeaderMediaPreviewUrl || undefined}
              className="w-full h-auto"
              muted
              controls
              playsInline
            />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element -- Dynamic user-provided media URL */
            <img
              src={resolvedHeaderMediaPreviewUrl || undefined}
              alt="Prévia da mídia do cabeçalho"
              className="w-full h-auto"
              loading="lazy"
            />
          )}
        </div>
      ) : null}

      {showHeaderPlaceholder ? (
        <div className="mb-5 flex h-40 items-center justify-center rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)]">
          <div className="flex items-center gap-2 text-xs text-[var(--ds-text-secondary)]">
            {headerFormat === 'DOCUMENT' ? (
              <FileText size={18} />
            ) : headerFormat === 'VIDEO' || headerFormat === 'GIF' ? (
              <Video size={18} />
            ) : (
              <Image size={18} />
            )}
            <span>Carregando mídia…</span>
          </div>
        </div>
      ) : null}

      {headerText ? (
        <div className="mb-5 border-l-2 border-primary-500/40 pl-4">
          <div className="text-[13px] font-semibold text-[var(--ds-text-primary)]">
            {renderInlineWithPlaceholders(replaceText(headerText, 'header'), 'tpl-hdr')}
          </div>
        </div>
      ) : null}

      {bodyText ? (
        <div className={cn('text-[var(--ds-text-secondary)]', otpEnabled ? 'text-[var(--ds-text-secondary)]' : null)}>
          {renderRichText(replaceText(bodyText, 'body'), 'tpl-body')}
        </div>
      ) : null}

      {footerText ? (
        <div className="mt-5 border-t border-[var(--ds-border-default)] pt-4 text-xs text-[var(--ds-text-secondary)]">
          {renderInlineWithPlaceholders(replaceText(footerText, 'body'), 'tpl-ftr')}
        </div>
      ) : null}

      {buttons.length > 0 ? (
        <div className="mt-6 grid gap-2">
          {buttons.map((b, idx) => {
            const kind = kindForButton(b)
            const meta =
              kind === 'url'
                ? b.url
                : kind === 'phone_number'
                  ? (b as any).phone_number
                  : undefined

            return (
              <div
                key={`${b.type}-${idx}`}
                className={cn(
                  'group flex items-center justify-between gap-3',
                  'w-full max-w-full overflow-hidden',
                  'rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)] px-4 py-3',
                  'transition-colors hover:bg-[var(--ds-bg-hover)]'
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-[var(--ds-text-primary)]">{b.text}</div>
                  {meta ? (
                    <div className="mt-1 max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-xs text-[var(--ds-text-muted)]">
                      {String(meta)}
                    </div>
                  ) : null}
                </div>
                <div className="shrink-0 opacity-80 group-hover:opacity-100">{iconForButton(b)}</div>
              </div>
            )
          })}
        </div>
      ) : null}
    </Container>
  )
}
