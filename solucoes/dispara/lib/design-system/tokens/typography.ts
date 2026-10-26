/**
 * Dispara Design System - Typography Tokens
 *
 * Sistema tipográfico com:
 * - Font families (display + body)
 * - Escala de tamanhos
 * - Pesos
 * - Line heights
 * - Letter spacing
 * - Presets compostos
 */

// =============================================================================
// FONT FAMILIES
// =============================================================================

export const fontFamilies = {
  /**
   * Display font - para headings e elementos de destaque
   * Satoshi é uma fonte geométrica moderna com personalidade
   */
  display: '"Satoshi", "Inter", system-ui, sans-serif',

  /**
   * Body font - para texto corrido e UI
   * Inter é excelente para legibilidade em telas
   */
  body: '"Inter", system-ui, -apple-system, sans-serif',

  /**
   * Mono font - para código e números
   */
  mono: '"JetBrains Mono", "Fira Code", "Consolas", monospace',
} as const

// =============================================================================
// FONT SIZES
// Escala modular com ratio ~1.25 (Major Third)
// =============================================================================

export const fontSizes = {
  /** 10px - micro labels */
  '2xs': '0.625rem',
  /** 12px - small labels, captions */
  xs: '0.75rem',
  /** 14px - body small, UI text */
  sm: '0.875rem',
  /** 16px - body default */
  base: '1rem',
  /** 18px - body large */
  lg: '1.125rem',
  /** 20px - h6, lead text */
  xl: '1.25rem',
  /** 24px - h5 */
  '2xl': '1.5rem',
  /** 30px - h4 */
  '3xl': '1.875rem',
  /** 36px - h3 */
  '4xl': '2.25rem',
  /** 48px - h2 */
  '5xl': '3rem',
  /** 60px - h1 */
  '6xl': '3.75rem',
  /** 72px - display */
  '7xl': '4.5rem',
  /** 96px - hero */
  '8xl': '6rem',
} as const

// =============================================================================
// FONT WEIGHTS
// =============================================================================

export const fontWeights = {
  /** 400 - body text */
  normal: '400',
  /** 500 - slightly emphasized */
  medium: '500',
  /** 600 - labels, buttons */
  semibold: '600',
  /** 700 - headings */
  bold: '700',
  /** 800 - display headings */
  extrabold: '800',
} as const

// =============================================================================
// LINE HEIGHTS
// =============================================================================

export const lineHeights = {
  /** 1 - headings tight */
  none: '1',
  /** 1.25 - headings */
  tight: '1.25',
  /** 1.375 - subheadings */
  snug: '1.375',
  /** 1.5 - body default */
  normal: '1.5',
  /** 1.625 - body relaxed */
  relaxed: '1.625',
  /** 2 - loose text */
  loose: '2',
} as const

// =============================================================================
// LETTER SPACING
// =============================================================================

export const letterSpacing = {
  /** -0.05em - tight headlines */
  tighter: '-0.05em',
  /** -0.025em - headlines */
  tight: '-0.025em',
  /** 0 - default */
  normal: '0',
  /** 0.025em - body wide */
  wide: '0.025em',
  /** 0.05em - labels */
  wider: '0.05em',
  /** 0.1em - uppercase labels */
  widest: '0.1em',
} as const

// =============================================================================
// TYPOGRAPHY PRESETS
// Combinações prontas para uso
// =============================================================================

export const typographyPresets = {
  // Display/Hero
  display: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes['6xl'],
    fontWeight: fontWeights.bold,
    lineHeight: lineHeights.none,
    letterSpacing: letterSpacing.tight,
  },

  // Headings
  h1: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes['4xl'],
    fontWeight: fontWeights.bold,
    lineHeight: lineHeights.tight,
    letterSpacing: letterSpacing.tight,
  },
  h2: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes['3xl'],
    fontWeight: fontWeights.semibold,
    lineHeight: lineHeights.tight,
    letterSpacing: letterSpacing.tight,
  },
  h3: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes['2xl'],
    fontWeight: fontWeights.semibold,
    lineHeight: lineHeights.snug,
    letterSpacing: letterSpacing.normal,
  },
  h4: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.semibold,
    lineHeight: lineHeights.snug,
    letterSpacing: letterSpacing.normal,
  },
  h5: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    lineHeight: lineHeights.normal,
    letterSpacing: letterSpacing.normal,
  },
  h6: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
    lineHeight: lineHeights.normal,
    letterSpacing: letterSpacing.normal,
  },

  // Body text
  bodyLarge: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.normal,
    lineHeight: lineHeights.relaxed,
    letterSpacing: letterSpacing.normal,
  },
  body: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.normal,
    lineHeight: lineHeights.normal,
    letterSpacing: letterSpacing.normal,
  },
  bodySmall: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.normal,
    lineHeight: lineHeights.normal,
    letterSpacing: letterSpacing.normal,
  },

  // UI Elements
  label: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    lineHeight: lineHeights.normal,
    letterSpacing: letterSpacing.normal,
  },
  labelSmall: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
    lineHeight: lineHeights.normal,
    letterSpacing: letterSpacing.wide,
  },
  caption: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.normal,
    lineHeight: lineHeights.normal,
    letterSpacing: letterSpacing.normal,
  },
  overline: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    lineHeight: lineHeights.normal,
    letterSpacing: letterSpacing.widest,
    textTransform: 'uppercase' as const,
  },

  // Special
  code: {
    fontFamily: fontFamilies.mono,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.normal,
    lineHeight: lineHeights.normal,
    letterSpacing: letterSpacing.normal,
  },
  stat: {
    fontFamily: fontFamilies.mono,
    fontSize: fontSizes['3xl'],
    fontWeight: fontWeights.bold,
    lineHeight: lineHeights.none,
    letterSpacing: letterSpacing.tight,
  },
  statLabel: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
    lineHeight: lineHeights.normal,
    letterSpacing: letterSpacing.wide,
    textTransform: 'uppercase' as const,
  },
} as const

// =============================================================================
// CSS VARIABLES
// =============================================================================

export const typographyCssVars = {
  // Families
  '--ds-font-display': fontFamilies.display,
  '--ds-font-body': fontFamilies.body,
  '--ds-font-mono': fontFamilies.mono,

  // Sizes
  '--ds-text-2xs': fontSizes['2xs'],
  '--ds-text-xs': fontSizes.xs,
  '--ds-text-sm': fontSizes.sm,
  '--ds-text-base': fontSizes.base,
  '--ds-text-lg': fontSizes.lg,
  '--ds-text-xl': fontSizes.xl,
  '--ds-text-2xl': fontSizes['2xl'],
  '--ds-text-3xl': fontSizes['3xl'],
  '--ds-text-4xl': fontSizes['4xl'],
  '--ds-text-5xl': fontSizes['5xl'],

  // Weights
  '--ds-font-normal': fontWeights.normal,
  '--ds-font-medium': fontWeights.medium,
  '--ds-font-semibold': fontWeights.semibold,
  '--ds-font-bold': fontWeights.bold,

  // Line heights
  '--ds-leading-none': lineHeights.none,
  '--ds-leading-tight': lineHeights.tight,
  '--ds-leading-normal': lineHeights.normal,
  '--ds-leading-relaxed': lineHeights.relaxed,

  // Letter spacing
  '--ds-tracking-tight': letterSpacing.tight,
  '--ds-tracking-normal': letterSpacing.normal,
  '--ds-tracking-wide': letterSpacing.wide,
} as const

// =============================================================================
// GOOGLE FONTS URL
// Para importar as fontes
// =============================================================================

export const googleFontsUrl =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap'

// Satoshi precisa ser baixada do Fontshare ou usar CDN alternativo
export const satoshiFontUrl =
  'https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&display=swap'

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type FontFamily = keyof typeof fontFamilies
export type FontSize = keyof typeof fontSizes
export type FontWeight = keyof typeof fontWeights
export type LineHeight = keyof typeof lineHeights
export type LetterSpacing = keyof typeof letterSpacing
export type TypographyPreset = keyof typeof typographyPresets
