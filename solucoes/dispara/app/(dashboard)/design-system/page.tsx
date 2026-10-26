'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, Check, Palette, Type, Maximize, Layers, Square, Zap, LayoutGrid, Users, FileText, Plus, Trash2, Search, RefreshCw, ArrowLeft, ArrowRight, Settings, Calendar, ClipboardList } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDevMode } from '@/components/providers/DevModeProvider'

// =============================================================================
// COPY TO CLIPBOARD HELPER
// =============================================================================

function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className={cn(
        'p-1.5 rounded-md transition-all',
        'hover:bg-white/10 active:scale-95',
        'text-slate-500 hover:text-slate-300',
        className
      )}
      title="Copiar"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

// =============================================================================
// COLOR SWATCH COMPONENT
// =============================================================================

function ColorSwatch({
  name,
  value,
  cssVar,
  textDark = false,
}: {
  name: string
  value: string
  cssVar: string
  textDark?: boolean
}) {
  return (
    <div className="group relative">
      <div
        className="h-20 rounded-xl border border-white/10 flex items-end p-3 transition-transform hover:scale-105"
        style={{ background: value }}
      >
        <span className={cn('text-xs font-medium', textDark ? 'text-slate-900' : 'text-white')}>
          {name}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <code className="text-xs text-slate-500 font-mono">{value}</code>
        <CopyButton text={cssVar} />
      </div>
    </div>
  )
}

// =============================================================================
// SECTION HEADER
// =============================================================================

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType
  title: string
  description: string
}) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
          <Icon className="w-5 h-5" />
        </div>
        <h2 className="text-heading-2 text-white">{title}</h2>
      </div>
      <p className="text-slate-400 max-w-2xl">{description}</p>
    </div>
  )
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function DesignSystemPage() {
  const router = useRouter()
  const { isDevMode } = useDevMode()
  const [isChecking, setIsChecking] = useState(true)
  const [activeTab, setActiveTab] = useState<'colors' | 'typography' | 'spacing' | 'shadows' | 'borders' | 'motion' | 'patterns'>('colors')

  // Aguarda hydration do localStorage antes de verificar
  useEffect(() => {
    const timer = setTimeout(() => setIsChecking(false), 100)
    return () => clearTimeout(timer)
  }, [])

  // Redireciona se não estiver no dev mode
  useEffect(() => {
    if (!isChecking && !isDevMode) {
      router.replace('/')
    }
  }, [isChecking, isDevMode, router])

  // Loading state enquanto verifica
  if (isChecking || !isDevMode) {
    return null
  }

  const tabs = [
    { id: 'colors' as const, label: 'Cores', icon: Palette },
    { id: 'typography' as const, label: 'Tipografia', icon: Type },
    { id: 'spacing' as const, label: 'Espaçamento', icon: Maximize },
    { id: 'shadows' as const, label: 'Sombras', icon: Layers },
    { id: 'borders' as const, label: 'Bordas', icon: Square },
    { id: 'motion' as const, label: 'Motion', icon: Zap },
    { id: 'patterns' as const, label: 'Padrões', icon: LayoutGrid },
  ]

  return (
    <div className="min-h-screen p-8">
      {/* Header */}
      <div className="mb-12">
        <h1 className="text-heading-1 text-white mb-3">Design System</h1>
        <p className="text-slate-400 text-lg max-w-2xl">
          Documentação visual dos tokens de design do Dispara.
          Clique no botão de copiar para obter a variável CSS.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-10 flex-wrap">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all',
                activeTab === tab.id
                  ? 'bg-emerald-500/20 text-emerald-400 border border-primary-500/30'
                  : 'bg-slate-800/50 text-slate-400 border border-transparent hover:bg-slate-800 hover:text-slate-300'
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div className="space-y-16">
        {activeTab === 'colors' && <ColorsSection />}
        {activeTab === 'typography' && <TypographySection />}
        {activeTab === 'spacing' && <SpacingSection />}
        {activeTab === 'shadows' && <ShadowsSection />}
        {activeTab === 'borders' && <BordersSection />}
        {activeTab === 'motion' && <MotionSection />}
        {activeTab === 'patterns' && <PatternsSection />}
      </div>
    </div>
  )
}

// =============================================================================
// COLORS SECTION
// =============================================================================

function ColorsSection() {
  return (
    <div className="space-y-16">
      {/* Brand Colors */}
      <section>
        <SectionHeader
          icon={Palette}
          title="Cores da Marca"
          description="A paleta principal do Dispara."
        />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          <ColorSwatch name="Primary" value="#10b981" cssVar="var(--ds-brand-primary)" />
          <ColorSwatch name="Hover" value="#059669" cssVar="var(--ds-brand-primary-hover)" />
          <ColorSwatch name="Active" value="#047857" cssVar="var(--ds-brand-primary-active)" />
          <ColorSwatch name="Muted" value="rgba(16, 185, 129, 0.1)" cssVar="var(--ds-brand-primary-muted)" />
          <ColorSwatch name="Text" value="#34d399" cssVar="var(--ds-text-brand)" />
        </div>
      </section>

      {/* Background Colors */}
      <section>
        <SectionHeader
          icon={Palette}
          title="Backgrounds"
          description="Camadas de background para criar hierarquia visual."
        />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          <ColorSwatch name="Base" value="#09090b" cssVar="var(--ds-bg-base)" />
          <ColorSwatch name="Elevated" value="#18181b" cssVar="var(--ds-bg-elevated)" />
          <ColorSwatch name="Surface" value="#27272a" cssVar="var(--ds-bg-surface)" />
          <ColorSwatch name="Hover" value="rgba(255,255,255,0.05)" cssVar="var(--ds-bg-hover)" />
        </div>
      </section>

      {/* Text Colors */}
      <section>
        <SectionHeader
          icon={Palette}
          title="Texto"
          description="Hierarquia de cores para texto."
        />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          <ColorSwatch name="Primary" value="#f4f4f5" cssVar="var(--ds-text-primary)" textDark />
          <ColorSwatch name="Secondary" value="#a1a1aa" cssVar="var(--ds-text-secondary)" />
          <ColorSwatch name="Muted" value="#71717a" cssVar="var(--ds-text-muted)" />
          <ColorSwatch name="Disabled" value="#52525b" cssVar="var(--ds-text-disabled)" />
        </div>
      </section>

      {/* Status Colors */}
      <section>
        <SectionHeader
          icon={Palette}
          title="Status"
          description="Cores para feedback e estados."
        />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-slate-300">Success</h4>
            <ColorSwatch name="Base" value="#10b981" cssVar="var(--ds-status-success)" />
            <ColorSwatch name="Text" value="#34d399" cssVar="var(--ds-status-success-text)" />
            <ColorSwatch name="Bg" value="rgba(16, 185, 129, 0.1)" cssVar="var(--ds-status-success-bg)" />
          </div>
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-slate-300">Error</h4>
            <ColorSwatch name="Base" value="#ef4444" cssVar="var(--ds-status-error)" />
            <ColorSwatch name="Text" value="#f87171" cssVar="var(--ds-status-error-text)" />
            <ColorSwatch name="Bg" value="rgba(239, 68, 68, 0.1)" cssVar="var(--ds-status-error-bg)" />
          </div>
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-slate-300">Warning</h4>
            <ColorSwatch name="Base" value="#f59e0b" cssVar="var(--ds-status-warning)" />
            <ColorSwatch name="Text" value="#fbbf24" cssVar="var(--ds-status-warning-text)" />
            <ColorSwatch name="Bg" value="rgba(245, 158, 11, 0.1)" cssVar="var(--ds-status-warning-bg)" />
          </div>
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-slate-300">Info</h4>
            <ColorSwatch name="Base" value="#3b82f6" cssVar="var(--ds-status-info)" />
            <ColorSwatch name="Text" value="#60a5fa" cssVar="var(--ds-status-info-text)" />
            <ColorSwatch name="Bg" value="rgba(59, 130, 246, 0.1)" cssVar="var(--ds-status-info-bg)" />
          </div>
        </div>
      </section>

      {/* Emerald Scale */}
      <section>
        <SectionHeader
          icon={Palette}
          title="Escala Emerald (Primária)"
          description="Toda a escala de cores primárias disponível."
        />
        <div className="grid grid-cols-5 sm:grid-cols-11 gap-2">
          {[
            { name: '50', value: '#ecfdf5', dark: true },
            { name: '100', value: '#d1fae5', dark: true },
            { name: '200', value: '#a7f3d0', dark: true },
            { name: '300', value: '#6ee7b7', dark: true },
            { name: '400', value: '#34d399', dark: false },
            { name: '500', value: '#10b981', dark: false },
            { name: '600', value: '#059669', dark: false },
            { name: '700', value: '#047857', dark: false },
            { name: '800', value: '#065f46', dark: false },
            { name: '900', value: '#064e3b', dark: false },
            { name: '950', value: '#022c22', dark: false },
          ].map((color) => (
            <div key={color.name} className="group">
              <div
                className="h-14 rounded-lg border border-white/10 flex items-end justify-center pb-1"
                style={{ background: color.value }}
              >
                <span className={cn('text-[10px] font-medium', color.dark ? 'text-slate-900' : 'text-white')}>
                  {color.name}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

// =============================================================================
// TYPOGRAPHY SECTION
// =============================================================================

function TypographySection() {
  return (
    <div className="space-y-16">
      {/* Font Families */}
      <section>
        <SectionHeader
          icon={Type}
          title="Famílias de Fonte"
          description="As três famílias tipográficas do sistema."
        />
        <div className="grid md:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl bg-slate-900 border border-white/10">
            <p className="text-sm text-emerald-400 font-mono mb-2">--ds-font-display</p>
            <p className="font-display text-3xl text-white mb-3">Satoshi</p>
            <p className="text-slate-400 text-sm">Usada em headings e elementos de destaque. Geométrica e moderna.</p>
            <div className="mt-4 pt-4 border-t border-white/10">
              <p className="font-display text-xl text-white">ABCDEFGHIJKLM</p>
              <p className="font-display text-xl text-white">abcdefghijklm</p>
              <p className="font-display text-xl text-white">0123456789</p>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900 border border-white/10">
            <p className="text-sm text-emerald-400 font-mono mb-2">--ds-font-body</p>
            <p className="font-body text-3xl text-white mb-3">Inter</p>
            <p className="text-slate-400 text-sm">Usada em texto corrido e UI. Excelente legibilidade em telas.</p>
            <div className="mt-4 pt-4 border-t border-white/10">
              <p className="font-body text-xl text-white">ABCDEFGHIJKLM</p>
              <p className="font-body text-xl text-white">abcdefghijklm</p>
              <p className="font-body text-xl text-white">0123456789</p>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900 border border-white/10">
            <p className="text-sm text-emerald-400 font-mono mb-2">--ds-font-mono</p>
            <p className="font-mono text-3xl text-white mb-3">JetBrains Mono</p>
            <p className="text-slate-400 text-sm">Usada em código e números. Monospace com ligatures.</p>
            <div className="mt-4 pt-4 border-t border-white/10">
              <p className="font-mono text-xl text-white">ABCDEFGHIJKLM</p>
              <p className="font-mono text-xl text-white">abcdefghijklm</p>
              <p className="font-mono text-xl text-white">0123456789</p>
            </div>
          </div>
        </div>
      </section>

      {/* Text Styles */}
      <section>
        <SectionHeader
          icon={Type}
          title="Estilos de Texto"
          description="Presets prontos para usar com classes CSS."
        />
        <div className="space-y-6">
          {[
            { class: 'text-heading-1', label: 'Heading 1', example: 'Dashboard de Campanhas' },
            { class: 'text-heading-2', label: 'Heading 2', example: 'Estatísticas do Mês' },
            { class: 'text-heading-3', label: 'Heading 3', example: 'Contatos Ativos' },
            { class: 'text-heading-4', label: 'Heading 4', example: 'Configurações' },
            { class: 'text-body-large', label: 'Body Large', example: 'Gerencie suas campanhas de WhatsApp marketing de forma eficiente.' },
            { class: 'text-body', label: 'Body', example: 'Envie mensagens em massa para seus contatos com templates aprovados.' },
            { class: 'text-body-small', label: 'Body Small', example: 'Última atualização há 5 minutos.' },
            { class: 'text-label', label: 'Label', example: 'Nome da Campanha' },
            { class: 'text-caption', label: 'Caption', example: 'Máximo de 1000 caracteres' },
            { class: 'text-overline', label: 'Overline', example: 'NOVA FUNCIONALIDADE' },
          ].map((style) => (
            <div key={style.class} className="flex items-center gap-6 p-4 rounded-xl bg-slate-900/50 border border-white/5">
              <div className="w-32 shrink-0">
                <code className="text-xs text-emerald-400 font-mono">.{style.class}</code>
              </div>
              <div className="flex-1">
                <p className={cn(style.class, 'text-white')}>{style.example}</p>
              </div>
              <CopyButton text={style.class} />
            </div>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section>
        <SectionHeader
          icon={Type}
          title="Stats Display"
          description="Estilos especiais para números e métricas."
        />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { value: '12,847', label: 'MENSAGENS ENVIADAS' },
            { value: '98.5%', label: 'TAXA DE ENTREGA' },
            { value: '1,234', label: 'CONTATOS ATIVOS' },
            { value: '45', label: 'CAMPANHAS' },
          ].map((stat, i) => (
            <div key={i} className="p-6 rounded-2xl bg-slate-900 border border-white/10 text-center">
              <p className="text-stat text-white mb-2">{stat.value}</p>
              <p className="text-stat-label">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

// =============================================================================
// SPACING SECTION
// =============================================================================

function SpacingSection() {
  const spacingScale = [
    { name: '1', value: '0.25rem', px: '4px' },
    { name: '2', value: '0.5rem', px: '8px' },
    { name: '3', value: '0.75rem', px: '12px' },
    { name: '4', value: '1rem', px: '16px' },
    { name: '5', value: '1.25rem', px: '20px' },
    { name: '6', value: '1.5rem', px: '24px' },
    { name: '8', value: '2rem', px: '32px' },
    { name: '10', value: '2.5rem', px: '40px' },
    { name: '12', value: '3rem', px: '48px' },
    { name: '16', value: '4rem', px: '64px' },
  ]

  const gapPresets = [
    { name: 'tight', value: '0.25rem', css: '--ds-gap-tight' },
    { name: 'compact', value: '0.5rem', css: '--ds-gap-compact' },
    { name: 'default', value: '0.75rem', css: '--ds-gap-default' },
    { name: 'comfortable', value: '1rem', css: '--ds-gap-comfortable' },
    { name: 'spacious', value: '1.5rem', css: '--ds-gap-spacious' },
  ]

  return (
    <div className="space-y-16">
      {/* Spacing Scale */}
      <section>
        <SectionHeader
          icon={Maximize}
          title="Escala de Espaçamento"
          description="Sistema baseado em múltiplos de 4px para consistência."
        />
        <div className="space-y-3">
          {spacingScale.map((space) => (
            <div key={space.name} className="flex items-center gap-4">
              <div className="w-16 text-right">
                <code className="text-sm text-emerald-400 font-mono">{space.name}</code>
              </div>
              <div
                className="h-6 bg-emerald-500/30 border border-primary-500/50 rounded"
                style={{ width: space.value }}
              />
              <div className="flex items-center gap-3 text-sm">
                <span className="text-slate-300">{space.value}</span>
                <span className="text-slate-500">({space.px})</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Gap Presets */}
      <section>
        <SectionHeader
          icon={Maximize}
          title="Presets de Gap"
          description="Variáveis CSS prontas para espaçamentos semânticos."
        />
        <div className="grid md:grid-cols-5 gap-4">
          {gapPresets.map((preset) => (
            <div key={preset.name} className="p-4 rounded-xl bg-slate-900 border border-white/10">
              <div className="flex items-center gap-2 mb-3">
                <code className="text-xs text-emerald-400 font-mono">{preset.name}</code>
                <CopyButton text={`var(${preset.css})`} />
              </div>
              <div className="flex gap-1" style={{ gap: preset.value }}>
                <div className="w-6 h-6 rounded bg-emerald-500/30 border border-primary-500/50" />
                <div className="w-6 h-6 rounded bg-emerald-500/30 border border-primary-500/50" />
                <div className="w-6 h-6 rounded bg-emerald-500/30 border border-primary-500/50" />
              </div>
              <p className="text-xs text-slate-500 mt-2">{preset.value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Component Spacing */}
      <section>
        <SectionHeader
          icon={Maximize}
          title="Espaçamento de Componentes"
          description="Valores semânticos para diferentes contextos."
        />
        <div className="grid md:grid-cols-2 gap-6">
          {[
            { name: 'Icon Gap', css: '--ds-space-component-icon-gap', value: '0.25rem', desc: 'Entre ícone e texto' },
            { name: 'Inline Gap', css: '--ds-space-component-inline-gap', value: '0.5rem', desc: 'Elementos inline' },
            { name: 'Input Padding', css: '--ds-space-component-input-padding', value: '0.75rem', desc: 'Padding de inputs' },
            { name: 'Card Padding', css: '--ds-space-component-card-padding', value: '1rem', desc: 'Padding de cards' },
            { name: 'Section Padding', css: '--ds-space-component-section-padding', value: '1.5rem', desc: 'Padding de seções' },
            { name: 'Page Margin', css: '--ds-space-layout-page-margin', value: '2rem', desc: 'Margem de página' },
          ].map((item) => (
            <div key={item.name} className="flex items-center justify-between p-4 rounded-xl bg-slate-900/50 border border-white/5">
              <div>
                <p className="text-white font-medium">{item.name}</p>
                <p className="text-xs text-slate-500">{item.desc}</p>
              </div>
              <div className="flex items-center gap-3">
                <code className="text-xs text-emerald-400 font-mono">{item.value}</code>
                <CopyButton text={`var(${item.css})`} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

// =============================================================================
// SHADOWS SECTION
// =============================================================================

function ShadowsSection() {
  const elevations = [
    { name: 'xs', css: '--ds-shadow-xs', desc: 'Sutil, separação leve' },
    { name: 'sm', css: '--ds-shadow-sm', desc: 'Cards, dropdowns' },
    { name: 'md', css: '--ds-shadow-md', desc: 'Cards elevados' },
    { name: 'lg', css: '--ds-shadow-lg', desc: 'Modais, sheets' },
    { name: 'xl', css: '--ds-shadow-xl', desc: 'Overlays importantes' },
    { name: '2xl', css: '--ds-shadow-2xl', desc: 'Destaque máximo' },
  ]

  const glows = [
    { name: 'Brand SM', css: '--ds-glow-brand-sm', color: 'emerald' },
    { name: 'Brand MD', css: '--ds-glow-brand-md', color: 'emerald' },
    { name: 'Brand Ring', css: '--ds-glow-brand-ring', color: 'emerald' },
    { name: 'Error Ring', css: '--ds-glow-error-ring', color: 'red' },
  ]

  return (
    <div className="space-y-16">
      {/* Elevations */}
      <section>
        <SectionHeader
          icon={Layers}
          title="Elevações"
          description="Sistema de sombras para criar hierarquia visual."
        />
        <div className="grid md:grid-cols-3 gap-6">
          {elevations.map((shadow) => (
            <div
              key={shadow.name}
              className="p-6 rounded-2xl bg-slate-900 border border-white/10"
              style={{ boxShadow: `var(${shadow.css})` }}
            >
              <div className="flex items-center justify-between mb-2">
                <code className="text-sm text-emerald-400 font-mono">{shadow.name}</code>
                <CopyButton text={`var(${shadow.css})`} />
              </div>
              <p className="text-xs text-slate-500">{shadow.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Glows */}
      <section>
        <SectionHeader
          icon={Layers}
          title="Efeitos Glow"
          description="Sombras coloridas para destaque e feedback."
        />
        <div className="grid md:grid-cols-4 gap-6">
          {glows.map((glow) => (
            <div
              key={glow.name}
              className={cn(
                'p-6 rounded-2xl border',
                glow.color === 'emerald' ? 'bg-emerald-500/10 border-primary-500/30' : 'bg-red-500/10 border-red-500/30'
              )}
              style={{ boxShadow: `var(${glow.css})` }}
            >
              <div className="flex items-center justify-between mb-2">
                <code className="text-sm text-emerald-400 font-mono">{glow.name}</code>
                <CopyButton text={`var(${glow.css})`} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Composite Shadows */}
      <section>
        <SectionHeader
          icon={Layers}
          title="Sombras Compostas"
          description="Combinações prontas para componentes específicos."
        />
        <div className="grid md:grid-cols-2 gap-6">
          {[
            { name: 'Card', css: '--ds-shadow-card' },
            { name: 'Card Hover', css: '--ds-shadow-card-hover' },
            { name: 'Button', css: '--ds-shadow-button' },
            { name: 'Button Primary', css: '--ds-shadow-button-primary' },
            { name: 'Modal', css: '--ds-shadow-modal' },
            { name: 'Dropdown', css: '--ds-shadow-dropdown' },
          ].map((shadow) => (
            <div
              key={shadow.name}
              className="p-6 rounded-2xl bg-slate-800"
              style={{ boxShadow: `var(${shadow.css})` }}
            >
              <div className="flex items-center justify-between">
                <code className="text-sm text-emerald-400 font-mono">{shadow.name}</code>
                <CopyButton text={`var(${shadow.css})`} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

// =============================================================================
// BORDERS SECTION
// =============================================================================

function BordersSection() {
  const radiusScale = [
    { name: 'none', value: '0px' },
    { name: 'xs', value: '0.125rem' },
    { name: 'sm', value: '0.25rem' },
    { name: 'md', value: '0.375rem' },
    { name: 'lg', value: '0.5rem' },
    { name: 'xl', value: '0.75rem' },
    { name: '2xl', value: '1rem' },
    { name: '3xl', value: '1.25rem' },
    { name: 'full', value: '9999px' },
  ]

  return (
    <div className="space-y-16">
      {/* Border Radius */}
      <section>
        <SectionHeader
          icon={Square}
          title="Border Radius"
          description="Escala de arredondamento para diferentes contextos."
        />
        <div className="grid grid-cols-3 md:grid-cols-9 gap-4">
          {radiusScale.map((radius) => (
            <div key={radius.name} className="text-center">
              <div
                className="w-16 h-16 mx-auto bg-emerald-500/20 border-2 border-primary-500/50 mb-2"
                style={{ borderRadius: radius.value }}
              />
              <code className="text-xs text-emerald-400 font-mono block">{radius.name}</code>
              <span className="text-[10px] text-slate-500">{radius.value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Border Colors */}
      <section>
        <SectionHeader
          icon={Square}
          title="Cores de Borda"
          description="Três níveis de intensidade para diferentes contextos."
        />
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { name: 'Subtle', css: '--ds-border-subtle', opacity: '5%' },
            { name: 'Default', css: '--ds-border-default', opacity: '10%' },
            { name: 'Strong', css: '--ds-border-strong', opacity: '15%' },
          ].map((border) => (
            <div
              key={border.name}
              className="p-6 rounded-xl bg-slate-900"
              style={{ border: `1px solid var(${border.css})` }}
            >
              <div className="flex items-center justify-between mb-2">
                <code className="text-sm text-emerald-400 font-mono">{border.name}</code>
                <CopyButton text={`var(${border.css})`} />
              </div>
              <p className="text-xs text-slate-500">rgba(255, 255, 255, {border.opacity})</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

// =============================================================================
// MOTION SECTION
// =============================================================================

function MotionSection() {
  const [playingAnimation, setPlayingAnimation] = useState<string | null>(null)

  const playAnimation = (name: string) => {
    setPlayingAnimation(name)
    setTimeout(() => setPlayingAnimation(null), 1000)
  }

  const durations = [
    { name: 'fastest', value: '75ms', css: '--ds-duration-fastest' },
    { name: 'fast', value: '150ms', css: '--ds-duration-fast' },
    { name: 'normal', value: '200ms', css: '--ds-duration-normal' },
    { name: 'slow', value: '300ms', css: '--ds-duration-slow' },
    { name: 'slower', value: '500ms', css: '--ds-duration-slower' },
  ]

  const easings = [
    { name: 'ease-in', css: '--ds-ease-in', desc: 'Início lento' },
    { name: 'ease-out', css: '--ds-ease-out', desc: 'Fim lento (UI)' },
    { name: 'ease-in-out', css: '--ds-ease-in-out', desc: 'Suave' },
    { name: 'spring', css: '--ds-ease-spring', desc: 'Bounce' },
  ]

  const animations = [
    { name: 'fadeIn', class: 'animate-fadeIn' },
    { name: 'scaleIn', class: 'animate-scaleIn' },
    { name: 'slideInTop', class: 'animate-slideInTop' },
    { name: 'slideInBottom', class: 'animate-slideInBottom' },
    { name: 'shake', class: 'animate-shake' },
    { name: 'bounce', class: 'animate-bounce' },
  ]

  return (
    <div className="space-y-16">
      {/* Durations */}
      <section>
        <SectionHeader
          icon={Zap}
          title="Durações"
          description="Tempos padronizados para animações e transições."
        />
        <div className="space-y-4">
          {durations.map((dur) => (
            <div key={dur.name} className="flex items-center gap-4 p-4 rounded-xl bg-slate-900/50 border border-white/5">
              <div className="w-24">
                <code className="text-sm text-emerald-400 font-mono">{dur.name}</code>
              </div>
              <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full animate-pulse"
                  style={{ width: `${parseInt(dur.value) / 5}%` }}
                />
              </div>
              <div className="w-20 text-right">
                <span className="text-sm text-slate-400">{dur.value}</span>
              </div>
              <CopyButton text={`var(${dur.css})`} />
            </div>
          ))}
        </div>
      </section>

      {/* Easings */}
      <section>
        <SectionHeader
          icon={Zap}
          title="Easings"
          description="Curvas de aceleração para movimentos naturais."
        />
        <div className="grid md:grid-cols-4 gap-6">
          {easings.map((easing) => (
            <div key={easing.name} className="p-4 rounded-xl bg-slate-900 border border-white/10">
              <div className="flex items-center justify-between mb-2">
                <code className="text-xs text-emerald-400 font-mono">{easing.name}</code>
                <CopyButton text={`var(${easing.css})`} />
              </div>
              <p className="text-xs text-slate-500 mb-3">{easing.desc}</p>
              <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="w-1/2 h-full bg-emerald-500 rounded-full"
                  style={{
                    animation: 'slideRight 2s infinite',
                    animationTimingFunction: `var(${easing.css})`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Animation Demos */}
      <section>
        <SectionHeader
          icon={Zap}
          title="Animações"
          description="Clique para ver a animação em ação."
        />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {animations.map((anim) => (
            <button
              key={anim.name}
              onClick={() => playAnimation(anim.name)}
              className="p-6 rounded-xl bg-slate-900 border border-white/10 hover:border-primary-500/30 transition-colors"
            >
              <div
                className={cn(
                  'w-12 h-12 mx-auto mb-3 rounded-xl bg-emerald-500/20 border border-primary-500/50',
                  playingAnimation === anim.name && anim.class
                )}
              />
              <code className="text-xs text-emerald-400 font-mono">.{anim.class}</code>
            </button>
          ))}
        </div>
      </section>

      {/* Continuous Animations */}
      <section>
        <SectionHeader
          icon={Zap}
          title="Animações Contínuas"
          description="Animações que rodam infinitamente."
        />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { name: 'spin', class: 'animate-spin' },
            { name: 'pulse', class: 'animate-pulse' },
            { name: 'ping', class: 'animate-ping' },
            { name: 'glowPulse', class: 'animate-glowPulse' },
          ].map((anim) => (
            <div key={anim.name} className="p-6 rounded-xl bg-slate-900 border border-white/10 text-center">
              <div className="relative w-12 h-12 mx-auto mb-3">
                <div
                  className={cn(
                    'w-full h-full rounded-xl bg-emerald-500/20 border border-primary-500/50',
                    anim.class
                  )}
                />
              </div>
              <code className="text-xs text-emerald-400 font-mono">.{anim.class}</code>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

// =============================================================================
// PATTERNS SECTION
// =============================================================================

function PatternsSection() {
  return (
    <div className="space-y-16">
      {/* Intro */}
      <section>
        <SectionHeader
          icon={LayoutGrid}
          title="Padrões de Layout"
          description="Componentes compostos para garantir consistência em páginas de listagem."
        />
        <div className="p-6 rounded-2xl bg-slate-900 border border-white/10">
          <p className="text-slate-300 mb-4">
            Os padrões definem <strong>como usar</strong> os tokens do Design System para criar interfaces consistentes.
            Import os componentes de <code className="text-emerald-400">@/components/patterns</code>.
          </p>
          <pre className="bg-slate-950/60 p-4 rounded-xl text-sm font-mono overflow-x-auto">
            <code className="text-slate-300">{`import {
  ListPageLayout,
  StatsCard, StatsRow,
  FilterBar, ResultsInfo,
  Pagination,
  PrimaryAction, SecondaryAction
} from '@/components/patterns'`}</code>
          </pre>
        </div>
      </section>

      {/* Page Layout */}
      <section>
        <SectionHeader
          icon={LayoutGrid}
          title="Estrutura de Página de Listagem"
          description="Ordem e hierarquia dos elementos em páginas de listagem."
        />
        <div className="grid md:grid-cols-2 gap-6">
          <div className="p-6 rounded-2xl bg-slate-900 border border-white/10 space-y-4">
            <h4 className="text-white font-medium">Estrutura Padrão</h4>
            <div className="space-y-2 text-sm">
              {[
                { order: '1', name: 'PageHeader', desc: 'Título + Descrição + Ações' },
                { order: '2', name: 'Tabs', desc: 'Navegação entre sub-seções (opcional)' },
                { order: '3', name: 'StatsRow', desc: 'Cards de estatísticas' },
                { order: '4', name: 'FilterBar', desc: 'Search + Filtros + Refresh' },
                { order: '5', name: 'Content', desc: 'Tabela ou Grid de dados' },
                { order: '6', name: 'Pagination', desc: 'Navegação entre páginas' },
              ].map((item) => (
                <div key={item.order} className="flex items-center gap-3 p-2 rounded-lg bg-slate-800/50">
                  <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center justify-center">
                    {item.order}
                  </span>
                  <div>
                    <code className="text-emerald-400 text-xs">{item.name}</code>
                    <p className="text-slate-500 text-xs">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="p-6 rounded-2xl bg-slate-900 border border-white/10">
            <h4 className="text-white font-medium mb-4">Exemplo de Código</h4>
            <pre className="bg-slate-950/60 p-4 rounded-xl text-xs font-mono overflow-x-auto max-h-80 overflow-y-auto">
              <code className="text-slate-300">{`<ListPageLayout
  title="Contatos"
  description="Gerencie sua audiência"
  actions={
    <ActionGroup>
      <SecondaryAction icon={Upload}>
        Importar
      </SecondaryAction>
      <PrimaryAction icon={Plus}>
        Novo Contato
      </PrimaryAction>
    </ActionGroup>
  }
  stats={
    <StatsRow columns={3}>
      <StatsCard
        icon={Users}
        label="Total"
        value={1234}
      />
      <StatsCard
        icon={UserCheck}
        label="Ativos"
        value={1100}
        variant="success"
      />
      <StatsCard
        icon={UserX}
        label="Inativos"
        value={134}
        variant="warning"
      />
    </StatsRow>
  }
  filters={
    <FilterBar
      searchValue={search}
      onSearchChange={setSearch}
      filters={[...]}
      onRefresh={refetch}
    />
  }
>
  <TableContainer>
    ...
  </TableContainer>
  <Pagination ... />
</ListPageLayout>`}</code>
            </pre>
          </div>
        </div>
      </section>

      {/* Button Hierarchy */}
      <section>
        <SectionHeader
          icon={LayoutGrid}
          title="Hierarquia de Botões"
          description="Use o tipo correto de botão para cada ação."
        />
        <div className="grid md:grid-cols-4 gap-4">
          {[
            {
              name: 'PrimaryAction',
              desc: 'Ação principal da página',
              example: '+ Novo Item',
              style: 'bg-emerald-500 text-white',
            },
            {
              name: 'SecondaryAction',
              desc: 'Ações secundárias',
              example: 'Importar, Exportar',
              style: 'bg-slate-950/60 border border-white/10 text-slate-300',
            },
            {
              name: 'DestructiveAction',
              desc: 'Ações perigosas',
              example: 'Excluir',
              style: 'bg-red-500/10 border border-red-500/30 text-red-400',
            },
            {
              name: 'HighlightAction',
              desc: 'Destaque especial',
              example: 'Oferta, Promo',
              style: 'bg-amber-500 text-black',
            },
          ].map((btn) => (
            <div key={btn.name} className="p-4 rounded-xl bg-slate-900 border border-white/10">
              <code className="text-xs text-emerald-400 font-mono block mb-2">{btn.name}</code>
              <div className={cn('px-4 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2 mb-3', btn.style)}>
                {btn.example}
              </div>
              <p className="text-xs text-slate-500">{btn.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Stats Cards */}
      <section>
        <SectionHeader
          icon={LayoutGrid}
          title="Cards de Estatísticas"
          description="Use StatsCard para exibir métricas numéricas em todas as páginas de listagem."
        />
        <div className="grid md:grid-cols-4 gap-4">
          {[
            { icon: Users, label: 'Total', value: '1,234', variant: 'default' as const },
            { icon: FileText, label: 'Ativos', value: '980', variant: 'success' as const },
            { icon: Trash2, label: 'Excluídos', value: '54', variant: 'error' as const },
            { icon: RefreshCw, label: 'Pendentes', value: '200', variant: 'warning' as const },
          ].map((stat) => (
            <div
              key={stat.label}
              className="flex items-center gap-4 p-5 rounded-2xl bg-slate-900/60 border border-white/10"
            >
              <div className={cn(
                'p-3 rounded-xl',
                stat.variant === 'success' && 'bg-emerald-500/10',
                stat.variant === 'error' && 'bg-red-500/10',
                stat.variant === 'warning' && 'bg-amber-500/10',
                stat.variant === 'default' && 'bg-emerald-500/10',
              )}>
                <stat.icon className={cn(
                  'w-5 h-5',
                  stat.variant === 'success' && 'text-emerald-400',
                  stat.variant === 'error' && 'text-red-400',
                  stat.variant === 'warning' && 'text-amber-400',
                  stat.variant === 'default' && 'text-emerald-400',
                )} />
              </div>
              <div>
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider block">
                  {stat.label}
                </span>
                <span className="text-2xl font-bold text-white">{stat.value}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Filter Bar */}
      <section>
        <SectionHeader
          icon={LayoutGrid}
          title="Barra de Filtros"
          description="Padrão: Search à esquerda + Dropdowns + Refresh à direita."
        />
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center flex-1">
              {/* Search */}
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Buscar..."
                  disabled
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950/60 border border-white/10 text-sm text-white placeholder:text-slate-500"
                />
              </div>
              {/* Dropdowns */}
              <div className="flex gap-2">
                <button className="px-4 py-2.5 rounded-xl bg-slate-950/60 border border-white/10 text-sm text-slate-300 min-w-[140px] text-left">
                  Todos Status ▾
                </button>
                <button className="px-4 py-2.5 rounded-xl bg-slate-950/60 border border-white/10 text-sm text-slate-300 min-w-[140px] text-left">
                  Todas Tags ▾
                </button>
              </div>
            </div>
            {/* Refresh */}
            <button className="p-2.5 rounded-lg bg-slate-950/60 border border-white/10 text-slate-400 hover:text-white">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-3 text-sm text-slate-500">
            Mostrando <span className="text-emerald-400 font-medium">10</span> de{' '}
            <span className="text-white font-medium">1.234</span> itens
          </div>
        </div>
      </section>

      {/* Rules */}
      <section>
        <SectionHeader
          icon={LayoutGrid}
          title="Regras de Consistência (Listagens)"
          description="Siga estas regras para manter a interface consistente."
        />
        <div className="grid md:grid-cols-2 gap-6">
          <div className="p-6 rounded-2xl bg-emerald-500/5 border border-primary-500/20">
            <h4 className="text-emerald-400 font-medium mb-4 flex items-center gap-2">
              <Check className="w-5 h-5" /> FAÇA
            </h4>
            <ul className="space-y-2 text-sm text-slate-300">
              <li>✓ Use <code className="text-emerald-400">PrimaryAction</code> para a ação principal</li>
              <li>✓ Posicione ações principais à <strong>direita</strong> do header</li>
              <li>✓ Inclua <code className="text-emerald-400">StatsRow</code> em todas as listagens</li>
              <li>✓ Use <code className="text-emerald-400">FilterBar</code> com Search + Dropdowns</li>
              <li>✓ Mantenha a ordem: Header → Stats → Filters → Content</li>
              <li>✓ Use <code className="text-emerald-400">Pagination</code> para listas longas</li>
            </ul>
          </div>
          <div className="p-6 rounded-2xl bg-red-500/5 border border-red-500/20">
            <h4 className="text-red-400 font-medium mb-4 flex items-center gap-2">
              <Trash2 className="w-5 h-5" /> NÃO FAÇA
            </h4>
            <ul className="space-y-2 text-sm text-slate-300">
              <li>✗ Não crie layouts customizados por página</li>
              <li>✗ Não posicione ações à esquerda do título</li>
              <li>✗ Não use cores diferentes para botões primários</li>
              <li>✗ Não misture Tabs com Pills na mesma página</li>
              <li>✗ Não omita StatsRow em páginas de listagem</li>
              <li>✗ Não crie componentes de filtro customizados</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="border-t border-white/10 my-12" />

      {/* Wizard Pattern - Title */}
      <section>
        <SectionHeader
          icon={ClipboardList}
          title="Padrões de Wizard/Formulário"
          description="Componentes para páginas de criação multi-step (ex: Nova Campanha)."
        />
        <div className="p-6 rounded-2xl bg-slate-900 border border-white/10">
          <p className="text-slate-300 mb-4">
            Wizards são usados para formulários complexos divididos em passos.
            Import os componentes de <code className="text-emerald-400">@/components/patterns</code>.
          </p>
          <pre className="bg-slate-950/60 p-4 rounded-xl text-sm font-mono overflow-x-auto">
            <code className="text-slate-300">{`import {
  WizardPageLayout,
  WizardContent,
  WizardActions,
  Stepper,
  FormSection,
  FormField,
  FormRow,
  SummaryPanel,
  SummaryItem,
  SummaryPreview
} from '@/components/patterns'`}</code>
          </pre>
        </div>
      </section>

      {/* Wizard Structure */}
      <section>
        <SectionHeader
          icon={ClipboardList}
          title="Estrutura de Página de Wizard"
          description="Layout padrão para criação/edição multi-step."
        />
        <div className="grid md:grid-cols-2 gap-6">
          <div className="p-6 rounded-2xl bg-slate-900 border border-white/10 space-y-4">
            <h4 className="text-white font-medium">Estrutura Padrão</h4>
            <div className="space-y-2 text-sm">
              {[
                { order: '1', name: 'Back Button', desc: '← Voltar para listagem' },
                { order: '2', name: 'PageHeader', desc: 'Título + Descrição' },
                { order: '3', name: 'Stepper', desc: 'Navegação entre passos' },
                { order: '4', name: 'Two Columns', desc: 'Form (2/3) + Summary (1/3)' },
                { order: '5', name: 'FormSections', desc: 'Grupos de campos relacionados' },
                { order: '6', name: 'WizardActions', desc: 'Voltar | Próximo/Salvar' },
              ].map((item) => (
                <div key={item.order} className="flex items-center gap-3 p-2 rounded-lg bg-slate-800/50">
                  <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center justify-center">
                    {item.order}
                  </span>
                  <div>
                    <code className="text-emerald-400 text-xs">{item.name}</code>
                    <p className="text-slate-500 text-xs">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="p-6 rounded-2xl bg-slate-900 border border-white/10">
            <h4 className="text-white font-medium mb-4">Exemplo de Código</h4>
            <pre className="bg-slate-950/60 p-4 rounded-xl text-xs font-mono overflow-x-auto max-h-80 overflow-y-auto">
              <code className="text-slate-300">{`<WizardPageLayout
  title="Nova Campanha"
  backHref="/campaigns"
  steps={[
    { id: 1, label: 'Configuração' },
    { id: 2, label: 'Público' },
    { id: 3, label: 'Agendamento' },
  ]}
  currentStep={step}
  onStepClick={setStep}
  summary={
    <SummaryPanel title="Resumo">
      <SummaryItem
        label="Template"
        value={template?.name}
      />
      <SummaryItem
        label="Contatos"
        value="1.234"
      />
      <SummaryPreview>
        <TemplatePreview ... />
      </SummaryPreview>
    </SummaryPanel>
  }
  actions={
    <WizardActions
      onBack={handleBack}
      onNext={handleNext}
      isLastStep={step === 3}
    />
  }
>
  <WizardContent>
    <FormSection
      title="Template"
      description="Escolha..."
    >
      <TemplateSelector />
    </FormSection>
  </WizardContent>
</WizardPageLayout>`}</code>
            </pre>
          </div>
        </div>
      </section>

      {/* Stepper Demo */}
      <section>
        <SectionHeader
          icon={ClipboardList}
          title="Stepper"
          description="Indicador de progresso para navegação entre passos."
        />
        <div className="p-6 rounded-2xl bg-slate-900 border border-white/10">
          <div className="flex items-center gap-2 mb-6">
            {[
              { id: 1, label: 'Configuração', completed: true },
              { id: 2, label: 'Público', active: true },
              { id: 3, label: 'Validação' },
              { id: 4, label: 'Agendamento' },
            ].map((step, index, arr) => (
              <div key={step.id} className="contents">
                <button
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-xl transition-all border',
                    step.active && 'bg-emerald-500/10 border-primary-500/30 text-emerald-400',
                    step.completed && 'bg-slate-800/50 border-white/10 text-slate-300',
                    !step.active && !step.completed && 'bg-slate-900/50 border-white/5 text-slate-500'
                  )}
                >
                  <div
                    className={cn(
                      'flex items-center justify-center w-8 h-8 rounded-full font-semibold text-sm',
                      step.active && 'bg-emerald-500 text-white',
                      step.completed && 'bg-emerald-500/20 text-emerald-400',
                      !step.active && !step.completed && 'bg-slate-800 text-slate-500'
                    )}
                  >
                    {step.completed ? <Check className="w-4 h-4" /> : step.id}
                  </div>
                  <span className="font-medium uppercase tracking-wide text-sm">{step.label}</span>
                </button>
                {index < arr.length - 1 && (
                  <div className={cn('flex-1 h-px max-w-8', step.completed ? 'bg-emerald-500/30' : 'bg-white/10')} />
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            <code className="text-emerald-400">Stepper</code> horizontal padrão |
            Use <code className="text-emerald-400">VerticalStepper</code> para sidebars ou mobile
          </p>
        </div>
      </section>

      {/* FormSection Demo */}
      <section>
        <SectionHeader
          icon={ClipboardList}
          title="FormSection"
          description="Container para agrupar campos relacionados."
        />
        <div className="p-6 rounded-2xl bg-slate-900 border border-white/10">
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 overflow-hidden">
            <div className="flex items-start justify-between gap-4 p-5">
              <div>
                <h3 className="text-lg font-semibold text-white">Template da Campanha</h3>
                <p className="text-sm text-slate-400 mt-1">Busque e escolha o template aprovado.</p>
              </div>
            </div>
            <div className="px-5 pb-5 space-y-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-300">
                  Template <span className="text-red-400 ml-1">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Buscar template..."
                  disabled
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950/60 border border-white/10 text-sm text-white placeholder:text-slate-500"
                />
                <p className="text-xs text-slate-500">Selecione um template aprovado pela Meta</p>
              </div>
            </div>
          </div>
          <div className="mt-4 text-xs text-slate-500">
            Componentes: <code className="text-emerald-400">FormSection</code>, <code className="text-emerald-400">FormField</code>, <code className="text-emerald-400">FormRow</code>
          </div>
        </div>
      </section>

      {/* SummaryPanel Demo */}
      <section>
        <SectionHeader
          icon={ClipboardList}
          title="SummaryPanel"
          description="Painel lateral com resumo das escolhas do usuário."
        />
        <div className="grid md:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 overflow-hidden">
            <div className="flex items-center justify-between gap-3 p-5 border-b border-white/5">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-slate-400" />
                <h3 className="text-lg font-semibold text-white">Resumo da Campanha</h3>
              </div>
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                Rascunho
              </span>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <span className="text-sm text-slate-400">Template</span>
                <span className="text-sm font-medium text-white">promo_dezembro</span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="text-sm text-slate-400">Contatos</span>
                <span className="text-sm font-medium text-white">1.234</span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="text-sm text-slate-400">Agendamento</span>
                <span className="text-sm font-medium text-slate-600 italic">Não definido</span>
              </div>
              <div className="h-px bg-white/5 my-4" />
              <div className="space-y-3">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Preview</span>
                <div className="rounded-xl border border-white/10 bg-slate-950/50 p-4">
                  <div className="w-full h-24 rounded-lg bg-slate-800/50 flex items-center justify-center text-slate-600 text-sm">
                    Preview do template
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="p-6 rounded-2xl bg-slate-900 border border-white/10">
            <h4 className="text-white font-medium mb-4">Componentes</h4>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-3">
                <code className="text-emerald-400 text-xs shrink-0">SummaryPanel</code>
                <span className="text-slate-400">Container com título + badge</span>
              </li>
              <li className="flex items-start gap-3">
                <code className="text-emerald-400 text-xs shrink-0">SummaryItem</code>
                <span className="text-slate-400">Linha label: value</span>
              </li>
              <li className="flex items-start gap-3">
                <code className="text-emerald-400 text-xs shrink-0">SummaryGroup</code>
                <span className="text-slate-400">Grupo com título</span>
              </li>
              <li className="flex items-start gap-3">
                <code className="text-emerald-400 text-xs shrink-0">SummaryDivider</code>
                <span className="text-slate-400">Separador visual</span>
              </li>
              <li className="flex items-start gap-3">
                <code className="text-emerald-400 text-xs shrink-0">SummaryPreview</code>
                <span className="text-slate-400">Container de preview</span>
              </li>
              <li className="flex items-start gap-3">
                <code className="text-emerald-400 text-xs shrink-0">SummaryAlert</code>
                <span className="text-slate-400">Alerta/aviso</span>
              </li>
              <li className="flex items-start gap-3">
                <code className="text-emerald-400 text-xs shrink-0">SummaryStats</code>
                <span className="text-slate-400">Mini stats grid</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* WizardActions Demo */}
      <section>
        <SectionHeader
          icon={ClipboardList}
          title="WizardActions"
          description="Footer padrão com navegação entre passos."
        />
        <div className="p-6 rounded-2xl bg-slate-900 border border-white/10 space-y-6">
          {/* Middle step */}
          <div>
            <p className="text-xs text-slate-500 mb-3">Passo intermediário:</p>
            <div className="flex items-center justify-between p-4 rounded-xl bg-slate-800/50 border border-white/5">
              <button className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-950/60 border border-white/10 text-sm text-slate-300">
                <ArrowLeft className="w-4 h-4" /> Voltar
              </button>
              <button className="px-4 py-2.5 rounded-lg bg-emerald-500 text-white text-sm font-medium">
                Próximo
              </button>
            </div>
          </div>
          {/* First step */}
          <div>
            <p className="text-xs text-slate-500 mb-3">Primeiro passo (sem botão voltar):</p>
            <div className="flex items-center justify-end p-4 rounded-xl bg-slate-800/50 border border-white/5">
              <button className="px-4 py-2.5 rounded-lg bg-emerald-500 text-white text-sm font-medium">
                Próximo
              </button>
            </div>
          </div>
          {/* Last step */}
          <div>
            <p className="text-xs text-slate-500 mb-3">Último passo (salvar):</p>
            <div className="flex items-center justify-between p-4 rounded-xl bg-slate-800/50 border border-white/5">
              <button className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-950/60 border border-white/10 text-sm text-slate-300">
                <ArrowLeft className="w-4 h-4" /> Voltar
              </button>
              <button className="px-4 py-2.5 rounded-lg bg-emerald-500 text-white text-sm font-medium">
                Salvar Campanha
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Wizard Rules */}
      <section>
        <SectionHeader
          icon={ClipboardList}
          title="Regras de Consistência (Wizards)"
          description="Siga estas regras para wizards consistentes."
        />
        <div className="grid md:grid-cols-2 gap-6">
          <div className="p-6 rounded-2xl bg-emerald-500/5 border border-primary-500/20">
            <h4 className="text-emerald-400 font-medium mb-4 flex items-center gap-2">
              <Check className="w-5 h-5" /> FAÇA
            </h4>
            <ul className="space-y-2 text-sm text-slate-300">
              <li>✓ Use <code className="text-emerald-400">WizardPageLayout</code> para estrutura</li>
              <li>✓ Inclua botão de voltar para a listagem</li>
              <li>✓ Use <code className="text-emerald-400">Stepper</code> para 3+ passos</li>
              <li>✓ Layout 2 colunas: Form (esquerda) + Summary (direita)</li>
              <li>✓ Agrupe campos em <code className="text-emerald-400">FormSection</code></li>
              <li>✓ Mostre progresso em tempo real no <code className="text-emerald-400">SummaryPanel</code></li>
              <li>✓ Use <code className="text-emerald-400">WizardActions</code> no footer</li>
            </ul>
          </div>
          <div className="p-6 rounded-2xl bg-red-500/5 border border-red-500/20">
            <h4 className="text-red-400 font-medium mb-4 flex items-center gap-2">
              <Trash2 className="w-5 h-5" /> NÃO FAÇA
            </h4>
            <ul className="space-y-2 text-sm text-slate-300">
              <li>✗ Não crie layouts customizados para wizards</li>
              <li>✗ Não omita o botão de voltar no header</li>
              <li>✗ Não use stepper para 1-2 passos simples</li>
              <li>✗ Não inverta as colunas (summary sempre à direita)</li>
              <li>✗ Não misture campos soltos com FormSection</li>
              <li>✗ Não posicione ações no header (use footer)</li>
              <li>✗ Não esconda o SummaryPanel em desktop</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  )
}
