'use client'

/**
 * Login Page
 *
 * Login por senha única (single-tenant, MASTER_PASSWORD).
 * Visual corporativo compartilhado com o install wizard (CorporateBackground)
 * e whitelabel-aware: logo, nome e cor primária vêm de /api/auth/status.
 */

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { Lock, Eye, EyeOff, LogIn, AlertCircle, Info } from 'lucide-react'
import { CorporateBackground } from '@/components/brand/CorporateBackground'
import { ensureSameOriginPath, sanitizeRedirectPath } from '@/lib/auth-redirect'

/** Último filtro antes do router.push: o destino tem que ficar no mesmo origin. */
function sameOriginTarget(path: string): string {
  return ensureSameOriginPath(path, window.location.origin)
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Só caminhos relativos do próprio app (evita open redirect: //evil.com, /\evil.com,
  // /..//evil.com, https://...)
  const redirectTo = sanitizeRedirectPath(searchParams.get('redirect'))

  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  // Whitelabel: brand vem no payload de /api/auth/status (sem request extra)
  const [brand, setBrand] = useState<{ name: string; logoUrl: string; primaryColor: string } | null>(null)
  const [isLocalhost, setIsLocalhost] = useState(false)
  const [isConfigured, setIsConfigured] = useState(true)

  useEffect(() => {
    try {
      const host = window.location.hostname
      setIsLocalhost(host === 'localhost' || host === '127.0.0.1' || host === '::1')
    } catch {
      setIsLocalhost(false)
    }

    // Get company name from auth status
    fetch('/api/auth/status')
      .then(res => {
        return res.json()
      })
      .then(async (data) => {
        if (data.brand?.name) {
          setBrand(data.brand)
        }

        if (!data.isConfigured) {
          setIsConfigured(false)

          // Em localhost, não forçamos o fluxo da Vercel. Mostramos instrução para configurar .env.local.
          if (isLocalhost) {
            setError('Configuração local incompleta: defina MASTER_PASSWORD no .env.local e reinicie o servidor (npm run dev).')
            return
          }

          router.push('/install')
        } else if (!data.isSetup) {
          // Instalação incompleta - redireciona para o wizard
          router.push('/install/wizard')
        } else if (data.isAuthenticated) {
          router.push(sameOriginTarget(redirectTo))
        }
      })
      .catch((err) => {
        console.error('🔍 [LOGIN] Auth status error:', err)
      })
  }, [router, isLocalhost, redirectTo])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!password) {
      setError('Digite sua senha')
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao fazer login')
      }

      // Redirect to original destination or dashboard
      router.push(sameOriginTarget(redirectTo))
      router.refresh()

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao fazer login')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full max-w-sm">
      {/* Marca */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="text-center mb-8"
      >
        {brand ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brand.logoUrl}
            alt={brand.name}
            className="h-12 max-w-[220px] mx-auto mb-5 object-contain"
            onError={(e) => {
              // Fallback para o logo padrão se a URL customizada falhar
              const img = e.currentTarget
              if (img.dataset.fallback !== 'true') {
                img.dataset.fallback = 'true'
                img.src = '/brand/logo.svg'
              }
            }}
          />
        ) : (
          <div className="h-12 mb-5" aria-hidden="true" />
        )}
        <h1 className="text-2xl font-bold tracking-tight text-[var(--ds-text-primary)]">
          {brand ? (
            brand.name
          ) : (
            <span className="inline-block h-7 w-36 rounded-lg bg-[var(--ds-bg-elevated)] animate-pulse align-middle" aria-hidden="true" />
          )}
        </h1>
        <p className="text-sm text-[var(--ds-text-muted)] mt-1.5">Entre para continuar</p>
      </motion.div>

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: 'easeOut', delay: 0.1 }}
        className="relative rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)]/70 backdrop-blur-xl p-6 shadow-[0_16px_48px_-16px_rgba(0,0,0,0.6),0_0_40px_-16px_rgba(16,185,129,0.25)]"
      >
        {/* Hairline superior com a cor da marca */}
        <div
          aria-hidden="true"
          className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-primary-500/60 to-transparent"
        />

        {!isConfigured && isLocalhost && (
          <div className="mb-5 flex gap-3 rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] p-4">
            <Info className="w-4 h-4 mt-0.5 shrink-0 text-primary-400" />
            <div>
              <p className="text-sm font-medium text-[var(--ds-text-primary)]">Modo local</p>
              <p className="text-xs text-[var(--ds-text-secondary)] mt-1">
                Para destravar o login no localhost, defina <code className="bg-[var(--ds-bg-elevated)] px-1.5 py-0.5 rounded">MASTER_PASSWORD</code> no <code className="bg-[var(--ds-bg-elevated)] px-1.5 py-0.5 rounded">.env.local</code> e reinicie o dev server.
              </p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label
            htmlFor="login-password"
            className="block text-xs font-medium uppercase tracking-wider text-[var(--ds-text-muted)] mb-2"
          >
            Senha de acesso
          </label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ds-text-muted)]" />
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              name="password"
              autoComplete="current-password"
              className="w-full h-11 bg-[var(--ds-bg-surface)] border border-[var(--ds-border-default)] rounded-xl pl-10 pr-11 text-[var(--ds-text-primary)] placeholder:text-[var(--ds-text-muted)] transition-shadow focus:outline-none focus:ring-2 focus:ring-primary-500/60 focus:border-transparent"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md text-[var(--ds-text-muted)] hover:text-[var(--ds-text-secondary)] transition-colors"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 flex gap-2.5 rounded-xl border border-red-500/25 bg-red-500/10 p-3"
              role="alert"
            >
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-400" />
              <p className="text-sm text-red-300">{error}</p>
            </motion.div>
          )}

          <button
            type="submit"
            disabled={isLoading || (!isConfigured && isLocalhost)}
            className="w-full h-11 mt-6 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all hover:shadow-[var(--ds-glow-brand-md)] flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                Entrar
                <LogIn className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </motion.div>

      {/* Footer */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.4 }}
        className="text-center text-[var(--ds-text-muted)] text-xs mt-8"
      >
        {brand ? `${brand.name} © ${new Date().getFullYear()}` : ' '}
      </motion.p>
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="dark relative min-h-screen overflow-hidden bg-[var(--br-void-black)] flex items-center justify-center p-4">
      {/* Fundo corporativo compartilhado com o install wizard */}
      <CorporateBackground />

      <div className="relative z-10 w-full flex justify-center">
        <Suspense fallback={
          <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        }>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  )
}
