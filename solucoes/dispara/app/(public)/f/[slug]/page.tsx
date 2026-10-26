'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { InternationalPhoneInput } from '@/components/ui/international-phone-input'
import { CircleSlash } from 'lucide-react'

type PublicLeadForm = {
  id: string
  name: string
  slug: string
  isActive: boolean
  collectEmail?: boolean
  successMessage?: string | null
  fields?: Array<{
    key: string
    label: string
    type: 'text' | 'number' | 'date' | 'select'
    required?: boolean
    options?: string[]
  }>
}

export default function PublicLeadFormPage() {
  // Em Next.js 16, páginas Client podem não receber `params` da forma tradicional.
  // `useParams()` é a forma mais confiável para obter o slug no client.
  const params = useParams<{ slug?: string | string[] }>()
  const slug = useMemo(() => {
    const raw = params?.slug
    if (Array.isArray(raw)) return String(raw[0] || '')
    return String(raw || '')
  }, [params])

  const [form, setForm] = useState<PublicLeadForm | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('') // honeypot
  const [customFields, setCustomFields] = useState<Record<string, any>>({})

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const isInactive = form?.isActive === false && !loadError

  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      setLoadError(null)

      try {
        const resp = await fetch(`/api/public/lead-forms/${encodeURIComponent(slug)}`, {
          cache: 'no-store',
        })

        const payload = await resp.json().catch(() => ({}))

        // Se estiver desativado, a API retorna 403 com um payload que inclui nome/slug.
        if (!resp.ok) {
          if (resp.status === 403 && payload && typeof payload === 'object' && payload.isActive === false) {
            const data = payload as PublicLeadForm
            if (cancelled) return
            setForm(data)
            return
          }
          throw new Error(payload?.error || 'Formulário não encontrado')
        }

        const data = payload as PublicLeadForm
        if (cancelled) return

        setForm(data)
      } catch (e: any) {
        if (cancelled) return
        setLoadError(String(e?.message || 'Falha ao carregar formulário'))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    if (slug) load()
    else {
      setLoadError('Link inválido')
      setIsLoading(false)
    }

    return () => {
      cancelled = true
    }
  }, [slug])

  // Se o form não coleta email, evita manter valor antigo no state.
  useEffect(() => {
    if ((form?.collectEmail ?? true) === false) {
      setEmail('')
    }
  }, [form?.collectEmail])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    setSuccessMessage(null)

    if (!form || form.isActive === false) return

    setIsSubmitting(true)
    try {
      const resp = await fetch(`/api/public/lead-forms/${encodeURIComponent(slug)}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone,
          email: (form.collectEmail ?? true) ? (email.trim() ? email.trim() : null) : null,
          custom_fields: customFields,
          website,
        }),
      })

      const payload = await resp.json().catch(() => ({}))

      if (!resp.ok) {
        // Se vier mapa de erros do Zod, tenta mostrar algo legível.
        const zodDetails = payload?.details
        if (zodDetails && typeof zodDetails === 'object') {
          const firstKey = Object.keys(zodDetails)[0]
          const firstMsg = firstKey ? (zodDetails[firstKey]?.[0] as string | undefined) : undefined
          throw new Error(firstMsg || payload?.error || 'Dados inválidos')
        }

        throw new Error(payload?.error || 'Falha ao enviar')
      }

      setSuccessMessage(payload?.message || form.successMessage || 'Cadastro recebido! Obrigado.')
      setName('')
      setPhone('')
      setEmail('')
      setWebsite('')
      setCustomFields({})
    } catch (e: any) {
      setSubmitError(String(e?.message || 'Falha ao enviar formulário'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-0px)] bg-[var(--ds-bg-base)] px-3 py-6 text-[var(--ds-text-primary)] sm:px-4 sm:py-10">
      <div className="mx-auto w-full max-w-2xl">
        <Card className="gap-4 border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] py-5 backdrop-blur sm:gap-6 sm:py-6">
          <CardHeader className="px-4 sm:px-6">
            <CardTitle className="text-xl sm:text-2xl">
              <span className="inline-flex flex-wrap items-center gap-2">
                {isLoading ? 'Carregando…' : (form?.name || 'Formulário')}
                {isInactive ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--ds-text-secondary)]">
                    Desativado
                  </span>
                ) : null}
              </span>
            </CardTitle>
            <CardDescription className="text-[var(--ds-text-secondary)]">
              {isInactive
                ? 'Este formulário está temporariamente indisponível.'
                : 'Preencha seus dados para ser adicionado automaticamente na lista.'}
            </CardDescription>
          </CardHeader>

          <CardContent className="px-4 sm:px-6">
            {isInactive ? (
              <div className="space-y-3 sm:space-y-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-full border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] p-2">
                    <CircleSlash className="h-5 w-5 text-[var(--ds-text-secondary)]" />
                  </div>
                  <p className="text-sm text-[var(--ds-text-secondary)]">
                    Se você recebeu este link, solicite um novo ou confirme se foi reativado pelo responsável.
                  </p>
                </div>

                <p className="text-xs text-[var(--ds-text-muted)]">
                  Quando reativado, esta página se atualiza automaticamente.
                </p>
              </div>
            ) : null}

            {loadError ? (
              <div className="rounded-xl border border-[var(--ds-status-error)]/40 bg-[var(--ds-status-error-bg)] p-4 text-sm text-[var(--ds-status-error-text)]">
                {loadError}
              </div>
            ) : null}

            {successMessage ? (
              <div className="rounded-xl border border-[var(--ds-status-success)]/40 bg-[var(--ds-status-success-bg)] p-4 text-sm text-[var(--ds-status-success-text)]">
                {successMessage}
              </div>
            ) : null}

            {!loadError && !successMessage && (form?.isActive ?? true) ? (
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Seu nome"
                    className="bg-[var(--ds-bg-surface)] border-[var(--ds-border-default)]"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>Telefone (WhatsApp)</Label>
                  <InternationalPhoneInput
                    value={phone}
                    onChange={setPhone}
                    // Importante: manter SSR/CSR determinístico para evitar hydration mismatch
                    // (React error #418 em produção).
                    defaultCountry="br"
                    preferredCountries={["br", "us", "pt", "mx", "ar", "cl", "co", "es"]}
                  />
                </div>

                {(form?.collectEmail ?? true) ? (
                  <div className="space-y-2">
                    <Label htmlFor="email">Email (opcional)</Label>
                    <Input
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="voce@exemplo.com"
                      className="bg-[var(--ds-bg-surface)] border-[var(--ds-border-default)]"
                      type="email"
                    />
                  </div>
                ) : null}

                {(form?.fields || []).length > 0 ? (
                  <div className="space-y-4">
                    {(form?.fields || []).map((f) => {
                      const key = f.key
                      const value = customFields?.[key] ?? ''

                      if (f.type === 'select') {
                        return (
                          <div key={key} className="space-y-2">
                            <Label>
                              {f.label}{f.required ? ' *' : ''}
                            </Label>
                            <select
                              className="h-10 w-full rounded-md border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] px-3 text-sm text-[var(--ds-text-primary)]"
                              value={String(value)}
                              onChange={(e) =>
                                setCustomFields((prev) => ({ ...prev, [key]: e.target.value }))
                              }
                              required={!!f.required}
                            >
                              <option value="">Selecionar…</option>
                              {(f.options || []).map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          </div>
                        )
                      }

                      const inputType = f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'

                      return (
                        <div key={key} className="space-y-2">
                          <Label htmlFor={`cf_${key}`}>
                            {f.label}{f.required ? ' *' : ''}
                          </Label>
                          <Input
                            id={`cf_${key}`}
                            value={String(value)}
                            onChange={(e) => setCustomFields((prev) => ({ ...prev, [key]: e.target.value }))}
                            className="bg-[var(--ds-bg-surface)] border-[var(--ds-border-default)]"
                            type={inputType}
                            required={!!f.required}
                          />
                        </div>
                      )
                    })}
                  </div>
                ) : null}

                {/* Honeypot anti-spam (não mostrar) */}
                <div style={{ display: 'none' }}>
                  <Label htmlFor="website">Website</Label>
                  <Input id="website" value={website} onChange={(e) => setWebsite(e.target.value)} />
                </div>

                {submitError ? (
                  <div className="rounded-xl border border-[var(--ds-status-error)]/40 bg-[var(--ds-status-error-bg)] p-3 text-sm text-[var(--ds-status-error-text)]">
                    {submitError}
                  </div>
                ) : null}

                <Button type="submit" className="w-full" disabled={isSubmitting || isLoading || !form}>
                  {isSubmitting ? 'Enviando…' : 'Enviar'}
                </Button>

                <p className="text-xs text-[var(--ds-text-muted)]">
                  Ao enviar, você concorda em receber mensagens relacionadas ao conteúdo/curso.
                </p>
              </form>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
