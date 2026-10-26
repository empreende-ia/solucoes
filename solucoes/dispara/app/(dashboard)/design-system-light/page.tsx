'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, Check, Palette, Type, Maximize, Layers, Square, Zap, LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDevMode } from '@/components/providers/DevModeProvider'

// =============================================================================
// LIGHT MODE CSS VARIABLES (inline para preview)
// =============================================================================

const lightModeStyles = `
  .light-preview {
    /* Backgrounds - Light */
    --ds-bg-base: #ffffff;
    --ds-bg-elevated: #fafafa;
    --ds-bg-surface: #f4f4f5;
    --ds-bg-overlay: rgba(255, 255, 255, 0.9);
    --ds-bg-glass: rgba(255, 255, 255, 0.8);
    --ds-bg-hover: rgba(0, 0, 0, 0.04);

    /* Text - Dark on Light */
    --ds-text-primary: #18181b;
    --ds-text-secondary: #52525b;
    --ds-text-muted: #71717a;
    --ds-text-brand: #059669;
    --ds-text-disabled: #a1a1aa;

    /* Borders - Black alpha */
    --ds-border-subtle: rgba(0, 0, 0, 0.06);
    --ds-border-default: rgba(0, 0, 0, 0.10);
    --ds-border-strong: rgba(0, 0, 0, 0.15);
    --ds-border-focus: #10b981;

    /* Brand (same) */
    --ds-brand-primary: #10b981;
    --ds-brand-primary-hover: #059669;
    --ds-brand-primary-muted: rgba(16, 185, 129, 0.12);

    /* Status Colors - Light Mode */
    --ds-status-success: #10b981;
    --ds-status-success-text: #047857;
    --ds-status-success-bg: rgba(16, 185, 129, 0.12);

    --ds-status-error: #ef4444;
    --ds-status-error-text: #b91c1c;
    --ds-status-error-bg: rgba(239, 68, 68, 0.12);

    --ds-status-warning: #f59e0b;
    --ds-status-warning-text: #b45309;
    --ds-status-warning-bg: rgba(245, 158, 11, 0.12);

    --ds-status-info: #3b82f6;
    --ds-status-info-text: #1d4ed8;
    --ds-status-info-bg: rgba(59, 130, 246, 0.12);

    /* Shadows - Light Mode (softer) */
    --ds-shadow-xs: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
    --ds-shadow-sm: 0 1px 3px 0 rgba(0, 0, 0, 0.08), 0 1px 2px -1px rgba(0, 0, 0, 0.05);
    --ds-shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
    --ds-shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.05);
    --ds-shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.10), 0 8px 10px -6px rgba(0, 0, 0, 0.05);
    --ds-shadow-2xl: 0 25px 50px -12px rgba(0, 0, 0, 0.15);

    /* Composite Shadows - Light */
    --ds-shadow-card: 0 1px 3px 0 rgba(0, 0, 0, 0.08), 0 1px 2px -1px rgba(0, 0, 0, 0.05);
    --ds-shadow-card-hover: 0 4px 6px -1px rgba(0, 0, 0, 0.10), 0 2px 4px -2px rgba(0, 0, 0, 0.06);
    --ds-shadow-button: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
    --ds-shadow-button-primary: 0 1px 3px 0 rgba(0, 0, 0, 0.10), 0 0 0 1px rgba(16, 185, 129, 0.3);
    --ds-shadow-modal: 0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.08);
    --ds-shadow-dropdown: 0 10px 15px -3px rgba(0, 0, 0, 0.10), 0 4px 6px -4px rgba(0, 0, 0, 0.06);

    /* Glow effects */
    --ds-glow-brand-sm: 0 0 10px rgba(16, 185, 129, 0.15);
    --ds-glow-brand-md: 0 0 20px rgba(16, 185, 129, 0.20);
    --ds-glow-brand-ring: 0 0 0 3px rgba(16, 185, 129, 0.15);
    --ds-glow-error-ring: 0 0 0 3px rgba(239, 68, 68, 0.15);

    background-color: var(--ds-bg-base);
    color: var(--ds-text-primary);
    background-image: radial-gradient(rgba(0, 0, 0, 0.06) 1px, transparent 1px);
    background-size: 24px 24px;
  }
`

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
        'hover:bg-black/10 active:scale-95',
        'text-slate-400 hover:text-slate-600',
        className
      )}
      title="Copiar"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

// =============================================================================
// COLOR SWATCH COMPONENT (Light Mode)
// =============================================================================

function ColorSwatch({
  name,
  value,
  cssVar,
  textLight = false,
}: {
  name: string
  value: string
  cssVar: string
  textLight?: boolean
}) {
  return (
    <div className="group relative">
      <div
        className="h-20 rounded-xl border border-black/10 flex items-end p-3 transition-transform hover:scale-105 shadow-sm"
        style={{ background: value }}
      >
        <span className={cn('text-xs font-medium', textLight ? 'text-white' : 'text-slate-900')}>
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
// SECTION HEADER (Light Mode)
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
        <div className="p-2 rounded-lg bg-emerald-100 text-emerald-600">
          <Icon className="w-5 h-5" />
        </div>
        <h2 className="text-2xl font-semibold text-slate-900">{title}</h2>
      </div>
      <p className="text-slate-500 max-w-2xl">{description}</p>
    </div>
  )
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function DesignSystemLightPage() {
  const router = useRouter()
  const { isDevMode } = useDevMode()
  const [isChecking, setIsChecking] = useState(true)
  const [activeTab, setActiveTab] = useState<'colors' | 'typography' | 'spacing' | 'shadows' | 'borders'>('colors')

  useEffect(() => {
    const timer = setTimeout(() => setIsChecking(false), 100)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!isChecking && !isDevMode) {
      router.replace('/')
    }
  }, [isChecking, isDevMode, router])

  if (isChecking || !isDevMode) {
    return null
  }

  const tabs = [
    { id: 'colors' as const, label: 'Cores', icon: Palette },
    { id: 'typography' as const, label: 'Tipografia', icon: Type },
    { id: 'spacing' as const, label: 'Espaçamento', icon: Maximize },
    { id: 'shadows' as const, label: 'Sombras', icon: Layers },
    { id: 'borders' as const, label: 'Bordas', icon: Square },
  ]

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: lightModeStyles }} />
      <div className="light-preview min-h-screen p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-amber-100 text-amber-700 border border-amber-200">
              Preview
            </span>
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-emerald-100 text-emerald-700 border border-emerald-200">
              Light Mode
            </span>
          </div>
          <h1 className="text-4xl font-bold text-slate-900 mb-3">Design System - Light Mode</h1>
          <p className="text-slate-500 text-lg max-w-2xl">
            Preview das cores e tokens do Dispara em modo claro.
            Aprove esta paleta antes da implementação.
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
                    ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                    : 'bg-slate-100 text-slate-600 border border-transparent hover:bg-slate-200 hover:text-slate-700'
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
        </div>
      </div>
    </>
  )
}

// =============================================================================
// COLORS SECTION (Light Mode Values)
// =============================================================================

function ColorsSection() {
  return (
    <div className="space-y-16">
      {/* Brand Colors */}
      <section>
        <SectionHeader
          icon={Palette}
          title="Cores da Marca"
          description="A paleta principal mantém o Emerald, mas com ajustes para melhor contraste em fundo claro."
        />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          <ColorSwatch name="Primary" value="#10b981" cssVar="var(--ds-brand-primary)" textLight />
          <ColorSwatch name="Hover" value="#059669" cssVar="var(--ds-brand-primary-hover)" textLight />
          <ColorSwatch name="Active" value="#047857" cssVar="var(--color-primary-700)" textLight />
          <ColorSwatch name="Muted" value="rgba(16, 185, 129, 0.12)" cssVar="var(--ds-brand-primary-muted)" />
          <ColorSwatch name="Text" value="#059669" cssVar="var(--ds-text-brand)" textLight />
        </div>
      </section>

      {/* Background Colors - LIGHT MODE */}
      <section>
        <SectionHeader
          icon={Palette}
          title="Backgrounds"
          description="Escala invertida: tons claros para hierarquia visual."
        />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          <ColorSwatch name="Base" value="#ffffff" cssVar="var(--ds-bg-base)" />
          <ColorSwatch name="Elevated" value="#fafafa" cssVar="var(--ds-bg-elevated)" />
          <ColorSwatch name="Surface" value="#f4f4f5" cssVar="var(--ds-bg-surface)" />
          <ColorSwatch name="Hover" value="rgba(0, 0, 0, 0.04)" cssVar="var(--ds-bg-hover)" />
        </div>
        <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200">
          <p className="text-sm text-amber-700">
            <strong>Diferença do Dark:</strong> No Light Mode usamos branco e tons de slate claros (50-100)
            em vez de slate escuros (800-950).
          </p>
        </div>
      </section>

      {/* Text Colors - LIGHT MODE */}
      <section>
        <SectionHeader
          icon={Palette}
          title="Texto"
          description="Cores escuras sobre fundo claro para legibilidade."
        />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          <ColorSwatch name="Primary" value="#18181b" cssVar="var(--ds-text-primary)" textLight />
          <ColorSwatch name="Secondary" value="#52525b" cssVar="var(--ds-text-secondary)" textLight />
          <ColorSwatch name="Muted" value="#71717a" cssVar="var(--ds-text-muted)" textLight />
          <ColorSwatch name="Disabled" value="#a1a1aa" cssVar="var(--ds-text-disabled)" />
        </div>
        <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200">
          <p className="text-sm text-amber-700">
            <strong>Contraste WCAG:</strong> Primary (#18181b) em branco = 15.8:1 (AAA),
            Secondary (#52525b) = 7.0:1 (AAA).
          </p>
        </div>
      </section>

      {/* Status Colors - LIGHT MODE */}
      <section>
        <SectionHeader
          icon={Palette}
          title="Status"
          description="Texto mais escuro para contraste adequado em fundo claro."
        />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-slate-700">Success</h4>
            <ColorSwatch name="Base" value="#10b981" cssVar="var(--ds-status-success)" textLight />
            <ColorSwatch name="Text" value="#047857" cssVar="var(--ds-status-success-text)" textLight />
            <ColorSwatch name="Bg" value="rgba(16, 185, 129, 0.12)" cssVar="var(--ds-status-success-bg)" />
          </div>
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-slate-700">Error</h4>
            <ColorSwatch name="Base" value="#ef4444" cssVar="var(--ds-status-error)" textLight />
            <ColorSwatch name="Text" value="#b91c1c" cssVar="var(--ds-status-error-text)" textLight />
            <ColorSwatch name="Bg" value="rgba(239, 68, 68, 0.12)" cssVar="var(--ds-status-error-bg)" />
          </div>
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-slate-700">Warning</h4>
            <ColorSwatch name="Base" value="#f59e0b" cssVar="var(--ds-status-warning)" textLight />
            <ColorSwatch name="Text" value="#b45309" cssVar="var(--ds-status-warning-text)" textLight />
            <ColorSwatch name="Bg" value="rgba(245, 158, 11, 0.12)" cssVar="var(--ds-status-warning-bg)" />
          </div>
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-slate-700">Info</h4>
            <ColorSwatch name="Base" value="#3b82f6" cssVar="var(--ds-status-info)" textLight />
            <ColorSwatch name="Text" value="#1d4ed8" cssVar="var(--ds-status-info-text)" textLight />
            <ColorSwatch name="Bg" value="rgba(59, 130, 246, 0.12)" cssVar="var(--ds-status-info-bg)" />
          </div>
        </div>
        <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200">
          <p className="text-sm text-amber-700">
            <strong>Diferença do Dark:</strong> Texto usa tons -700 (mais escuros) em vez de -400 (mais claros)
            para garantir contraste WCAG AA (4.5:1) em fundo claro.
          </p>
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
            { name: '50', value: '#ecfdf5', dark: false },
            { name: '100', value: '#d1fae5', dark: false },
            { name: '200', value: '#a7f3d0', dark: false },
            { name: '300', value: '#6ee7b7', dark: false },
            { name: '400', value: '#34d399', dark: false },
            { name: '500', value: '#10b981', dark: true },
            { name: '600', value: '#059669', dark: true },
            { name: '700', value: '#047857', dark: true },
            { name: '800', value: '#065f46', dark: true },
            { name: '900', value: '#064e3b', dark: true },
            { name: '950', value: '#022c22', dark: true },
          ].map((color) => (
            <div key={color.name} className="group">
              <div
                className="h-14 rounded-lg border border-black/10 flex items-end justify-center pb-1 shadow-sm"
                style={{ background: color.value }}
              >
                <span className={cn('text-[10px] font-medium', color.dark ? 'text-white' : 'text-slate-900')}>
                  {color.name}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison Table */}
      <section>
        <SectionHeader
          icon={Palette}
          title="Comparativo: Dark vs Light"
          description="Resumo das principais diferenças entre os modos."
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-3 px-4 font-semibold text-slate-900">Token</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-900">Dark Mode</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-900">Light Mode</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="py-3 px-4 font-mono text-xs text-slate-600">--ds-bg-base</td>
                <td className="py-3 px-4"><code className="bg-slate-900 text-slate-100 px-2 py-1 rounded text-xs">#09090b</code></td>
                <td className="py-3 px-4"><code className="bg-white border border-slate-200 text-slate-900 px-2 py-1 rounded text-xs">#ffffff</code></td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-mono text-xs text-slate-600">--ds-bg-elevated</td>
                <td className="py-3 px-4"><code className="bg-slate-900 text-slate-100 px-2 py-1 rounded text-xs">#18181b</code></td>
                <td className="py-3 px-4"><code className="bg-slate-50 border border-slate-200 text-slate-900 px-2 py-1 rounded text-xs">#fafafa</code></td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-mono text-xs text-slate-600">--ds-text-primary</td>
                <td className="py-3 px-4"><code className="bg-slate-100 text-slate-900 px-2 py-1 rounded text-xs">#f4f4f5</code></td>
                <td className="py-3 px-4"><code className="bg-slate-900 text-slate-100 px-2 py-1 rounded text-xs">#18181b</code></td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-mono text-xs text-slate-600">--ds-border-default</td>
                <td className="py-3 px-4"><code className="bg-slate-800 text-slate-100 px-2 py-1 rounded text-xs">rgba(255,255,255,0.10)</code></td>
                <td className="py-3 px-4"><code className="bg-slate-100 border border-slate-300 text-slate-900 px-2 py-1 rounded text-xs">rgba(0,0,0,0.10)</code></td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-mono text-xs text-slate-600">--ds-status-success-text</td>
                <td className="py-3 px-4"><code className="bg-emerald-400 text-emerald-950 px-2 py-1 rounded text-xs">#34d399</code></td>
                <td className="py-3 px-4"><code className="bg-emerald-700 text-white px-2 py-1 rounded text-xs">#047857</code></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

// =============================================================================
// TYPOGRAPHY SECTION (Light Mode)
// =============================================================================

function TypographySection() {
  return (
    <div className="space-y-16">
      {/* Font Families */}
      <section>
        <SectionHeader
          icon={Type}
          title="Famílias de Fonte"
          description="As mesmas famílias tipográficas do Dark Mode."
        />
        <div className="grid md:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 shadow-sm">
            <p className="text-sm text-emerald-600 font-mono mb-2">--ds-font-display</p>
            <p className="font-display text-3xl text-slate-900 mb-3">Satoshi</p>
            <p className="text-slate-500 text-sm">Usada em headings e elementos de destaque.</p>
            <div className="mt-4 pt-4 border-t border-slate-200">
              <p className="font-display text-xl text-slate-900">ABCDEFGHIJKLM</p>
              <p className="font-display text-xl text-slate-900">abcdefghijklm</p>
              <p className="font-display text-xl text-slate-900">0123456789</p>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 shadow-sm">
            <p className="text-sm text-emerald-600 font-mono mb-2">--ds-font-body</p>
            <p className="font-body text-3xl text-slate-900 mb-3">Inter</p>
            <p className="text-slate-500 text-sm">Usada em texto corrido e UI.</p>
            <div className="mt-4 pt-4 border-t border-slate-200">
              <p className="font-body text-xl text-slate-900">ABCDEFGHIJKLM</p>
              <p className="font-body text-xl text-slate-900">abcdefghijklm</p>
              <p className="font-body text-xl text-slate-900">0123456789</p>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 shadow-sm">
            <p className="text-sm text-emerald-600 font-mono mb-2">--ds-font-mono</p>
            <p className="font-mono text-3xl text-slate-900 mb-3">JetBrains Mono</p>
            <p className="text-slate-500 text-sm">Usada em código e números.</p>
            <div className="mt-4 pt-4 border-t border-slate-200">
              <p className="font-mono text-xl text-slate-900">ABCDEFGHIJKLM</p>
              <p className="font-mono text-xl text-slate-900">abcdefghijklm</p>
              <p className="font-mono text-xl text-slate-900">0123456789</p>
            </div>
          </div>
        </div>
      </section>

      {/* Text Styles */}
      <section>
        <SectionHeader
          icon={Type}
          title="Estilos de Texto"
          description="Preview dos estilos tipográficos em fundo claro."
        />
        <div className="space-y-4">
          {[
            { class: 'text-heading-1', label: 'Heading 1', example: 'Dashboard de Campanhas' },
            { class: 'text-heading-2', label: 'Heading 2', example: 'Estatísticas do Mês' },
            { class: 'text-heading-3', label: 'Heading 3', example: 'Contatos Ativos' },
            { class: 'text-body', label: 'Body', example: 'Envie mensagens em massa para seus contatos com templates aprovados.' },
            { class: 'text-body-small', label: 'Body Small', example: 'Última atualização há 5 minutos.' },
            { class: 'text-caption', label: 'Caption', example: 'Máximo de 1000 caracteres' },
          ].map((style) => (
            <div key={style.class} className="flex items-center gap-6 p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="w-32 shrink-0">
                <code className="text-xs text-emerald-600 font-mono">.{style.class}</code>
              </div>
              <div className="flex-1">
                <p className={cn(style.class, 'text-slate-900')}>{style.example}</p>
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
          description="Números e métricas em fundo claro."
        />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { value: '12,847', label: 'MENSAGENS ENVIADAS' },
            { value: '98.5%', label: 'TAXA DE ENTREGA' },
            { value: '1,234', label: 'CONTATOS ATIVOS' },
            { value: '45', label: 'CAMPANHAS' },
          ].map((stat, i) => (
            <div key={i} className="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center shadow-sm">
              <p className="text-4xl font-bold font-mono text-slate-900 mb-2">{stat.value}</p>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

// =============================================================================
// SPACING SECTION (Light Mode)
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

  return (
    <div className="space-y-16">
      <section>
        <SectionHeader
          icon={Maximize}
          title="Escala de Espaçamento"
          description="Sistema baseado em múltiplos de 4px (igual ao Dark Mode)."
        />
        <div className="space-y-3">
          {spacingScale.map((space) => (
            <div key={space.name} className="flex items-center gap-4">
              <div className="w-16 text-right">
                <code className="text-sm text-emerald-600 font-mono">{space.name}</code>
              </div>
              <div
                className="h-6 bg-emerald-200 border border-emerald-300 rounded"
                style={{ width: space.value }}
              />
              <div className="flex items-center gap-3 text-sm">
                <span className="text-slate-700">{space.value}</span>
                <span className="text-slate-400">({space.px})</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

// =============================================================================
// SHADOWS SECTION (Light Mode)
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

  // Shadow values for light mode
  const shadowValues: Record<string, string> = {
    '--ds-shadow-xs': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    '--ds-shadow-sm': '0 1px 3px 0 rgba(0, 0, 0, 0.08), 0 1px 2px -1px rgba(0, 0, 0, 0.05)',
    '--ds-shadow-md': '0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -2px rgba(0, 0, 0, 0.05)',
    '--ds-shadow-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.05)',
    '--ds-shadow-xl': '0 20px 25px -5px rgba(0, 0, 0, 0.10), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
    '--ds-shadow-2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
  }

  return (
    <div className="space-y-16">
      <section>
        <SectionHeader
          icon={Layers}
          title="Elevações"
          description="Sombras mais suaves para fundo claro (menor opacidade)."
        />
        <div className="grid md:grid-cols-3 gap-6">
          {elevations.map((shadow) => (
            <div
              key={shadow.name}
              className="p-6 rounded-2xl bg-white border border-slate-100"
              style={{ boxShadow: shadowValues[shadow.css] }}
            >
              <div className="flex items-center justify-between mb-2">
                <code className="text-sm text-emerald-600 font-mono">{shadow.name}</code>
                <CopyButton text={`var(${shadow.css})`} />
              </div>
              <p className="text-xs text-slate-500">{shadow.desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200">
          <p className="text-sm text-amber-700">
            <strong>Diferença do Dark:</strong> Opacidade das sombras reduzida de 0.3-0.6 para 0.05-0.15
            para um visual mais suave em fundo claro.
          </p>
        </div>
      </section>

      {/* Glow Effects */}
      <section>
        <SectionHeader
          icon={Layers}
          title="Efeitos Glow"
          description="Glows com opacidade levemente reduzida."
        />
        <div className="grid md:grid-cols-4 gap-6">
          {[
            { name: 'Brand SM', css: '--ds-glow-brand-sm', style: '0 0 10px rgba(16, 185, 129, 0.15)' },
            { name: 'Brand MD', css: '--ds-glow-brand-md', style: '0 0 20px rgba(16, 185, 129, 0.20)' },
            { name: 'Brand Ring', css: '--ds-glow-brand-ring', style: '0 0 0 3px rgba(16, 185, 129, 0.15)' },
            { name: 'Error Ring', css: '--ds-glow-error-ring', style: '0 0 0 3px rgba(239, 68, 68, 0.15)' },
          ].map((glow) => (
            <div
              key={glow.name}
              className={cn(
                'p-6 rounded-2xl border',
                glow.name.includes('Error')
                  ? 'bg-red-50 border-red-200'
                  : 'bg-emerald-50 border-emerald-200'
              )}
              style={{ boxShadow: glow.style }}
            >
              <div className="flex items-center justify-between mb-2">
                <code className="text-sm text-emerald-600 font-mono">{glow.name}</code>
                <CopyButton text={`var(${glow.css})`} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

// =============================================================================
// BORDERS SECTION (Light Mode)
// =============================================================================

function BordersSection() {
  const radiusScale = [
    { name: 'none', value: '0px' },
    { name: 'sm', value: '0.25rem' },
    { name: 'md', value: '0.375rem' },
    { name: 'lg', value: '0.5rem' },
    { name: 'xl', value: '0.75rem' },
    { name: '2xl', value: '1rem' },
    { name: 'full', value: '9999px' },
  ]

  return (
    <div className="space-y-16">
      {/* Border Radius */}
      <section>
        <SectionHeader
          icon={Square}
          title="Border Radius"
          description="Escala de arredondamento (igual ao Dark Mode)."
        />
        <div className="grid grid-cols-3 md:grid-cols-7 gap-4">
          {radiusScale.map((radius) => (
            <div key={radius.name} className="text-center">
              <div
                className="w-16 h-16 mx-auto bg-emerald-100 border-2 border-emerald-300 mb-2"
                style={{ borderRadius: radius.value }}
              />
              <code className="text-xs text-emerald-600 font-mono block">{radius.name}</code>
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
          description="Preto com alpha em vez de branco (inverso do Dark Mode)."
        />
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { name: 'Subtle', css: '--ds-border-subtle', value: 'rgba(0, 0, 0, 0.06)', opacity: '6%' },
            { name: 'Default', css: '--ds-border-default', value: 'rgba(0, 0, 0, 0.10)', opacity: '10%' },
            { name: 'Strong', css: '--ds-border-strong', value: 'rgba(0, 0, 0, 0.15)', opacity: '15%' },
          ].map((border) => (
            <div
              key={border.name}
              className="p-6 rounded-xl bg-white"
              style={{ border: `2px solid ${border.value}` }}
            >
              <div className="flex items-center justify-between mb-2">
                <code className="text-sm text-emerald-600 font-mono">{border.name}</code>
                <CopyButton text={`var(${border.css})`} />
              </div>
              <p className="text-xs text-slate-500">rgba(0, 0, 0, {border.opacity})</p>
            </div>
          ))}
        </div>
        <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200">
          <p className="text-sm text-amber-700">
            <strong>Diferença do Dark:</strong> Dark usa <code>rgba(255,255,255,*)</code> (branco),
            Light usa <code>rgba(0,0,0,*)</code> (preto).
          </p>
        </div>
      </section>
    </div>
  )
}
