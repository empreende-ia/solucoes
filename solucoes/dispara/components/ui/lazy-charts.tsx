'use client'

import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'

// Lazy load Recharts components (~100-150KB reduction)
// These are loaded only when first rendered, not in initial bundle

const LazyAreaChart = dynamic(
  () => import('recharts').then((m) => ({ default: m.AreaChart })),
  { ssr: false }
)

const LazyArea = dynamic(
  () => import('recharts').then((m) => ({ default: m.Area })),
  { ssr: false }
)

const LazyXAxis = dynamic(
  () => import('recharts').then((m) => ({ default: m.XAxis })),
  { ssr: false }
)

const LazyYAxis = dynamic(
  () => import('recharts').then((m) => ({ default: m.YAxis })),
  { ssr: false }
)

const LazyCartesianGrid = dynamic(
  () => import('recharts').then((m) => ({ default: m.CartesianGrid })),
  { ssr: false }
)

const LazyTooltip = dynamic(
  () => import('recharts').then((m) => ({ default: m.Tooltip })),
  { ssr: false }
)

const LazyResponsiveContainer = dynamic(
  () => import('recharts').then((m) => ({ default: m.ResponsiveContainer })),
  { ssr: false }
)

// Re-export with same names for drop-in replacement
export {
  LazyAreaChart as AreaChart,
  LazyArea as Area,
  LazyXAxis as XAxis,
  LazyYAxis as YAxis,
  LazyCartesianGrid as CartesianGrid,
  LazyTooltip as Tooltip,
  LazyResponsiveContainer as ResponsiveContainer,
}

// Type exports for compatibility
export type AreaChartProps = ComponentProps<typeof LazyAreaChart>
export type AreaProps = ComponentProps<typeof LazyArea>
