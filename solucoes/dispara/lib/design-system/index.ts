/**
 * Dispara Design System
 *
 * Sistema de design centralizado com tokens para:
 * - Colors (cores primitivas, semânticas e de componentes)
 * - Spacing (espaçamento baseado em escala 4px)
 * - Typography (fontes, tamanhos, pesos, presets)
 * - Shadows (elevações, glows, sombras compostas)
 * - Borders (widths, radius, presets)
 * - Motion (durações, easings, animações, keyframes)
 *
 * @example
 * ```tsx
 * import { colors, spacing, typography, shadows, borders, motion } from '@/lib/design-system'
 *
 * // Usar cores
 * const bgColor = colors.semantic.bg.elevated
 * const brandColor = colors.semantic.brand.primary
 *
 * // Usar espaçamento
 * const gap = spacing.scale[4] // '1rem'
 * const cardPadding = spacing.semantic.component.cardPadding
 *
 * // Usar tipografia
 * const headingStyle = typography.presets.h1
 *
 * // Usar sombras
 * const cardShadow = shadows.composite.card
 *
 * // Usar bordas
 * const cardRadius = borders.radius.presets.card.md
 *
 * // Usar motion
 * const transition = motion.transitions.button
 * ```
 */

// =============================================================================
// TOKEN IMPORTS
// =============================================================================

import {
  primitiveColors,
  semanticColors,
  nodeColors,
  colorCssVars,
  type PrimitiveColorScale,
  type SemanticColorCategory,
  type NodeCategory,
  type CampaignStatus,
} from './tokens/colors'

import {
  spacingScale,
  semanticSpacing,
  gapPresets,
  paddingPresets,
  spacingCssVars,
  type SpacingScale,
  type GapPreset,
  type StackSize,
  type InlineSize,
} from './tokens/spacing'

import {
  fontFamilies,
  fontSizes,
  fontWeights,
  lineHeights,
  letterSpacing,
  typographyPresets,
  typographyCssVars,
  googleFontsUrl,
  satoshiFontUrl,
  type FontFamily,
  type FontSize,
  type FontWeight,
  type LineHeight,
  type LetterSpacing,
  type TypographyPreset,
} from './tokens/typography'

import {
  elevations,
  glows,
  innerShadows,
  compositeShadows,
  shadowCssVars,
  type Elevation,
  type GlowColor,
  type InnerShadow,
  type CompositeShadow,
} from './tokens/shadows'

import {
  borderWidths,
  borderRadius,
  borderColors,
  borderStyles,
  borderPresets,
  radiusPresets,
  dividers,
  borderCssVars,
  type BorderWidth,
  type BorderRadius,
  type BorderColor,
  type BorderStyle,
  type BorderPreset,
} from './tokens/borders'

import {
  durations,
  durationAliases,
  easings,
  easingAliases,
  transitions,
  keyframes,
  animations,
  staggerDelays,
  motionCssVars,
  type Duration,
  type DurationAlias,
  type Easing,
  type EasingAlias,
  type Animation,
  type Keyframe,
} from './tokens/motion'

// =============================================================================
// NAMESPACED EXPORTS
// Para uso organizado: colors.semantic.brand.primary
// =============================================================================

export const colors = {
  primitive: primitiveColors,
  semantic: semanticColors,
  node: nodeColors,
  cssVars: colorCssVars,
} as const

export const spacing = {
  scale: spacingScale,
  semantic: semanticSpacing,
  gap: gapPresets,
  padding: paddingPresets,
  cssVars: spacingCssVars,
} as const

export const typography = {
  families: fontFamilies,
  sizes: fontSizes,
  weights: fontWeights,
  lineHeights,
  letterSpacing,
  presets: typographyPresets,
  cssVars: typographyCssVars,
  fonts: {
    google: googleFontsUrl,
    satoshi: satoshiFontUrl,
  },
} as const

export const shadows = {
  elevation: elevations,
  glow: glows,
  inner: innerShadows,
  composite: compositeShadows,
  cssVars: shadowCssVars,
} as const

export const borders = {
  width: borderWidths,
  radius: borderRadius,
  color: borderColors,
  style: borderStyles,
  preset: borderPresets,
  radiusPreset: radiusPresets,
  divider: dividers,
  cssVars: borderCssVars,
} as const

export const motion = {
  duration: durations,
  durationAlias: durationAliases,
  easing: easings,
  easingAlias: easingAliases,
  transition: transitions,
  keyframe: keyframes,
  animation: animations,
  stagger: staggerDelays,
  cssVars: motionCssVars,
} as const

// =============================================================================
// ALL CSS VARIABLES
// Para injetar no :root do globals.css
// =============================================================================

export const allCssVars = {
  ...colorCssVars,
  ...spacingCssVars,
  ...typographyCssVars,
  ...shadowCssVars,
  ...borderCssVars,
  ...motionCssVars,
} as const

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Gera CSS custom properties a partir de um objeto de tokens
 * @example
 * ```ts
 * const cssString = generateCssVars(allCssVars)
 * // Retorna: "--ds-brand-primary: #10b981; --ds-bg-base: #09090b; ..."
 * ```
 */
export function generateCssVars(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([key, value]) => `${key}: ${value};`)
    .join('\n  ')
}

/**
 * Cria uma classe de animação com stagger delay
 * @example
 * ```tsx
 * <div style={{ animationDelay: getStaggerDelay(index) }}>
 * ```
 */
export function getStaggerDelay(index: number, baseMs = 50): string {
  return `${index * baseMs}ms`
}

/**
 * Combina múltiplas sombras
 * @example
 * ```ts
 * const combined = combineShadows(shadows.elevation.md, shadows.glow.brand.sm)
 * ```
 */
export function combineShadows(...shadows: string[]): string {
  return shadows.filter(s => s && s !== 'none').join(', ')
}

// =============================================================================
// TYPE RE-EXPORTS
// =============================================================================

export type {
  // Colors
  PrimitiveColorScale,
  SemanticColorCategory,
  NodeCategory,
  CampaignStatus,
  // Spacing
  SpacingScale,
  GapPreset,
  StackSize,
  InlineSize,
  // Typography
  FontFamily,
  FontSize,
  FontWeight,
  LineHeight,
  LetterSpacing,
  TypographyPreset,
  // Shadows
  Elevation,
  GlowColor,
  InnerShadow,
  CompositeShadow,
  // Borders
  BorderWidth,
  BorderRadius,
  BorderColor,
  BorderStyle,
  BorderPreset,
  // Motion
  Duration,
  DurationAlias,
  Easing,
  EasingAlias,
  Animation,
  Keyframe,
}

// =============================================================================
// DEFAULT EXPORT
// =============================================================================

const designSystem = {
  colors,
  spacing,
  typography,
  shadows,
  borders,
  motion,
  cssVars: allCssVars,
  utils: {
    generateCssVars,
    getStaggerDelay,
    combineShadows,
  },
} as const

export default designSystem
