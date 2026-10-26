'use client'

import React from 'react'
import { Play, ExternalLink, CornerDownLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Button type for template preview */
export type ModelPreviewButton = {
  /** Type of WhatsApp template button */
  /** Tipos de botão suportados pela Meta API para templates */
  type:
    | 'QUICK_REPLY'
    | 'URL'
    | 'PHONE_NUMBER'
    | 'COPY_CODE'
    | 'OTP'
    | 'FLOW'
  /** Button display text */
  text: string
}

export interface TemplateModelPreviewCardProps {
  /** Card title (displayed at the top of the card) */
  title?: string
  /** Business name shown in the conversation header */
  businessName?: string
  /** Subtitle shown in the conversation header */
  contextLabel?: string
  /** Header text displayed above the body (template Header TEXT) */
  headerLabel?: string | null
  /** Main content (template body) */
  bodyText?: string
  /** Footer text (template footer) */
  footerText?: string
  /** Action buttons (same visual as template builder preview) */
  buttons?: ModelPreviewButton[]
  /** Placeholder text when body is empty */
  emptyBodyText?: string
}

export function TemplateModelPreviewCard(props: TemplateModelPreviewCardProps) {
  const title = props.title ?? 'Prévia do modelo'
  const businessName = props.businessName ?? 'Business'
  const contextLabel = props.contextLabel ?? 'template'

  const headerLabel = props.headerLabel || null
  const bodyText = props.bodyText || ''
  const footerText = props.footerText || ''
  const buttons = Array.isArray(props.buttons) ? props.buttons : []
  const emptyBodyText = props.emptyBodyText ?? 'Digite o corpo para ver a prévia.'

  const prettyButtonLabel = (b: ModelPreviewButton): string => {
    const t = String(b?.type || '')
    if (t === 'COPY_CODE') return b?.text || 'Copiar código'
    if (t === 'QUICK_REPLY') return b?.text || 'Quick Reply'
    return b?.text || t
  }

  return (
    <div className="rounded-2xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)] shadow-[0_12px_30px_rgba(0,0,0,0.35)] overflow-hidden">
      <div className="px-6 py-4 flex items-center justify-between border-b border-[var(--ds-border-subtle)]">
        <div className="text-sm font-semibold text-[var(--ds-text-primary)]">{title}</div>
        <button
          type="button"
          className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 hover:bg-[var(--ds-bg-hover)] text-[var(--ds-text-secondary)]"
          title="Visualizar"
        >
          <Play className="w-4 h-4" />
        </button>
      </div>

      <div className="p-6">
        {/* “telefone” */}
        <div className="rounded-2xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 p-3">
          <div className="rounded-2xl overflow-hidden border border-[var(--ds-border-subtle)] bg-[#efeae2]">
            {/* header da conversa */}
            <div className="h-11 px-3 flex items-center gap-2 bg-[#075e54] text-white">
              <div className="h-7 w-7 rounded-full bg-white/20" />
              <div className="min-w-0">
                <div className="text-[12px] font-semibold leading-none truncate">{businessName}</div>
                <div className="text-[10px] text-white/80 leading-none mt-0.5 truncate">{contextLabel}</div>
              </div>
            </div>

            {/* conversa */}
            <div className="p-3">
              <div className="max-w-90 rounded-xl bg-white text-slate-900 shadow-sm overflow-hidden">
                <div className="px-3 py-2">
                  {headerLabel ? (
                    <div className="text-[13px] font-semibold leading-snug">{headerLabel}</div>
                  ) : null}

                  <div className="text-[13px] leading-snug whitespace-pre-wrap">
                    {bodyText ? bodyText : <span className="text-slate-400">{emptyBodyText}</span>}
                  </div>

                  {footerText ? (
                    <div className="mt-1 text-[11px] text-slate-500 whitespace-pre-wrap">{footerText}</div>
                  ) : null}

                  <div className="mt-1 flex items-center justify-end text-[10px] text-slate-400">16:34</div>
                </div>

                {buttons.length > 0 ? (
                  <div className="border-t border-slate-200">
                    {buttons.map((b, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          'px-3 py-3 text-center text-[13px] font-medium text-blue-600 flex items-center justify-center gap-2',
                          idx > 0 ? 'border-t border-slate-200' : ''
                        )}
                      >
                        {String(b?.type || '') === 'URL' ? (
                          <ExternalLink className="w-4 h-4" />
                        ) : String(b?.type || '') === 'QUICK_REPLY' ? (
                          <CornerDownLeft className="w-4 h-4" />
                        ) : null}
                        <span>{prettyButtonLabel(b)}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TemplateModelPreviewCard
