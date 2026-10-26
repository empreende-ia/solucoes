'use client'

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { flowsService } from '@/services/flowsService'
import { templateService } from '@/services/templateService'
import { validateVideoCodecs, getCodecErrorMessage } from '@/lib/video-codec-validator'

// Extracted components
import { TemplatePreview } from './builder/TemplatePreview'
import { StepConfig } from './builder/StepConfig'
import { StepContent } from './builder/StepContent'
import { StepButtons } from './builder/StepButtons'
import { StepNavigation } from './builder/StepNavigation'
import { PreviewDrawer } from './builder/PreviewDrawer'
import { FloatingPreviewButton } from './builder/FloatingPreviewButton'

// Utility functions and types
import {
  type Spec,
  type HeaderFormat,
  type HeaderMediaPreview,
  type ButtonType,
  normalizeButtons,
  countButtonsByType,
  newButtonForType,
  ensureBaseSpec,
  variableCount,
  variableOccurrences,
  extractPlaceholderTokens,
  missingPositionalTokens,
  validateNamedTokens,
  validateCarouselSpec,
  textHasEdgeParameter,
  stripAllPlaceholders,
  sanitizePlaceholdersByMode,
  nextPositionalVariable,
  wrapSelection,
  insertAt,
  defaultBodyExamples,
  allowedHeaderFormats,
  countChars,
  formatBytes,
  clampText,
  splitPhone,
  joinPhone,
} from './utils/templateBuilderUtils'
import { Input } from '@/components/ui/input'
import { Container } from '@/components/ui/container'

export function ManualTemplateBuilder({
  id,
  initialSpec,
  onSpecChange,
  onFinish,
  isFinishing,
  onSaveDraft,
  isSaving,
}: {
  id: string
  initialSpec: unknown
  onSpecChange: (spec: unknown) => void
  onFinish?: () => void
  isFinishing?: boolean
  onSaveDraft?: () => void
  isSaving?: boolean
}) {
  // ============================================================================
  // State
  // ============================================================================
  const [spec, setSpec] = React.useState<Spec>(() => ensureBaseSpec(initialSpec))
  const [showDebug, setShowDebug] = React.useState(false)
  const [step, setStep] = React.useState(1)
  const [isPreviewDrawerOpen, setIsPreviewDrawerOpen] = React.useState(false)

  const [headerMediaPreview, setHeaderMediaPreview] = React.useState<HeaderMediaPreview | null>(null)
  const headerMediaFileInputRef = React.useRef<HTMLInputElement | null>(null)

  const [isUploadingHeaderMedia, setIsUploadingHeaderMedia] = React.useState(false)
  const [uploadHeaderMediaError, setUploadHeaderMediaError] = React.useState<string | null>(null)

  // ============================================================================
  // Refs
  // ============================================================================
  const headerTextRef = React.useRef<HTMLInputElement | null>(null)
  const bodyRef = React.useRef<HTMLTextAreaElement | null>(null)
  const footerRef = React.useRef<HTMLInputElement | null>(null)
  const lastSanitizeRef = React.useRef(0)

  // Named variable dialog state
  const [namedVarDialogOpen, setNamedVarDialogOpen] = React.useState(false)
  const [namedVarTarget, setNamedVarTarget] = React.useState<'header' | 'body'>('body')
  const [namedVarName, setNamedVarName] = React.useState('')
  const [namedVarError, setNamedVarError] = React.useState<string | null>(null)
  const [namedVarExistingText, setNamedVarExistingText] = React.useState('')

  // ============================================================================
  // Queries
  // ============================================================================
  const flowsQuery = useQuery({
    queryKey: ['flows'],
    queryFn: flowsService.list,
    staleTime: 10_000,
  })

  // Verifica se Meta App ID está configurado (necessário para upload de mídia)
  const metaAppQuery = useQuery({
    queryKey: ['metaAppConfig'],
    queryFn: async () => {
      const res = await fetch('/api/settings/meta-app')
      if (!res.ok) return { appId: null }
      return res.json()
    },
    staleTime: 60_000,
  })
  const hasMetaAppId = !!metaAppQuery.data?.appId

  const publishedFlows = React.useMemo(() => {
    const rows = flowsQuery.data || []
    const withMeta = rows.filter((f) => !!f?.meta_flow_id)
    const hasAnyMetaStatus = withMeta.some((f) => (f as any)?.meta_status != null)
    const list = hasAnyMetaStatus
      ? withMeta.filter((f) => String((f as any)?.meta_status || '') === 'PUBLISHED')
      : withMeta
    return list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'))
  }, [flowsQuery.data])

  // ============================================================================
  // Effects
  // ============================================================================
  React.useEffect(() => {
    setSpec(ensureBaseSpec(initialSpec))
  }, [initialSpec])

  React.useEffect(() => {
    return () => {
      if (headerMediaPreview?.url) URL.revokeObjectURL(headerMediaPreview.url)
    }
  }, [headerMediaPreview?.url])

  // ============================================================================
  // Update Functions
  // ============================================================================
  const update = (patch: Partial<Spec>) => {
    setSpec((prev: any) => {
      const next = { ...prev, ...patch }
      onSpecChange(next)
      return next
    })
  }

  const updateHeader = (patch: any) => {
    setSpec((prev: any) => {
      const next = { ...prev, header: patch }
      onSpecChange(next)
      return next
    })
  }

  const updateFooter = (patch: any) => {
    setSpec((prev: any) => {
      const next = { ...prev, footer: patch }
      onSpecChange(next)
      return next
    })
  }

  const updateButtons = (buttons: any[]) => {
    setSpec((prev: any) => {
      const next = { ...prev, buttons: normalizeButtons(buttons) }
      onSpecChange(next)
      return next
    })
  }

  const notifySanitized = () => {
    const now = Date.now()
    if (now - lastSanitizeRef.current < 1500) return
    lastSanitizeRef.current = now
    toast.message('Removemos variaveis invalidas automaticamente.')
  }

  // ============================================================================
  // Media Upload Functions
  // ============================================================================
  // Limite máximo do Vercel Serverless é ~4.5MB para request body
  const VERCEL_SERVERLESS_LIMIT = 4_500_000

  const headerMediaMaxBytes = (format: HeaderFormat): number => {
    if (format === 'GIF') return 3_500_000
    if (format === 'IMAGE') return Math.min(5_000_000, VERCEL_SERVERLESS_LIMIT)
    if (format === 'VIDEO') return VERCEL_SERVERLESS_LIMIT // Meta permite 16MB, mas Vercel limita a 4.5MB
    if (format === 'DOCUMENT') return VERCEL_SERVERLESS_LIMIT // Meta permite 20MB, mas Vercel limita a 4.5MB
    return 0
  }

  const headerMediaAccept = (format: HeaderFormat | 'NONE'): string => {
    if (format === 'IMAGE') return 'image/png,image/jpeg'
    if (format === 'VIDEO') return 'video/mp4'
    if (format === 'GIF') return 'video/mp4'
    if (format === 'DOCUMENT') return 'application/pdf'
    return ''
  }

  const uploadHeaderMedia = async (file: File) => {
    if (!canShowMediaSample) return

    const format = headerType as HeaderFormat
    if (format === 'GIF' && !isMarketingCategory) {
      setUploadHeaderMediaError('GIF e permitido apenas em templates MARKETING.')
      return
    }

    const max = headerMediaMaxBytes(format)
    if (max > 0 && file.size > max) {
      const mb = (max / 1_000_000).toFixed(1)
      const fileMb = (file.size / 1_000_000).toFixed(1)
      const isPlatformLimit = max === VERCEL_SERVERLESS_LIMIT
      setUploadHeaderMediaError(
        isPlatformLimit
          ? `Arquivo muito grande (${fileMb}MB). Limite da plataforma: ${mb}MB. Comprima o ${format === 'VIDEO' ? 'vídeo' : 'arquivo'} antes de enviar.`
          : `Arquivo muito grande para ${format}. Limite: ${mb}MB.`
      )
      return
    }

    // Validar codecs de vídeo antes do upload (VIDEO e GIF são ambos mp4)
    if (format === 'VIDEO' || format === 'GIF') {
      try {
        const codecResult = await validateVideoCodecs(file)

        if (!codecResult.valid) {
          const errorMsg = getCodecErrorMessage(codecResult)
          setUploadHeaderMediaError(errorMsg)
          toast.error(errorMsg, { duration: 8000 })
          return
        }

        // Mostrar warning se houver (ex: vídeo sem áudio)
        if (codecResult.warning) {
          toast.warning(codecResult.warning, { duration: 6000 })
        }
      } catch (err) {
        // Em caso de erro na validação, continua com o upload (Meta vai validar)
        console.warn('Erro ao validar codecs:', err)
      }
    }

    setUploadHeaderMediaError(null)
    setIsUploadingHeaderMedia(true)
    try {
      const { handle } = await templateService.uploadHeaderMedia(file, format)

      updateHeader({
        ...header,
        format,
        example: {
          ...(header?.example || {}),
          header_handle: [handle],
        },
      })

      toast.success('Upload concluido. header_handle preenchido automaticamente.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao enviar midia'
      setUploadHeaderMediaError(msg)
      toast.error(msg)
    } finally {
      setIsUploadingHeaderMedia(false)
    }
  }

  // ============================================================================
  // Variable Functions
  // ============================================================================
  const insertVariable = (target: 'header' | 'body', placeholder: string) => {
    const currentText = target === 'header' ? String(header?.text || '') : String(spec.body?.text || '')

    if (target === 'header') {
      if (variableOccurrences(currentText) >= 1) return
      const el = headerTextRef.current
      const start = el?.selectionStart ?? currentText.length
      const { value, nextPos } = insertAt(currentText, start, placeholder)
      updateHeader({ ...(header || { format: 'TEXT' }), format: 'TEXT', text: value, example: header?.example ?? null })
      requestAnimationFrame(() => {
        if (!el) return
        el.focus()
        el.setSelectionRange(nextPos, nextPos)
      })
      return
    }

    const el = bodyRef.current
    const start = el?.selectionStart ?? currentText.length
    const { value, nextPos } = insertAt(currentText, start, placeholder)
    const example = defaultBodyExamples(value)
    update({ body: { ...(spec.body || {}), text: value, example: example ? { body_text: example } : undefined } })
    requestAnimationFrame(() => {
      if (!el) return
      el.focus()
      el.setSelectionRange(nextPos, nextPos)
    })
  }

  const openNamedVariableDialog = (target: 'header' | 'body', currentText: string) => {
    setNamedVarTarget(target)
    setNamedVarExistingText(currentText)
    setNamedVarName('')
    setNamedVarError(null)
    setNamedVarDialogOpen(true)
  }

  const confirmNamedVariable = () => {
    const trimmed = namedVarName.trim()
    if (!trimmed) {
      setNamedVarError('Informe um nome para a variavel.')
      return
    }
    if (!/^[a-z][a-z0-9_]*$/.test(trimmed)) {
      setNamedVarError('Use apenas minusculas, numeros e underscore (ex: first_name).')
      return
    }
    if (namedVarExistingText.includes(`{{${trimmed}}}`)) {
      setNamedVarError('Esse nome de variavel ja foi usado neste campo.')
      return
    }

    setNamedVarDialogOpen(false)
    setNamedVarName('')
    setNamedVarError(null)
    insertVariable(namedVarTarget, `{{${trimmed}}}`)
  }

  const addVariable = (target: 'header' | 'body') => {
    const currentText = target === 'header' ? String(header?.text || '') : String(spec.body?.text || '')

    const placeholder = (() => {
      if (variableMode === 'positional') {
        const next = nextPositionalVariable(currentText)
        return `{{${next}}}`
      }

      if (target === 'header' && variableOccurrences(currentText) >= 1) return null
      openNamedVariableDialog(target, currentText)
      return null
    })()

    if (!placeholder) return

    insertVariable(target, placeholder)
  }

  const applyBodyFormat = (kind: 'bold' | 'italic' | 'strike' | 'code') => {
    const el = bodyRef.current
    const value = String(spec.body?.text || '')
    if (!el) return
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    const token = kind === 'bold' ? '*' : kind === 'italic' ? '_' : kind === 'strike' ? '~' : '`'
    const { value: nextValue, nextStart, nextEnd } = wrapSelection(value, start, end, token)
    const example = defaultBodyExamples(nextValue)
    update({ body: { ...(spec.body || {}), text: nextValue, example: example ? { body_text: example } : undefined } })
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(nextStart, nextEnd)
    })
  }

  // ============================================================================
  // Derived State
  // ============================================================================
  const header: any = spec.header
  const buttons: any[] = Array.isArray(spec.buttons) ? spec.buttons : []

  const maxButtons = 10
  const maxButtonText = 25
  const isMarketingCategory = String(spec.category || '') === 'MARKETING'
  const isAuthCategory = String(spec.category || '') === 'AUTHENTICATION'
  const isLimitedTimeOffer = Boolean(spec.limited_time_offer)
  const allowedButtonTypes = new Set<ButtonType>(
    isAuthCategory
      ? ['OTP']
      : ['QUICK_REPLY', 'URL', 'PHONE_NUMBER', 'COPY_CODE', 'FLOW'],
  )
  const counts = {
    total: buttons.length,
    url: countButtonsByType(buttons, 'URL'),
    phone: countButtonsByType(buttons, 'PHONE_NUMBER'),
    copyCode: countButtonsByType(buttons, 'COPY_CODE'),
    otp: countButtonsByType(buttons, 'OTP'),
  }

  const canAddButtonType = (type: ButtonType): { ok: boolean; reason?: string } => {
    if (!allowedButtonTypes.has(type)) return { ok: false, reason: 'Tipo não permitido para esta categoria.' }
    if (counts.total >= maxButtons) return { ok: false, reason: 'Limite de 10 botões atingido.' }
    if (type === 'URL' && counts.url >= 2) return { ok: false, reason: 'Limite de 2 botões de URL.' }
    if (type === 'PHONE_NUMBER' && counts.phone >= 1) return { ok: false, reason: 'Limite de 1 botão de telefone.' }
    if (type === 'COPY_CODE' && counts.copyCode >= 1) return { ok: false, reason: 'Limite de 1 botão de copiar código.' }
    if (type === 'OTP' && counts.otp >= 1) return { ok: false, reason: 'Limite de 1 botão OTP.' }
    return { ok: true }
  }

  const addButton = (type: ButtonType) => {
    const gate = canAddButtonType(type)
    if (!gate.ok) return
    updateButtons([...buttons, newButtonForType(type)])
  }

  const variableMode: 'positional' | 'named' = spec.parameter_format || 'positional'

  // Text values
  const headerEnabled = !!spec.header
  const headerType: HeaderFormat | 'NONE' = headerEnabled ? (header?.format || 'TEXT') : 'NONE'
  const bodyText: string = String(spec.body?.text || '')
  const footerText: string = String(spec.footer?.text || '')
  const headerText: string = String(header?.text || '')

  // Character counts
  const headerTextCount = headerText.length
  const bodyTextCount = bodyText.length
  const footerTextCount = footerText.length
  const bodyMaxLength = isLimitedTimeOffer ? 600 : 1024

  // Validation states
  const headerVariableCount = headerType === 'TEXT' ? variableOccurrences(headerText) : 0
  const isHeaderVariableValid = headerVariableCount <= 1
  const headerLengthExceeded = headerType === 'TEXT' && headerTextCount > 60
  const headerTextMissing = headerEnabled && headerType === 'TEXT' && !headerText.trim()
  const bodyLengthExceeded = bodyTextCount > bodyMaxLength
  const footerLengthExceeded = Boolean(spec.footer) && footerTextCount > 60
  const isHeaderFormatValid = !headerEnabled || headerType === 'NONE' || allowedHeaderFormats.has(headerType as HeaderFormat)
  const footerHasVariables = variableOccurrences(footerText) > 0
  const headerEdgeParameter = headerType === 'TEXT' ? textHasEdgeParameter(headerText) : { starts: false, ends: false }
  const bodyEdgeParameter = textHasEdgeParameter(bodyText)

  // Positional validation
  const positionalHeaderInvalid =
    variableMode === 'positional' && headerType === 'TEXT'
      ? extractPlaceholderTokens(headerText).filter((t) => !/^\d+$/.test(t) || Number(t) < 1)
      : []
  const positionalBodyInvalid =
    variableMode === 'positional'
      ? extractPlaceholderTokens(bodyText).filter((t) => !/^\d+$/.test(t) || Number(t) < 1)
      : []
  const positionalHeaderMissing =
    variableMode === 'positional' && headerType === 'TEXT'
      ? missingPositionalTokens(extractPlaceholderTokens(headerText))
      : []
  const positionalBodyMissing =
    variableMode === 'positional'
      ? missingPositionalTokens(extractPlaceholderTokens(bodyText))
      : []
  const hasMissingPositional = positionalHeaderMissing.length > 0 || positionalBodyMissing.length > 0
  const hasInvalidPositional = positionalHeaderInvalid.length > 0 || positionalBodyInvalid.length > 0 || hasMissingPositional

  // Named validation
  const namedHeaderChecks = variableMode === 'named' && headerType === 'TEXT' ? validateNamedTokens(headerText) : null
  const namedBodyChecks = variableMode === 'named' ? validateNamedTokens(bodyText) : null
  const namedFooterChecks = variableMode === 'named' ? validateNamedTokens(footerText) : null
  const hasInvalidNamed =
    (namedHeaderChecks?.invalid.length || 0) > 0 ||
    (namedBodyChecks?.invalid.length || 0) > 0 ||
    (namedFooterChecks?.invalid.length || 0) > 0
  const hasDuplicateNamed =
    (namedHeaderChecks?.duplicates.length || 0) > 0 ||
    (namedBodyChecks?.duplicates.length || 0) > 0 ||
    (namedFooterChecks?.duplicates.length || 0) > 0
  const hasLengthErrors = headerLengthExceeded || bodyLengthExceeded || footerLengthExceeded

  // LTO validation
  const ltoHeaderInvalid =
    isLimitedTimeOffer && headerEnabled && headerType !== 'IMAGE' && headerType !== 'VIDEO'
  const ltoFooterInvalid = isLimitedTimeOffer && Boolean(spec.footer)
  const copyCodeExamples = buttons
    .filter((b) => b?.type === 'COPY_CODE')
    .map((b) => {
      const value = Array.isArray(b?.example) ? b.example[0] : b?.example
      return String(value || '').trim()
    })
  const ltoCopyCodeMissing = isLimitedTimeOffer && (copyCodeExamples.length === 0 || copyCodeExamples.some((c) => !c))
  const ltoCopyCodeTooLong = isLimitedTimeOffer && copyCodeExamples.some((c) => c.length > 15)
  const limitedTimeOfferTextMissing = Boolean(spec.limited_time_offer) && !String(spec.limited_time_offer?.text || '').trim()
  const limitedTimeOfferTextTooLong = Boolean(spec.limited_time_offer) && String(spec.limited_time_offer?.text || '').length > 16
  const limitedTimeOfferCategoryInvalid = Boolean(spec.limited_time_offer) && String(spec.category || '') !== 'MARKETING'

  // Button validation
  const invalidButtonTypes = buttons.filter((b) => b?.type && !allowedButtonTypes.has(b.type)).map((b) => String(b?.type || ''))
  const buttonErrors: string[] = []
  if (counts.total > maxButtons) buttonErrors.push('Máximo de 10 botões no total.')
  if (counts.url > 2) buttonErrors.push('Máximo de 2 botões de URL.')
  if (counts.phone > 1) buttonErrors.push('Máximo de 1 botão de telefone.')
  if (counts.copyCode > 1) buttonErrors.push('Máximo de 1 botão de copiar código.')
  if (isAuthCategory && counts.otp !== 1) buttonErrors.push('Authentication exige 1 botão OTP.')
  if (!isAuthCategory && counts.otp > 0) buttonErrors.push('OTP e permitido apenas em Authentication.')
  if (invalidButtonTypes.length) buttonErrors.push(`Botões não permitidos: ${invalidButtonTypes.join(', ')}.`)
  if (ltoCopyCodeMissing) buttonErrors.push('Limited Time Offer exige botão COPY_CODE com exemplo.')
  if (ltoCopyCodeTooLong) buttonErrors.push('Limited Time Offer: código do COPY_CODE deve ter até 15 caracteres.')
  const requiresButtonText = new Set<ButtonType>([
    'QUICK_REPLY',
    'URL',
    'PHONE_NUMBER',
    'COPY_CODE',
    'FLOW',
    'OTP',
  ])
  const missingButtonText = buttons.some((b) => requiresButtonText.has(b?.type) && !String(b?.text || '').trim())
  if (missingButtonText) buttonErrors.push('Preencha o texto dos botões.')

  const carouselErrors = validateCarouselSpec(spec.carousel)
  const isButtonsValid =
    buttonErrors.length === 0 &&
    carouselErrors.length === 0 &&
    !limitedTimeOfferTextMissing &&
    !limitedTimeOfferTextTooLong &&
    !limitedTimeOfferCategoryInvalid

  // Media validation
  const canShowMediaSample = headerType === 'IMAGE' || headerType === 'VIDEO' || headerType === 'GIF' || headerType === 'DOCUMENT'

  React.useEffect(() => {
    if (!canShowMediaSample) {
      if (headerMediaPreview) setHeaderMediaPreview(null)
      return
    }
    if (headerMediaPreview && headerMediaPreview.format !== headerType) {
      setHeaderMediaPreview(null)
    }
  }, [canShowMediaSample, headerType, headerMediaPreview])

  const headerMediaHandleValue = canShowMediaSample ? String(header?.example?.header_handle?.[0] || '').trim() : ''
  const isHeaderMediaHandleMissing = canShowMediaSample && !headerMediaHandleValue

  // Step validation
  const nameValue = String(spec.name || '').trim()
  const isNameValid = Boolean(nameValue) && /^[a-z0-9_]+$/.test(nameValue)
  const isConfigComplete = isNameValid && Boolean(spec.category) && Boolean(spec.language) && Boolean(spec.parameter_format)
  const isContentComplete =
    bodyText.trim().length > 0 &&
    isHeaderVariableValid &&
    isHeaderFormatValid &&
    !headerTextMissing &&
    !isHeaderMediaHandleMissing &&
    !hasInvalidNamed &&
    !hasDuplicateNamed &&
    !hasInvalidPositional &&
    !hasLengthErrors &&
    !ltoHeaderInvalid &&
    !ltoFooterInvalid &&
    !footerHasVariables &&
    !headerEdgeParameter.starts &&
    !headerEdgeParameter.ends &&
    !bodyEdgeParameter.starts &&
    !bodyEdgeParameter.ends
  const canContinue = step === 1 ? isConfigComplete : step === 2 ? isContentComplete : isButtonsValid && isContentComplete

  const steps = [
    { id: 1, label: 'Configuracao' },
    { id: 2, label: 'Conteudo' },
    { id: 3, label: 'Botoes' },
  ]

  // ============================================================================
  // Render
  // ============================================================================
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-6 items-start">
      <div className="space-y-6">
        {/* Step tabs */}
        <div className="grid grid-cols-3 gap-3">
          {steps.map((item) => {
            const isStepEnabled =
              item.id === 1 ||
              (item.id === 2 && isConfigComplete) ||
              (item.id === 3 && isConfigComplete && isContentComplete)
            return (
              <button
                key={item.id}
                type="button"
                disabled={!isStepEnabled}
                onClick={() => {
                  if (!isStepEnabled) return
                  setStep(item.id)
                }}
                className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition ${
                  step === item.id
                    ? 'border-primary-600 dark:border-primary-400/40 bg-primary-100 dark:bg-primary-500/10 text-primary-900 dark:text-white'
                    : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] text-[var(--ds-text-muted)]'
                } ${!isStepEnabled ? 'cursor-not-allowed opacity-40' : 'hover:text-[var(--ds-text-primary)]'}`}
              >
                <span
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border text-xs font-semibold leading-none ${
                    step === item.id
                      ? 'border-primary-600 dark:border-primary-400 bg-primary-200 dark:bg-primary-500/20 text-primary-800 dark:text-primary-200'
                      : 'border-[var(--ds-border-default)] text-[var(--ds-text-muted)]'
                  }`}
                >
                  {item.id}
                </span>
                <span className="text-xs uppercase tracking-widest">{item.label}</span>
              </button>
            )
          })}
        </div>

        {/* Step content */}
        {step === 1 && (
          <StepConfig
            id={id}
            spec={spec}
            update={update}
            variableMode={variableMode}
            headerType={headerType}
            headerText={headerText}
            bodyText={bodyText}
            footerText={footerText}
            sanitizePlaceholdersByMode={sanitizePlaceholdersByMode}
            notifySanitized={notifySanitized}
            normalizeButtons={normalizeButtons}
            buttons={buttons}
            newButtonForType={newButtonForType}
            defaultBodyExamples={defaultBodyExamples}
            stripAllPlaceholders={stripAllPlaceholders}
            header={header}
            isNameValid={isNameValid}
          />
        )}

        {step === 2 && (
          <StepContent
            spec={spec}
            header={header}
            update={update}
            updateHeader={updateHeader}
            updateFooter={updateFooter}
            variableMode={variableMode}
            addVariable={addVariable}
            applyBodyFormat={applyBodyFormat}
            bodyRef={bodyRef}
            headerTextRef={headerTextRef}
            footerRef={footerRef}
            headerType={headerType}
            headerText={headerText}
            bodyText={bodyText}
            footerText={footerText}
            headerTextCount={headerTextCount}
            bodyTextCount={bodyTextCount}
            footerTextCount={footerTextCount}
            bodyMaxLength={bodyMaxLength}
            headerVariableCount={headerVariableCount}
            isHeaderVariableValid={isHeaderVariableValid}
            headerLengthExceeded={headerLengthExceeded}
            headerTextMissing={headerTextMissing}
            bodyLengthExceeded={bodyLengthExceeded}
            footerLengthExceeded={footerLengthExceeded}
            isHeaderFormatValid={isHeaderFormatValid}
            footerHasVariables={footerHasVariables}
            headerEdgeParameter={headerEdgeParameter}
            bodyEdgeParameter={bodyEdgeParameter}
            positionalHeaderInvalid={positionalHeaderInvalid}
            positionalBodyInvalid={positionalBodyInvalid}
            positionalHeaderMissing={positionalHeaderMissing}
            positionalBodyMissing={positionalBodyMissing}
            hasInvalidNamed={hasInvalidNamed}
            hasDuplicateNamed={hasDuplicateNamed}
            namedHeaderChecks={namedHeaderChecks}
            namedBodyChecks={namedBodyChecks}
            namedFooterChecks={namedFooterChecks}
            isMarketingCategory={isMarketingCategory}
            isLimitedTimeOffer={isLimitedTimeOffer}
            ltoHeaderInvalid={ltoHeaderInvalid}
            ltoFooterInvalid={ltoFooterInvalid}
            canShowMediaSample={canShowMediaSample}
            headerMediaHandleValue={headerMediaHandleValue}
            isHeaderMediaHandleMissing={isHeaderMediaHandleMissing}
            headerMediaPreview={headerMediaPreview}
            setHeaderMediaPreview={setHeaderMediaPreview}
            headerMediaFileInputRef={headerMediaFileInputRef}
            isUploadingHeaderMedia={isUploadingHeaderMedia}
            uploadHeaderMediaError={uploadHeaderMediaError}
            uploadHeaderMedia={uploadHeaderMedia}
            headerMediaAccept={headerMediaAccept}
            formatBytes={formatBytes}
            sanitizePlaceholdersByMode={sanitizePlaceholdersByMode}
            stripAllPlaceholders={stripAllPlaceholders}
            defaultBodyExamples={defaultBodyExamples}
            notifySanitized={notifySanitized}
            namedVarDialogOpen={namedVarDialogOpen}
            setNamedVarDialogOpen={setNamedVarDialogOpen}
            namedVarName={namedVarName}
            setNamedVarName={setNamedVarName}
            namedVarError={namedVarError}
            setNamedVarError={setNamedVarError}
            confirmNamedVariable={confirmNamedVariable}
            hasMetaAppId={hasMetaAppId}
          />
        )}

        {step === 3 && (
          <StepButtons
            spec={spec}
            buttons={buttons}
            updateButtons={updateButtons}
            addButton={addButton}
            canAddButtonType={canAddButtonType}
            publishedFlows={publishedFlows}
            flowsQueryIsLoading={flowsQuery.isLoading}
            isMarketingCategory={isMarketingCategory}
            isLimitedTimeOffer={isLimitedTimeOffer}
            allowedButtonTypes={allowedButtonTypes}
            counts={counts}
            maxButtonText={maxButtonText}
            maxButtons={maxButtons}
            buttonErrors={buttonErrors}
            carouselErrors={carouselErrors}
            limitedTimeOfferTextMissing={limitedTimeOfferTextMissing}
            limitedTimeOfferTextTooLong={limitedTimeOfferTextTooLong}
            limitedTimeOfferCategoryInvalid={limitedTimeOfferCategoryInvalid}
            header={header}
            update={update}
            clampText={clampText}
            countChars={countChars}
            splitPhone={splitPhone}
            joinPhone={joinPhone}
          />
        )}

        {/* Step navigation */}
        <StepNavigation
          step={step}
          setStep={setStep}
          canContinue={canContinue}
          isConfigComplete={isConfigComplete}
          isContentComplete={isContentComplete}
          isButtonsValid={isButtonsValid}
          onFinish={onFinish}
          isFinishing={isFinishing}
          onSaveDraft={onSaveDraft}
          isSaving={isSaving}
          showDebug={showDebug}
          setShowDebug={setShowDebug}
          isHeaderFormatValid={isHeaderFormatValid}
          isHeaderVariableValid={isHeaderVariableValid}
          hasInvalidNamed={hasInvalidNamed}
          hasDuplicateNamed={hasDuplicateNamed}
          hasMissingPositional={hasMissingPositional}
          hasInvalidPositional={hasInvalidPositional}
          footerHasVariables={footerHasVariables}
          headerEdgeParameter={headerEdgeParameter}
          bodyEdgeParameter={bodyEdgeParameter}
          hasLengthErrors={hasLengthErrors}
          ltoHeaderInvalid={ltoHeaderInvalid}
          ltoFooterInvalid={ltoFooterInvalid}
          buttonErrors={buttonErrors}
          carouselErrors={carouselErrors}
          limitedTimeOfferCategoryInvalid={limitedTimeOfferCategoryInvalid}
          limitedTimeOfferTextTooLong={limitedTimeOfferTextTooLong}
          ltoCopyCodeMissing={ltoCopyCodeMissing}
          ltoCopyCodeTooLong={ltoCopyCodeTooLong}
        />
      </div>

      {/* Right sidebar - hidden on mobile, visible on lg+ */}
      <div className="hidden lg:block space-y-6 lg:sticky lg:top-6 self-start">
        <TemplatePreview spec={spec} headerMediaPreview={headerMediaPreview} />

        <Container variant="default" padding="md">
          <details>
            <summary className="cursor-pointer list-none select-none flex items-center justify-between">
              <div className="text-sm font-semibold text-[var(--ds-text-primary)]">Avancado</div>
              <div className="text-xs text-[var(--ds-text-muted)]">Abrir</div>
            </summary>

            <div className="mt-4">
              {canShowMediaSample ? (
                <div className="mb-4 space-y-2">
                  <div className="text-xs font-medium text-[var(--ds-text-secondary)]">Mídia do cabeçalho (opcional)</div>
                  <div className="text-xs text-[var(--ds-text-muted)]">
                    Se voce precisar, pode colar manualmente o identificador de midia usado como exemplo no template.
                  </div>
                  <Input
                    value={header?.example?.header_handle?.[0] || ''}
                    onChange={(e) => updateHeader({ ...header, example: { ...(header?.example || {}), header_handle: [e.target.value] } })}
                    className="bg-[var(--ds-bg-elevated)] border-[var(--ds-border-default)] text-[var(--ds-text-primary)]"
                    placeholder="Identificador (handle)"
                    disabled={isUploadingHeaderMedia}
                  />
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => setShowDebug((v) => !v)}
                className="w-full flex items-center justify-between text-left"
              >
                <div className="text-sm font-semibold text-[var(--ds-text-primary)]">Debug</div>
                <div className="text-xs text-[var(--ds-text-muted)]">{showDebug ? 'Ocultar' : 'Ver JSON'}</div>
              </button>
              {showDebug ? (
                <pre className="mt-3 text-xs text-[var(--ds-text-secondary)] font-mono whitespace-pre-wrap wrap-break-word">
                  {JSON.stringify(spec, null, 2)}
                </pre>
              ) : null}
            </div>
          </details>
        </Container>
      </div>

      {/* Floating preview button - visible only on mobile */}
      <FloatingPreviewButton onClick={() => setIsPreviewDrawerOpen(true)} />

      {/* Preview drawer for mobile */}
      <PreviewDrawer
        open={isPreviewDrawerOpen}
        onOpenChange={setIsPreviewDrawerOpen}
        spec={spec}
        headerMediaPreview={headerMediaPreview}
      />
    </div>
  )
}
