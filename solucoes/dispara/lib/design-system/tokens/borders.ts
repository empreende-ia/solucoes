/**
 * Dispara Design System - Border Tokens
 *
 * Sistema de bordas incluindo:
 * - Border widths
 * - Border radius
 * - Border colors (referenciando colors.ts)
 * - Presets compostos
 */

import { semanticColors } from './colors'

// =============================================================================
// BORDER WIDTHS
// =============================================================================

export const borderWidths = {
  /** 0px */
  0: '0px',
  /** 1px - default */
  1: '1px',
  /** 2px - emphasis */
  2: '2px',
  /** 3px - strong emphasis */
  3: '3px',
  /** 4px - extra strong */
  4: '4px',
} as const

// =============================================================================
// BORDER RADIUS
// Escala consistente de arredondamento
// =============================================================================

export const borderRadius = {
  /** 0px - sharp corners */
  none: '0px',
  /** 2px - subtle rounding */
  xs: '0.125rem',
  /** 4px - small elements */
  sm: '0.25rem',
  /** 6px - default small */
  md: '0.375rem',
  /** 8px - cards, buttons */
  lg: '0.5rem',
  /** 12px - larger cards */
  xl: '0.75rem',
  /** 16px - panels, modals */
  '2xl': '1rem',
  /** 20px - large panels */
  '3xl': '1.25rem',
  /** 24px - hero elements */
  '4xl': '1.5rem',
  /** 9999px - pills, tags */
  full: '9999px',
} as const

// =============================================================================
// BORDER COLORS
// Usando semantic colors
// =============================================================================

export const borderColors = {
  /** Quase invisível - separadores sutis */
  subtle: semanticColors.border.subtle,
  /** Padrão - bordas normais */
  default: semanticColors.border.default,
  /** Mais visível - emphasis */
  strong: semanticColors.border.strong,
  /** Brand color - CTAs, selected */
  brand: semanticColors.border.brand,
  /** Focus state */
  focus: semanticColors.border.focus,
  /** Transparent */
  transparent: 'transparent',
} as const

// =============================================================================
// BORDER STYLES
// =============================================================================

export const borderStyles = {
  solid: 'solid',
  dashed: 'dashed',
  dotted: 'dotted',
  none: 'none',
} as const

// =============================================================================
// BORDER PRESETS
// Combinações prontas para uso
// =============================================================================

export const borderPresets = {
  // None
  none: 'none',

  // Subtle borders
  subtle: `${borderWidths[1]} ${borderStyles.solid} ${borderColors.subtle}`,

  // Default borders
  default: `${borderWidths[1]} ${borderStyles.solid} ${borderColors.default}`,

  // Strong borders
  strong: `${borderWidths[1]} ${borderStyles.solid} ${borderColors.strong}`,

  // Brand borders
  brand: `${borderWidths[1]} ${borderStyles.solid} ${borderColors.brand}`,
  brandThick: `${borderWidths[2]} ${borderStyles.solid} ${borderColors.brand}`,

  // Focus borders
  focus: `${borderWidths[2]} ${borderStyles.solid} ${borderColors.focus}`,

  // Dashed borders (drop zones, etc)
  dashed: `${borderWidths[2]} ${borderStyles.dashed} ${borderColors.default}`,
  dashedBrand: `${borderWidths[2]} ${borderStyles.dashed} ${borderColors.brand}`,
} as const

// =============================================================================
// RADIUS PRESETS
// Combinações comuns para componentes
// =============================================================================

export const radiusPresets = {
  // Buttons
  button: {
    sm: borderRadius.md,    // 6px
    md: borderRadius.lg,    // 8px
    lg: borderRadius.xl,    // 12px
    pill: borderRadius.full,
  },

  // Inputs
  input: {
    sm: borderRadius.md,    // 6px
    md: borderRadius.lg,    // 8px
    lg: borderRadius.xl,    // 12px
  },

  // Cards
  card: {
    sm: borderRadius.lg,    // 8px
    md: borderRadius.xl,    // 12px
    lg: borderRadius['2xl'], // 16px
  },

  // Modals/Sheets
  modal: borderRadius['2xl'],  // 16px

  // Badges/Tags
  badge: borderRadius.md,      // 6px
  tag: borderRadius.full,      // pill

  // Avatars
  avatar: {
    sm: borderRadius.lg,       // 8px
    md: borderRadius.xl,       // 12px
    lg: borderRadius['2xl'],   // 16px
    full: borderRadius.full,   // circle
  },

  // Images
  image: {
    sm: borderRadius.lg,
    md: borderRadius.xl,
    lg: borderRadius['2xl'],
  },

  // Tooltips
  tooltip: borderRadius.lg,    // 8px

  // Popovers/Dropdowns
  popover: borderRadius.xl,    // 12px
} as const

// =============================================================================
// DIVIDER STYLES
// Para separadores horizontais/verticais
// =============================================================================

export const dividers = {
  horizontal: {
    subtle: {
      height: borderWidths[1],
      backgroundColor: borderColors.subtle,
    },
    default: {
      height: borderWidths[1],
      backgroundColor: borderColors.default,
    },
    strong: {
      height: borderWidths[1],
      backgroundColor: borderColors.strong,
    },
  },
  vertical: {
    subtle: {
      width: borderWidths[1],
      backgroundColor: borderColors.subtle,
    },
    default: {
      width: borderWidths[1],
      backgroundColor: borderColors.default,
    },
  },
} as const

// =============================================================================
// CSS VARIABLES
// =============================================================================

export const borderCssVars = {
  // Widths
  '--ds-border-width-0': borderWidths[0],
  '--ds-border-width-1': borderWidths[1],
  '--ds-border-width-2': borderWidths[2],

  // Radius
  '--ds-radius-none': borderRadius.none,
  '--ds-radius-xs': borderRadius.xs,
  '--ds-radius-sm': borderRadius.sm,
  '--ds-radius-md': borderRadius.md,
  '--ds-radius-lg': borderRadius.lg,
  '--ds-radius-xl': borderRadius.xl,
  '--ds-radius-2xl': borderRadius['2xl'],
  '--ds-radius-3xl': borderRadius['3xl'],
  '--ds-radius-full': borderRadius.full,

  // Colors
  '--ds-border-subtle': borderColors.subtle,
  '--ds-border-default': borderColors.default,
  '--ds-border-strong': borderColors.strong,
  '--ds-border-brand': borderColors.brand,
  '--ds-border-focus': borderColors.focus,

  // Presets
  '--ds-border': borderPresets.default,
  '--ds-border-preset-brand': borderPresets.brand,
} as const

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type BorderWidth = keyof typeof borderWidths
export type BorderRadius = keyof typeof borderRadius
export type BorderColor = keyof typeof borderColors
export type BorderStyle = keyof typeof borderStyles
export type BorderPreset = keyof typeof borderPresets
