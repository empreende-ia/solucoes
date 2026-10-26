/**
 * Dispara Design System - Shadow & Elevation Tokens
 *
 * Sistema de sombras para criar hierarquia visual:
 * - Elevations (box-shadow padrão)
 * - Glow effects (sombras coloridas)
 * - Inner shadows
 * - Drop shadows para SVG/filters
 */

import { primitiveColors } from './colors'

// =============================================================================
// ELEVATION SHADOWS
// Sombras neutras para elevação de elementos
// =============================================================================

export const elevations = {
  /** Nenhuma sombra */
  none: 'none',

  /** Sombra sutil - borders virtuais, separação leve */
  xs: '0 1px 2px 0 rgba(0, 0, 0, 0.3)',

  /** Sombra pequena - cards, dropdowns */
  sm: '0 2px 4px 0 rgba(0, 0, 0, 0.4)',

  /** Sombra média - cards elevados, popovers */
  md: '0 4px 8px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -2px rgba(0, 0, 0, 0.3)',

  /** Sombra grande - modais, sheets */
  lg: '0 10px 25px -3px rgba(0, 0, 0, 0.5), 0 4px 10px -4px rgba(0, 0, 0, 0.4)',

  /** Sombra extra grande - overlays importantes */
  xl: '0 20px 40px -5px rgba(0, 0, 0, 0.6), 0 8px 16px -6px rgba(0, 0, 0, 0.4)',

  /** Sombra máxima - elementos flutuantes de destaque */
  '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
} as const

// =============================================================================
// GLOW EFFECTS
// Sombras coloridas para destaque e feedback
// =============================================================================

export const glows = {
  // Brand glow (emerald)
  brand: {
    sm: `0 0 10px ${primitiveColors.brand[500]}33`,
    md: `0 0 20px ${primitiveColors.brand[500]}4d`,
    lg: `0 0 30px ${primitiveColors.brand[500]}66`,
    ring: `0 0 0 3px ${primitiveColors.brand[500]}33`,
  },

  // Success glow
  success: {
    sm: `0 0 10px ${primitiveColors.brand[400]}33`,
    md: `0 0 20px ${primitiveColors.brand[400]}4d`,
  },

  // Error glow
  error: {
    sm: `0 0 10px ${primitiveColors.red[500]}33`,
    md: `0 0 20px ${primitiveColors.red[500]}4d`,
    ring: `0 0 0 3px ${primitiveColors.red[500]}33`,
  },

  // Warning glow
  warning: {
    sm: `0 0 10px ${primitiveColors.amber[500]}33`,
    md: `0 0 20px ${primitiveColors.amber[500]}4d`,
  },

  // Info glow (processing state)
  info: {
    sm: `0 0 10px ${primitiveColors.blue[500]}33`,
    md: `0 0 20px ${primitiveColors.blue[500]}4d`,
    pulse: `0 0 30px ${primitiveColors.blue[500]}66`,
  },

  // Purple glow (AI/scheduled)
  purple: {
    sm: `0 0 10px ${primitiveColors.brand[500]}33`,
    md: `0 0 20px ${primitiveColors.brand[500]}4d`,
  },

  // White glow (neutral emphasis)
  white: {
    sm: '0 0 10px rgba(255, 255, 255, 0.1)',
    md: '0 0 20px rgba(255, 255, 255, 0.15)',
  },
} as const

// =============================================================================
// INNER SHADOWS
// Para elementos inset, inputs, etc
// =============================================================================

export const innerShadows = {
  /** Inset sutil - inputs */
  sm: 'inset 0 1px 2px 0 rgba(0, 0, 0, 0.3)',

  /** Inset médio - wells, containers */
  md: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.4)',

  /** Inset para depth - recessed areas */
  lg: 'inset 0 4px 8px 0 rgba(0, 0, 0, 0.5)',

  /** Top highlight - glass effect */
  highlight: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.05)',

  /** Combined well effect */
  well: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.4), inset 0 1px 0 0 rgba(255, 255, 255, 0.02)',
} as const

// =============================================================================
// COMPOSITE SHADOWS
// Combinações para casos específicos
// =============================================================================

export const compositeShadows = {
  /** Card padrão - elevação + borda de luz */
  card: `${elevations.sm}, inset 0 1px 0 0 rgba(255, 255, 255, 0.03)`,

  /** Card hover - mais elevado */
  cardHover: `${elevations.md}, inset 0 1px 0 0 rgba(255, 255, 255, 0.05)`,

  /** Card com glow brand */
  cardBrand: `${elevations.md}, ${glows.brand.sm}`,

  /** Button default */
  button: `${elevations.xs}, inset 0 1px 0 0 rgba(255, 255, 255, 0.1)`,

  /** Button hover */
  buttonHover: `${elevations.sm}, inset 0 1px 0 0 rgba(255, 255, 255, 0.15)`,

  /** Button active/pressed */
  buttonActive: `${innerShadows.sm}`,

  /** Button primary com glow */
  buttonPrimary: `${elevations.sm}, ${glows.brand.sm}`,
  buttonPrimaryHover: `${elevations.md}, ${glows.brand.md}`,

  /** Modal/Dialog */
  modal: `${elevations.xl}, 0 0 0 1px rgba(255, 255, 255, 0.05)`,

  /** Dropdown/Popover */
  dropdown: `${elevations.lg}, 0 0 0 1px rgba(255, 255, 255, 0.05)`,

  /** Input focus */
  inputFocus: `0 0 0 3px ${primitiveColors.brand[500]}33`,
  inputError: `0 0 0 3px ${primitiveColors.red[500]}33`,

  /** Glass panel */
  glass: `${elevations.lg}, inset 0 1px 0 0 rgba(255, 255, 255, 0.05)`,

  /** Progress bar glow */
  progressGlow: `0 0 10px ${primitiveColors.brand[500]}80`,

  /** Node selected (workflow builder) */
  nodeSelected: `0 0 0 2px ${primitiveColors.blue[500]}, ${elevations.md}`,
} as const

// =============================================================================
// CSS VARIABLES
// =============================================================================

export const shadowCssVars = {
  // Elevations
  '--ds-shadow-none': elevations.none,
  '--ds-shadow-xs': elevations.xs,
  '--ds-shadow-sm': elevations.sm,
  '--ds-shadow-md': elevations.md,
  '--ds-shadow-lg': elevations.lg,
  '--ds-shadow-xl': elevations.xl,
  '--ds-shadow-2xl': elevations['2xl'],

  // Glows
  '--ds-glow-brand-sm': glows.brand.sm,
  '--ds-glow-brand-md': glows.brand.md,
  '--ds-glow-brand-ring': glows.brand.ring,
  '--ds-glow-error-ring': glows.error.ring,

  // Composites
  '--ds-shadow-card': compositeShadows.card,
  '--ds-shadow-card-hover': compositeShadows.cardHover,
  '--ds-shadow-button': compositeShadows.button,
  '--ds-shadow-button-primary': compositeShadows.buttonPrimary,
  '--ds-shadow-modal': compositeShadows.modal,
  '--ds-shadow-dropdown': compositeShadows.dropdown,
  '--ds-shadow-input-focus': compositeShadows.inputFocus,
} as const

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type Elevation = keyof typeof elevations
export type GlowColor = keyof typeof glows
export type InnerShadow = keyof typeof innerShadows
export type CompositeShadow = keyof typeof compositeShadows
