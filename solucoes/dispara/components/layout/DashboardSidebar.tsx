'use client'

import { memo, useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  LogOut,
  X,
  LucideIcon,
} from 'lucide-react'
import { PrefetchLink } from '@/components/ui/PrefetchLink'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { cn } from '@/lib/utils'
import { useUnreadCount } from '@/hooks/useUnreadCount'

// =============================================================================
// TYPES
// =============================================================================

export interface NavItem {
  path: string
  label: string
  icon: LucideIcon
  badge?: string
  disabled?: boolean
  hidden?: boolean
}

export interface DashboardSidebarProps {
  pathname: string | null
  navItems: NavItem[]
  isSidebarExpanded: boolean
  isMobileMenuOpen: boolean
  isLoggingOut: boolean
  companyName: string | null
  /** Whitelabel: nome da marca do deploy (fallback 'Dispara') */
  brandName?: string
  /** Whitelabel: URL do logo do deploy (fallback /brand/logo.svg) */
  brandLogoUrl?: string
  onToggleSidebar: (expanded: boolean) => void
  onCloseMobileMenu: () => void
  onLogout: () => void
  onPrefetchRoute: (path: string) => void
}

// =============================================================================
// BRAND LOGO (com fallback de erro de imagem)
// =============================================================================

const DEFAULT_LOGO = '/brand/logo.svg'
const DEFAULT_LOGO_LIGHT = '/brand/logo-light.svg'

const BrandLogo = memo(function BrandLogo({
  logoUrl,
  name,
  className,
}: {
  logoUrl?: string
  name?: string
  className: string
}) {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // O wordmark padrão é branco (invisível no tema claro) — troca pela variante
  // de texto escuro quando o tema é light. Logos custom do whitelabel ficam
  // como o cliente enviou.
  const isDefault = !logoUrl || logoUrl === DEFAULT_LOGO
  const src =
    isDefault && mounted && resolvedTheme === 'light' ? DEFAULT_LOGO_LIGHT : logoUrl || DEFAULT_LOGO

  return (
    <img
      src={src}
      alt={name || 'Dispara'}
      className={className}
      onError={(e) => {
        // Fallback para o logo padrão se a URL customizada falhar
        const img = e.currentTarget
        if (img.dataset.fallback !== 'true') {
          img.dataset.fallback = 'true'
          img.src = DEFAULT_LOGO
        }
      }}
    />
  )
})

// =============================================================================
// INBOX BADGE (Isolado para evitar re-render do sidebar inteiro)
// =============================================================================

/**
 * Badge de contagem não lida do Inbox.
 * Consome useUnreadCount diretamente para evitar que mudanças na contagem
 * causem re-render de todo o sidebar.
 */
const InboxUnreadBadge = memo(function InboxUnreadBadge({
  variant = 'compact',
}: {
  variant?: 'compact' | 'expanded'
}) {
  const { count } = useUnreadCount()

  if (!count || count === 0) return null

  const displayCount = count > 99 ? '99+' : String(count)

  if (variant === 'compact') {
    return (
      <span
        className="absolute -right-1 -top-1 rounded-full bg-primary-500 px-1 py-[1px] text-[7px] font-semibold text-white"
        aria-label={`${count} mensagens não lidas`}
      >
        {displayCount}
      </span>
    )
  }

  return (
    <span
      className="ml-auto rounded-full bg-primary-500/15 px-1.5 py-[1px] text-[10px] font-semibold tabular-nums text-primary-700 dark:text-primary-300"
      aria-label={`${count} mensagens não lidas`}
    >
      {displayCount}
    </span>
  )
})

// =============================================================================
// NAV BADGE estático (BETA / NOVO)
// =============================================================================

function StaticBadge({ label }: { label: string }) {
  return (
    <span
      className="ml-auto rounded-md bg-primary-500/12 px-1.5 py-[2px] text-[9px] font-semibold uppercase tracking-wide text-primary-700 dark:text-primary-300"
      aria-label={label}
    >
      {label}
    </span>
  )
}

// =============================================================================
// COMPACT SIDEBAR (Icon-only)
// =============================================================================

const CompactSidebar = memo(function CompactSidebar({
  pathname,
  navItems,
  isSidebarExpanded,
  isLoggingOut,
  brandName,
  brandLogoUrl,
  onToggleSidebar,
  onLogout,
  onPrefetchRoute,
}: Pick<
  DashboardSidebarProps,
  | 'pathname'
  | 'navItems'
  | 'isSidebarExpanded'
  | 'isLoggingOut'
  | 'brandName'
  | 'brandLogoUrl'
  | 'onToggleSidebar'
  | 'onLogout'
  | 'onPrefetchRoute'
>) {
  return (
    <aside
      className={`hidden lg:flex fixed lg:static inset-y-0 left-0 z-50 w-14 bg-[var(--ds-bg-elevated)] border-r border-[var(--ds-border-subtle)] ${isSidebarExpanded ? 'lg:hidden' : ''}`}
      aria-label="Menu de navegação compacto"
    >
      <div className="flex h-full w-14 flex-col items-center py-3">
        <div
          className="flex h-9 w-9 items-center justify-center"
          role="img"
          aria-label={`Logo ${brandName || 'Dispara'}`}
        >
          <BrandLogo logoUrl={brandLogoUrl} name={brandName} className="h-8 object-contain" />
        </div>
        <button
          type="button"
          className="mt-2 hidden lg:flex h-7 w-7 items-center justify-center rounded-lg text-[var(--ds-text-muted)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 focus-visible:outline-offset-2"
          onClick={() => onToggleSidebar(true)}
          title="Expandir menu"
          aria-label="Expandir menu de navegação"
        >
          <ChevronRight size={14} aria-hidden="true" />
        </button>

        <nav className="mt-3 flex flex-1 flex-col items-center gap-1 border-t border-[var(--ds-border-subtle)] pt-3" aria-label="Menu principal">
          {navItems.map((item) => {
            const isDisabled = item.disabled
            const isActive = pathname === item.path
            const baseClassName = cn(
              'group relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-150',
              isDisabled
                ? 'opacity-40 cursor-not-allowed text-[var(--ds-text-muted)]'
                : isActive
                  ? 'bg-primary-500/12 text-primary-600 dark:text-primary-400'
                  : 'text-[var(--ds-text-secondary)] hover:bg-[var(--ds-bg-hover)] hover:text-[var(--ds-text-primary)] focus-visible:ring-2 focus-visible:ring-primary-500/50'
            )

            // Inbox usa badge dinâmico, outros usam badge estático
            const badge = item.path === '/inbox' ? (
              <InboxUnreadBadge variant="compact" />
            ) : null

            const content = (
              <>
                {/* Barra de acento do item ativo */}
                {isActive && (
                  <span
                    className="absolute -left-[10px] h-5 w-[3px] rounded-full bg-primary-500"
                    aria-hidden="true"
                  />
                )}
                <item.icon size={17} aria-hidden="true" />
                {badge}
              </>
            )

            if (isDisabled) {
              return (
                <span
                  key={item.path}
                  className={baseClassName}
                  title={item.badge ? `${item.label} (${item.badge})` : item.label}
                  aria-label={item.badge ? `${item.label} - ${item.badge}` : item.label}
                  aria-disabled="true"
                >
                  {content}
                </span>
              )
            }

            return (
              <PrefetchLink
                key={item.path}
                href={item.path}
                onMouseEnter={() => onPrefetchRoute(item.path)}
                aria-current={isActive ? 'page' : undefined}
                className={baseClassName}
                title={item.label}
                aria-label={item.label}
              >
                {content}
              </PrefetchLink>
            )
          })}
        </nav>

        <div className="flex flex-col items-center gap-1 border-t border-[var(--ds-border-subtle)] pt-2">
          <ThemeToggle variant="compact" />
          <button
            onClick={onLogout}
            disabled={isLoggingOut}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--ds-text-secondary)] transition-colors hover:bg-[var(--ds-bg-hover)] hover:text-[var(--ds-text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-500 focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Sair"
            aria-label="Sair da conta"
          >
            {isLoggingOut ? (
              <div
                className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--ds-text-muted)] border-t-[var(--ds-text-primary)]"
                role="status"
                aria-label="Saindo..."
              />
            ) : (
              <LogOut size={16} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </aside>
  )
})

// =============================================================================
// EXPANDED SIDEBAR (Full labels)
// =============================================================================

const ExpandedSidebar = memo(function ExpandedSidebar({
  pathname,
  navItems,
  isSidebarExpanded,
  isMobileMenuOpen,
  isLoggingOut,
  companyName,
  brandName,
  brandLogoUrl,
  onToggleSidebar,
  onCloseMobileMenu,
  onLogout,
  onPrefetchRoute,
}: DashboardSidebarProps) {
  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-50 w-56 bg-[var(--ds-bg-elevated)] border-r border-[var(--ds-border-subtle)] transform transition-transform duration-200 ease-in-out',
        // Mobile (< lg): show only when menu is open
        isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full',
        // Desktop (lg+): controlled by isSidebarExpanded, overrides mobile class
        isSidebarExpanded ? 'lg:translate-x-0' : 'lg:-translate-x-full'
      )}
      aria-label="Menu de navegação expandido"
    >
      <div className="flex h-full flex-col">
        {/* Cabeçalho: logo centralizado; controles absolutos à direita */}
        <div className="relative flex h-14 items-center justify-center border-b border-[var(--ds-border-subtle)] px-10">
          <div
            className="flex min-w-0 items-center justify-center"
            role="img"
            aria-label={`Logo ${brandName || 'Dispara'}`}
          >
            <BrandLogo logoUrl={brandLogoUrl} name={brandName} className="h-7 max-w-[136px] object-contain" />
          </div>
          <button
            type="button"
            className="absolute right-3 top-1/2 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--ds-text-muted)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] transition-colors lg:flex focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 focus-visible:outline-offset-2"
            onClick={() => onToggleSidebar(false)}
            title="Recolher menu"
            aria-label="Recolher menu de navegação"
          >
            <ChevronLeft size={14} aria-hidden="true" />
          </button>
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 lg:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 focus-visible:outline-offset-2"
            onClick={onCloseMobileMenu}
            aria-label="Fechar menu"
          >
            <X size={18} className="text-[var(--ds-text-secondary)]" aria-hidden="true" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto no-scrollbar px-3 py-4" aria-label="Menu principal">
          {/* Ação primária */}
          <PrefetchLink
            href="/campaigns/new"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary-500 hover:shadow-[var(--ds-glow-brand-sm)] focus-visible:ring-2 focus-visible:ring-primary-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ds-bg-elevated)]"
            aria-label="Criar nova campanha"
          >
            <Plus size={15} aria-hidden="true" />
            Nova campanha
          </PrefetchLink>

          {/* Navegação */}
          <p className="mt-6 mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-text-muted)]">
            Menu
          </p>
          <div className="space-y-0.5">
            {navItems.map((item) => {
              const isDisabled = item.disabled
              const isActive = pathname === item.path
              const baseClassName = cn(
                'relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] transition-colors duration-150',
                isDisabled
                  ? 'opacity-40 cursor-not-allowed text-[var(--ds-text-muted)]'
                  : isActive
                    ? 'bg-primary-500/10 font-medium text-primary-700 dark:text-primary-300'
                    : 'text-[var(--ds-text-secondary)] hover:bg-[var(--ds-bg-hover)] hover:text-[var(--ds-text-primary)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/50'
              )

              // Inbox usa badge dinâmico, outros usam badge estático
              const badge = item.path === '/inbox' ? (
                <InboxUnreadBadge variant="expanded" />
              ) : item.badge ? (
                <StaticBadge label={item.badge} />
              ) : null

              const content = (
                <>
                  {/* Barra de acento do item ativo */}
                  {isActive && (
                    <span
                      className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-primary-500"
                      aria-hidden="true"
                    />
                  )}
                  <item.icon
                    size={17}
                    className={isActive ? '' : 'text-[var(--ds-text-muted)]'}
                    aria-hidden="true"
                  />
                  <span className="truncate">{item.label}</span>
                  {badge}
                </>
              )

              if (isDisabled) {
                return (
                  <span key={item.path} className={baseClassName} aria-disabled="true">
                    {content}
                  </span>
                )
              }

              return (
                <PrefetchLink
                  key={item.path}
                  href={item.path}
                  onClick={onCloseMobileMenu}
                  onMouseEnter={() => onPrefetchRoute(item.path)}
                  aria-current={isActive ? 'page' : undefined}
                  className={baseClassName}
                >
                  {content}
                </PrefetchLink>
              )
            })}
          </div>
        </nav>

        {/* Rodapé: tema + usuário */}
        <div className="border-t border-[var(--ds-border-subtle)] px-3 py-3">
          <ThemeToggle variant="segmented" className="mb-2" />

          <button
            onClick={onLogout}
            disabled={isLoggingOut}
            className="flex w-full items-center gap-2.5 rounded-lg p-2 transition-colors hover:bg-[var(--ds-bg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-500 focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Sair da conta"
            aria-label="Sair da conta"
          >
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-500/12 text-sm font-semibold text-primary-700 dark:text-primary-300"
              aria-hidden="true"
            >
              {(companyName || brandName || 'Dispara').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-[13px] font-medium text-[var(--ds-text-primary)]">
                {companyName || brandName || 'Dispara'}
              </p>
              <p className="truncate text-[11px] text-[var(--ds-text-muted)]">Administrador</p>
            </div>
            {isLoggingOut ? (
              <div
                className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--ds-text-muted)] border-t-[var(--ds-text-primary)]"
                role="status"
                aria-label="Saindo..."
              />
            ) : (
              <LogOut
                size={15}
                className="text-[var(--ds-text-muted)] transition-colors"
                aria-hidden="true"
              />
            )}
          </button>

          <div
            className="mt-1.5 text-center font-mono text-[10px] text-[var(--ds-text-disabled)]"
            aria-label={`Versão ${process.env.NEXT_PUBLIC_APP_VERSION}`}
          >
            v{process.env.NEXT_PUBLIC_APP_VERSION}
          </div>
        </div>
      </div>
    </aside>
  )
})

// =============================================================================
// MAIN COMPONENT (exported)
// =============================================================================

/**
 * Dashboard Sidebar component - extracted from DashboardShell for isolation.
 * Memoized to prevent re-renders when parent state changes that don't affect sidebar.
 */
export const DashboardSidebar = memo(function DashboardSidebar(props: DashboardSidebarProps) {
  const {
    pathname,
    navItems,
    isSidebarExpanded,
    isLoggingOut,
    brandName,
    brandLogoUrl,
    onToggleSidebar,
    onLogout,
    onPrefetchRoute,
  } = props

  return (
    <>
      <CompactSidebar
        pathname={pathname}
        navItems={navItems}
        isSidebarExpanded={isSidebarExpanded}
        isLoggingOut={isLoggingOut}
        brandName={brandName}
        brandLogoUrl={brandLogoUrl}
        onToggleSidebar={onToggleSidebar}
        onLogout={onLogout}
        onPrefetchRoute={onPrefetchRoute}
      />
      <ExpandedSidebar {...props} />
    </>
  )
})

export default DashboardSidebar
