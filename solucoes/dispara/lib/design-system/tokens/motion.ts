/**
 * Dispara Design System - Motion Tokens
 *
 * Sistema de animação incluindo:
 * - Durações
 * - Easings/Timing functions
 * - Keyframes
 * - Transition presets
 */

// =============================================================================
// DURATIONS
// Tempos de animação padronizados
// =============================================================================

export const durations = {
  /** 0ms - instant */
  0: '0ms',
  /** 75ms - micro interactions */
  75: '75ms',
  /** 100ms - quick feedback */
  100: '100ms',
  /** 150ms - fast transitions */
  150: '150ms',
  /** 200ms - default transitions */
  200: '200ms',
  /** 300ms - medium transitions */
  300: '300ms',
  /** 500ms - slow transitions */
  500: '500ms',
  /** 700ms - deliberate animations */
  700: '700ms',
  /** 1000ms - 1 second */
  1000: '1000ms',
} as const

// Semantic aliases
export const durationAliases = {
  instant: durations[0],
  fastest: durations[75],
  fast: durations[150],
  normal: durations[200],
  slow: durations[300],
  slower: durations[500],
  slowest: durations[700],
} as const

// =============================================================================
// EASINGS
// Curvas de animação
// =============================================================================

export const easings = {
  // Standard easings
  linear: 'linear',

  // Ease in (slow start)
  easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
  easeInQuad: 'cubic-bezier(0.55, 0.085, 0.68, 0.53)',
  easeInCubic: 'cubic-bezier(0.55, 0.055, 0.675, 0.19)',

  // Ease out (slow end) - mais usado para UI
  easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
  easeOutQuad: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
  easeOutCubic: 'cubic-bezier(0.215, 0.61, 0.355, 1)',
  easeOutQuart: 'cubic-bezier(0.165, 0.84, 0.44, 1)',
  easeOutExpo: 'cubic-bezier(0.19, 1, 0.22, 1)',

  // Ease in-out (slow start and end)
  easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
  easeInOutQuad: 'cubic-bezier(0.455, 0.03, 0.515, 0.955)',
  easeInOutCubic: 'cubic-bezier(0.645, 0.045, 0.355, 1)',

  // Special
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  smooth: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
} as const

// Semantic aliases
export const easingAliases = {
  /** Hover, focus states */
  interaction: easings.easeOut,
  /** Modais, sheets entrando */
  enter: easings.easeOutCubic,
  /** Modais, sheets saindo */
  exit: easings.easeInCubic,
  /** Transições padrão */
  default: easings.easeInOut,
  /** Micro-interactions com bounce */
  playful: easings.spring,
  /** Movimento suave e natural */
  smooth: easings.smooth,
} as const

// =============================================================================
// TRANSITION PRESETS
// Combinações prontas de property + duration + easing
// =============================================================================

export const transitions = {
  // None
  none: 'none',

  // All properties
  all: {
    fast: `all ${durations[150]} ${easings.easeOut}`,
    normal: `all ${durations[200]} ${easings.easeOut}`,
    slow: `all ${durations[300]} ${easings.easeOut}`,
  },

  // Colors only (background, border, text)
  colors: {
    fast: `color ${durations[150]} ${easings.easeOut}, background-color ${durations[150]} ${easings.easeOut}, border-color ${durations[150]} ${easings.easeOut}`,
    normal: `color ${durations[200]} ${easings.easeOut}, background-color ${durations[200]} ${easings.easeOut}, border-color ${durations[200]} ${easings.easeOut}`,
  },

  // Opacity
  opacity: {
    fast: `opacity ${durations[150]} ${easings.easeOut}`,
    normal: `opacity ${durations[200]} ${easings.easeOut}`,
  },

  // Transform
  transform: {
    fast: `transform ${durations[150]} ${easings.easeOut}`,
    normal: `transform ${durations[200]} ${easings.easeOut}`,
    spring: `transform ${durations[300]} ${easings.spring}`,
  },

  // Shadow
  shadow: {
    normal: `box-shadow ${durations[200]} ${easings.easeOut}`,
  },

  // Specific components
  button: `all ${durations[150]} ${easings.easeOut}`,
  card: `all ${durations[200]} ${easings.easeOut}`,
  modal: `all ${durations[300]} ${easings.easeOutCubic}`,
  dropdown: `all ${durations[200]} ${easings.easeOutQuart}`,
  tooltip: `opacity ${durations[150]} ${easings.easeOut}, transform ${durations[150]} ${easings.easeOut}`,
} as const

// =============================================================================
// KEYFRAME DEFINITIONS
// Definições de keyframes para uso em CSS
// =============================================================================

export const keyframes = {
  // Fade
  fadeIn: {
    from: { opacity: '0' },
    to: { opacity: '1' },
  },
  fadeOut: {
    from: { opacity: '1' },
    to: { opacity: '0' },
  },

  // Scale
  scaleIn: {
    from: { opacity: '0', transform: 'scale(0.95)' },
    to: { opacity: '1', transform: 'scale(1)' },
  },
  scaleOut: {
    from: { opacity: '1', transform: 'scale(1)' },
    to: { opacity: '0', transform: 'scale(0.95)' },
  },

  // Slide
  slideInFromTop: {
    from: { opacity: '0', transform: 'translateY(-10px)' },
    to: { opacity: '1', transform: 'translateY(0)' },
  },
  slideInFromBottom: {
    from: { opacity: '0', transform: 'translateY(10px)' },
    to: { opacity: '1', transform: 'translateY(0)' },
  },
  slideInFromLeft: {
    from: { opacity: '0', transform: 'translateX(-10px)' },
    to: { opacity: '1', transform: 'translateX(0)' },
  },
  slideInFromRight: {
    from: { opacity: '0', transform: 'translateX(10px)' },
    to: { opacity: '1', transform: 'translateX(0)' },
  },

  // Pulse
  pulse: {
    '0%, 100%': { opacity: '1' },
    '50%': { opacity: '0.5' },
  },

  // Spin
  spin: {
    from: { transform: 'rotate(0deg)' },
    to: { transform: 'rotate(360deg)' },
  },

  // Ping (notification)
  ping: {
    '0%': { transform: 'scale(1)', opacity: '1' },
    '75%, 100%': { transform: 'scale(2)', opacity: '0' },
  },

  // Bounce
  bounce: {
    '0%, 100%': { transform: 'translateY(0)' },
    '50%': { transform: 'translateY(-10px)' },
  },

  // Shake (error)
  shake: {
    '0%, 100%': { transform: 'translateX(0)' },
    '10%, 30%, 50%, 70%, 90%': { transform: 'translateX(-4px)' },
    '20%, 40%, 60%, 80%': { transform: 'translateX(4px)' },
  },

  // Wiggle
  wiggle: {
    '0%, 100%': { transform: 'rotate(0deg)' },
    '25%': { transform: 'rotate(-3deg)' },
    '75%': { transform: 'rotate(3deg)' },
  },

  // Glow pulse (for brand elements)
  glowPulse: {
    '0%, 100%': { boxShadow: '0 0 5px 0 rgba(16, 185, 129, 0.3)' },
    '50%': { boxShadow: '0 0 20px 5px rgba(16, 185, 129, 0.5)' },
  },

  // Skeleton loading
  shimmer: {
    '0%': { backgroundPosition: '-200% 0' },
    '100%': { backgroundPosition: '200% 0' },
  },

  // Progress indeterminate
  indeterminate: {
    '0%': { transform: 'translateX(-100%)' },
    '100%': { transform: 'translateX(400%)' },
  },

  // Accordion expand
  accordionDown: {
    from: { height: '0', opacity: '0' },
    to: { height: 'var(--radix-accordion-content-height)', opacity: '1' },
  },
  accordionUp: {
    from: { height: 'var(--radix-accordion-content-height)', opacity: '1' },
    to: { height: '0', opacity: '0' },
  },
} as const

// =============================================================================
// ANIMATION PRESETS
// Animações prontas para uso
// =============================================================================

export const animations = {
  // Entrances
  fadeIn: `fadeIn ${durations[200]} ${easings.easeOut} forwards`,
  scaleIn: `scaleIn ${durations[200]} ${easings.easeOutCubic} forwards`,
  slideInTop: `slideInFromTop ${durations[200]} ${easings.easeOutCubic} forwards`,
  slideInBottom: `slideInFromBottom ${durations[200]} ${easings.easeOutCubic} forwards`,
  slideInLeft: `slideInFromLeft ${durations[200]} ${easings.easeOutCubic} forwards`,
  slideInRight: `slideInFromRight ${durations[200]} ${easings.easeOutCubic} forwards`,

  // Continuous
  spin: `spin ${durations[1000]} ${easings.linear} infinite`,
  pulse: `pulse 2s ${easings.easeInOut} infinite`,
  ping: `ping 1s ${easings.easeOut} infinite`,
  bounce: `bounce 1s ${easings.easeInOut} infinite`,
  wiggle: `wiggle 0.3s ${easings.easeInOut}`,
  glowPulse: `glowPulse 2s ${easings.easeInOut} infinite`,

  // Feedback
  shake: `shake 0.5s ${easings.easeInOut}`,

  // Loading
  shimmer: `shimmer 2s ${easings.linear} infinite`,
  indeterminate: `indeterminate 1.5s ${easings.easeInOut} infinite`,

  // Accordion
  accordionDown: `accordionDown ${durations[300]} ${easings.easeOutCubic}`,
  accordionUp: `accordionUp ${durations[300]} ${easings.easeOutCubic}`,
} as const

// =============================================================================
// STAGGER DELAYS
// Para animações em lista
// =============================================================================

export const staggerDelays = {
  /** Delay base para cada item */
  base: 50,
  /** Gera delay para item N */
  getDelay: (index: number, base = 50) => `${index * base}ms`,
  /** Delays pré-calculados para listas */
  items: [0, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500].map(d => `${d}ms`),
} as const

// =============================================================================
// CSS VARIABLES
// =============================================================================

export const motionCssVars = {
  // Durations
  '--ds-duration-fastest': durations[75],
  '--ds-duration-fast': durations[150],
  '--ds-duration-normal': durations[200],
  '--ds-duration-slow': durations[300],
  '--ds-duration-slower': durations[500],

  // Easings
  '--ds-ease-in': easings.easeIn,
  '--ds-ease-out': easings.easeOut,
  '--ds-ease-in-out': easings.easeInOut,
  '--ds-ease-spring': easings.spring,

  // Transitions
  '--ds-transition-fast': transitions.all.fast,
  '--ds-transition-normal': transitions.all.normal,
  '--ds-transition-colors': transitions.colors.normal,
  '--ds-transition-transform': transitions.transform.normal,
} as const

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type Duration = keyof typeof durations
export type DurationAlias = keyof typeof durationAliases
export type Easing = keyof typeof easings
export type EasingAlias = keyof typeof easingAliases
export type Animation = keyof typeof animations
export type Keyframe = keyof typeof keyframes
