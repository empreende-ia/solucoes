/**
 * Dispara Design System - Spacing Tokens
 *
 * Sistema de espaçamento baseado em escala de 4px
 * Consistente com Tailwind mas com nomes semânticos
 */

// =============================================================================
// BASE SPACING SCALE
// Escala de 4px multiplicada
// =============================================================================

export const spacingScale = {
  /** 0px */
  0: '0px',
  /** 1px - hairline */
  px: '1px',
  /** 2px - micro details */
  0.5: '0.125rem',
  /** 4px - tight spacing */
  1: '0.25rem',
  /** 6px */
  1.5: '0.375rem',
  /** 8px - compact */
  2: '0.5rem',
  /** 10px */
  2.5: '0.625rem',
  /** 12px - default small */
  3: '0.75rem',
  /** 14px */
  3.5: '0.875rem',
  /** 16px - base unit */
  4: '1rem',
  /** 20px */
  5: '1.25rem',
  /** 24px - comfortable */
  6: '1.5rem',
  /** 28px */
  7: '1.75rem',
  /** 32px - spacious */
  8: '2rem',
  /** 36px */
  9: '2.25rem',
  /** 40px */
  10: '2.5rem',
  /** 44px */
  11: '2.75rem',
  /** 48px - large */
  12: '3rem',
  /** 56px */
  14: '3.5rem',
  /** 64px - section */
  16: '4rem',
  /** 80px */
  20: '5rem',
  /** 96px - page */
  24: '6rem',
  /** 128px */
  32: '8rem',
  /** 160px */
  40: '10rem',
  /** 192px */
  48: '12rem',
  /** 224px */
  56: '14rem',
  /** 256px */
  64: '16rem',
} as const

// =============================================================================
// SEMANTIC SPACING
// Nomes com significado para contextos específicos
// =============================================================================

export const semanticSpacing = {
  // Component internals
  component: {
    /** 4px - ícone para texto */
    iconGap: spacingScale[1],
    /** 8px - entre elementos inline */
    inlineGap: spacingScale[2],
    /** 12px - padding de inputs/buttons */
    inputPadding: spacingScale[3],
    /** 16px - padding de cards */
    cardPadding: spacingScale[4],
    /** 24px - padding de seções */
    sectionPadding: spacingScale[6],
  },

  // Layout
  layout: {
    /** 16px - gap entre cards em grid */
    gridGap: spacingScale[4],
    /** 24px - gap entre seções */
    sectionGap: spacingScale[6],
    /** 32px - margem de página */
    pageMargin: spacingScale[8],
    /** 64px - espaço entre grandes blocos */
    blockGap: spacingScale[16],
  },

  // Stack (vertical spacing)
  stack: {
    /** 4px - tight stack */
    xs: spacingScale[1],
    /** 8px - compact stack */
    sm: spacingScale[2],
    /** 12px - default stack */
    md: spacingScale[3],
    /** 16px - comfortable stack */
    lg: spacingScale[4],
    /** 24px - spacious stack */
    xl: spacingScale[6],
    /** 32px - section stack */
    '2xl': spacingScale[8],
  },

  // Inline (horizontal spacing)
  inline: {
    /** 4px - tight inline */
    xs: spacingScale[1],
    /** 8px - compact inline */
    sm: spacingScale[2],
    /** 12px - default inline */
    md: spacingScale[3],
    /** 16px - comfortable inline */
    lg: spacingScale[4],
    /** 24px - spacious inline */
    xl: spacingScale[6],
  },
} as const

// =============================================================================
// GAP PRESETS
// Combinações comuns de gap para flex/grid
// =============================================================================

export const gapPresets = {
  /** gap-1 (4px) - icon buttons, tight lists */
  tight: spacingScale[1],
  /** gap-2 (8px) - inline elements, badges */
  compact: spacingScale[2],
  /** gap-3 (12px) - form fields, list items */
  default: spacingScale[3],
  /** gap-4 (16px) - cards, sections */
  comfortable: spacingScale[4],
  /** gap-6 (24px) - major sections */
  spacious: spacingScale[6],
  /** gap-8 (32px) - page blocks */
  loose: spacingScale[8],
} as const

// =============================================================================
// PADDING PRESETS
// Combinações comuns de padding
// =============================================================================

export const paddingPresets = {
  button: {
    sm: { x: spacingScale[3], y: spacingScale[1.5] },   // px-3 py-1.5
    md: { x: spacingScale[4], y: spacingScale[2] },     // px-4 py-2
    lg: { x: spacingScale[6], y: spacingScale[2.5] },   // px-6 py-2.5
  },
  input: {
    sm: { x: spacingScale[2.5], y: spacingScale[1.5] }, // px-2.5 py-1.5
    md: { x: spacingScale[3], y: spacingScale[2] },     // px-3 py-2
    lg: { x: spacingScale[4], y: spacingScale[2.5] },   // px-4 py-2.5
  },
  card: {
    sm: spacingScale[4],  // p-4
    md: spacingScale[6],  // p-6
    lg: spacingScale[8],  // p-8
  },
  section: {
    sm: { x: spacingScale[4], y: spacingScale[6] },     // px-4 py-6
    md: { x: spacingScale[6], y: spacingScale[8] },     // px-6 py-8
    lg: { x: spacingScale[8], y: spacingScale[12] },    // px-8 py-12
  },
} as const

// =============================================================================
// CSS VARIABLES
// =============================================================================

export const spacingCssVars = {
  '--ds-space-component-icon-gap': semanticSpacing.component.iconGap,
  '--ds-space-component-inline-gap': semanticSpacing.component.inlineGap,
  '--ds-space-component-input-padding': semanticSpacing.component.inputPadding,
  '--ds-space-component-card-padding': semanticSpacing.component.cardPadding,
  '--ds-space-component-section-padding': semanticSpacing.component.sectionPadding,

  '--ds-space-layout-grid-gap': semanticSpacing.layout.gridGap,
  '--ds-space-layout-section-gap': semanticSpacing.layout.sectionGap,
  '--ds-space-layout-page-margin': semanticSpacing.layout.pageMargin,

  '--ds-gap-tight': gapPresets.tight,
  '--ds-gap-compact': gapPresets.compact,
  '--ds-gap-default': gapPresets.default,
  '--ds-gap-comfortable': gapPresets.comfortable,
  '--ds-gap-spacious': gapPresets.spacious,
} as const

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type SpacingScale = keyof typeof spacingScale
export type GapPreset = keyof typeof gapPresets
export type StackSize = keyof typeof semanticSpacing.stack
export type InlineSize = keyof typeof semanticSpacing.inline
