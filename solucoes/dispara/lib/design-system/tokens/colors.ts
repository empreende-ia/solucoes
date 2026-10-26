/**
 * Dispara API Oficial — Design System Color Tokens (brand Henrique Gabriel, dark-only)
 *
 * Sistema de cores baseado em camadas:
 * 1. Primitivas (raw colors) - valores hex/hsl puros
 * 2. Semânticas (semantic) - cores com significado (brand, status, etc)
 * 3. Componentes (component) - cores específicas de UI
 */

// =============================================================================
// PRIMITIVE COLORS
// Cores brutas sem significado semântico - base para tudo
// =============================================================================

export const primitiveColors = {
  // Slate Scale (Neutrals - Premium)
  slate: {
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
    950: '#020617',
  },

  // Brand Scale (Primary - Emerald, Henrique Gabriel — assinatura #10b981)
  brand: {
    50: '#ecfdf5',
    100: '#d1fae5',
    200: '#a7f3d0',
    300: '#6ee7b7',
    400: '#34d399',
    500: '#10b981',
    600: '#059669',
    700: '#047857',
    800: '#065f46',
    900: '#064e3b',
    950: '#022c22',
  },

  // Red Scale (Destructive/Error)
  red: {
    50: '#fef2f2',
    100: '#fee2e2',
    200: '#fecaca',
    300: '#fca5a5',
    400: '#f87171',
    500: '#ef4444',
    600: '#dc2626',
    700: '#b91c1c',
    800: '#991b1b',
    900: '#7f1d1d',
    950: '#450a0a',
  },

  // Amber Scale (Warning)
  amber: {
    50: '#fffbeb',
    100: '#fef3c7',
    200: '#fde68a',
    300: '#fcd34d',
    400: '#fbbf24',
    500: '#f59e0b',
    600: '#d97706',
    700: '#b45309',
    800: '#92400e',
    900: '#78350f',
    950: '#451a03',
  },

  // Blue Scale (Info/Processing)
  blue: {
    50: '#eff6ff',
    100: '#dbeafe',
    200: '#bfdbfe',
    300: '#93c5fd',
    400: '#60a5fa',
    500: '#3b82f6',
    600: '#2563eb',
    700: '#1d4ed8',
    800: '#1e40af',
    900: '#1e3a8a',
    950: '#172554',
  },

  // Purple Scale (Scheduled/AI)
  purple: {
    50: '#faf5ff',
    100: '#f3e8ff',
    200: '#e9d5ff',
    300: '#d8b4fe',
    400: '#c084fc',
    500: '#a855f7',
    600: '#9333ea',
    700: '#7e22ce',
    800: '#6b21a8',
    900: '#581c87',
    950: '#3b0764',
  },

  // Violet Scale (AI/Agent nodes)
  violet: {
    400: '#a78bfa',
    500: '#8b5cf6',
    600: '#7c3aed',
  },

  // Cyan Scale (Data/Templates)
  cyan: {
    400: '#22d3ee',
    500: '#06b6d4',
    600: '#0891b2',
  },

  // Pink Scale (Media nodes)
  pink: {
    400: '#f472b6',
    500: '#ec4899',
    600: '#db2777',
  },

  // Orange Scale (Triggers)
  orange: {
    400: '#fb923c',
    500: '#f97316',
    600: '#ea580c',
  },

  // Pure values
  white: '#ffffff',
  black: '#000000',
  transparent: 'transparent',
} as const

// =============================================================================
// SEMANTIC COLORS
// Cores com significado - usadas na aplicação
// =============================================================================

export const semanticColors = {
  // Brand
  brand: {
    primary: primitiveColors.brand[500],
    primaryHover: primitiveColors.brand[600],
    primaryActive: primitiveColors.brand[700],
    primaryMuted: primitiveColors.brand[500] + '1a', // 10% opacity
    primarySubtle: primitiveColors.brand[950],
  },

  // Backgrounds
  bg: {
    base: primitiveColors.slate[950],
    elevated: primitiveColors.slate[900],
    surface: primitiveColors.slate[800],
    overlay: 'rgba(9, 9, 11, 0.8)',
    glass: 'rgba(24, 24, 27, 0.7)',
    hover: 'rgba(255, 255, 255, 0.05)',
    active: 'rgba(255, 255, 255, 0.08)',
  },

  // Text
  text: {
    primary: primitiveColors.slate[100],
    secondary: primitiveColors.slate[400],
    muted: primitiveColors.slate[500],
    disabled: primitiveColors.slate[600],
    inverse: primitiveColors.slate[950],
    brand: primitiveColors.brand[400],
  },

  // Borders
  border: {
    subtle: 'rgba(255, 255, 255, 0.05)',
    default: 'rgba(255, 255, 255, 0.10)',
    strong: 'rgba(255, 255, 255, 0.15)',
    brand: primitiveColors.brand[500],
    focus: primitiveColors.brand[400],
  },

  // Status Colors
  status: {
    success: {
      base: primitiveColors.brand[500],
      text: primitiveColors.brand[400],
      bg: primitiveColors.brand[500] + '1a',
      border: primitiveColors.brand[500] + '33',
    },
    error: {
      base: primitiveColors.red[500],
      text: primitiveColors.red[400],
      bg: primitiveColors.red[500] + '1a',
      border: primitiveColors.red[500] + '33',
    },
    warning: {
      base: primitiveColors.amber[500],
      text: primitiveColors.amber[400],
      bg: primitiveColors.amber[500] + '1a',
      border: primitiveColors.amber[500] + '33',
    },
    info: {
      base: primitiveColors.blue[500],
      text: primitiveColors.blue[400],
      bg: primitiveColors.blue[500] + '1a',
      border: primitiveColors.blue[500] + '33',
    },
  },

  // Campaign Status (specific to Dispara)
  campaign: {
    draft: {
      text: primitiveColors.slate[400],
      bg: primitiveColors.slate[500] + '1a',
    },
    scheduled: {
      text: primitiveColors.brand[400],
      bg: primitiveColors.brand[500] + '1a',
    },
    sending: {
      text: primitiveColors.blue[400],
      bg: primitiveColors.blue[500] + '1a',
    },
    completed: {
      text: primitiveColors.brand[400],
      bg: primitiveColors.brand[500] + '1a',
    },
    paused: {
      text: primitiveColors.amber[400],
      bg: primitiveColors.amber[500] + '1a',
    },
    failed: {
      text: primitiveColors.red[400],
      bg: primitiveColors.red[500] + '1a',
    },
  },
} as const

// =============================================================================
// NODE COLORS (Workflow Builder)
// Cores específicas para o builder de workflows
// =============================================================================

export const nodeColors = {
  message: {
    border: 'hsl(161.4, 93.5%, 30.4%)',
    bg: 'hsl(164, 86%, 16%)',
    accent: primitiveColors.brand[500],
  },
  ai: {
    border: 'hsl(262.1, 83.3%, 57.8%)',
    bg: 'hsl(263, 70%, 24%)',
    accent: primitiveColors.violet[500],
  },
  flow: {
    border: 'hsl(221.2, 83.2%, 53.3%)',
    bg: 'hsl(224, 64%, 20%)',
    accent: primitiveColors.blue[500],
  },
  trigger: {
    border: 'hsl(20.5, 90.2%, 48.2%)',
    bg: 'hsl(20, 80%, 18%)',
    accent: primitiveColors.orange[500],
  },
  media: {
    border: 'hsl(333.3, 71.4%, 50.6%)',
    bg: 'hsl(326, 60%, 18%)',
    accent: primitiveColors.pink[500],
  },
  data: {
    border: 'hsl(191.6, 91.4%, 36.5%)',
    bg: 'hsl(192, 80%, 14%)',
    accent: primitiveColors.cyan[500],
  },
  default: {
    border: 'hsl(215, 13.8%, 34.1%)',
    bg: 'hsl(220, 14%, 12%)',
    accent: primitiveColors.slate[500],
  },
} as const

// =============================================================================
// CSS VARIABLES MAPPING
// Para uso no globals.css
// =============================================================================

export const colorCssVars = {
  // Primitivas já estão definidas no globals.css
  // Aqui definimos as semânticas como CSS vars

  '--ds-brand-primary': semanticColors.brand.primary,
  '--ds-brand-primary-hover': semanticColors.brand.primaryHover,
  '--ds-brand-primary-muted': semanticColors.brand.primaryMuted,

  '--ds-bg-base': semanticColors.bg.base,
  '--ds-bg-elevated': semanticColors.bg.elevated,
  '--ds-bg-surface': semanticColors.bg.surface,
  '--ds-bg-overlay': semanticColors.bg.overlay,
  '--ds-bg-glass': semanticColors.bg.glass,
  '--ds-bg-hover': semanticColors.bg.hover,

  '--ds-text-primary': semanticColors.text.primary,
  '--ds-text-secondary': semanticColors.text.secondary,
  '--ds-text-muted': semanticColors.text.muted,
  '--ds-text-brand': semanticColors.text.brand,

  '--ds-border-subtle': semanticColors.border.subtle,
  '--ds-border-default': semanticColors.border.default,
  '--ds-border-strong': semanticColors.border.strong,
  '--ds-border-focus': semanticColors.border.focus,
} as const

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type PrimitiveColorScale = keyof typeof primitiveColors
export type SemanticColorCategory = keyof typeof semanticColors
export type NodeCategory = keyof typeof nodeColors
export type CampaignStatus = keyof typeof semanticColors.campaign
