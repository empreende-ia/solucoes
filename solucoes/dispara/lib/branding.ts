/**
 * Whitelabel Branding (server-safe)
 *
 * Cada deploy (single-tenant) pode configurar nome, logo e cor primária.
 * Persistido na tabela `settings` (key-value) — sem migration nova:
 * - brand_name
 * - brand_logo_url
 * - brand_primary_color
 *
 * getBrandConfig() SEMPRE resolve (fallback nos defaults), inclusive quando
 * o Supabase não está configurado — crítico para o install wizard funcionar.
 */

import { settingsDb } from '@/lib/supabase-db'
import { isSupabaseConfigured } from '@/lib/supabase'

// ============================================================================
// TYPES & DEFAULTS
// ============================================================================

export interface BrandConfig {
  name: string
  logoUrl: string
  primaryColor: string
}

export const DEFAULT_BRAND: BrandConfig = {
  name: 'Dispara',
  logoUrl: '/brand/logo.svg',
  primaryColor: '#10b981',
}

// ============================================================================
// COLOR HELPERS
// ============================================================================

/**
 * Normaliza uma cor hex para o formato #rrggbb (lowercase).
 * Aceita #rgb e #rrggbb. Retorna null se inválida.
 */
export function normalizeHexColor(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim().toLowerCase()

  if (/^#[0-9a-f]{6}$/.test(trimmed)) return trimmed

  if (/^#[0-9a-f]{3}$/.test(trimmed)) {
    const [r, g, b] = trimmed.slice(1).split('')
    return `#${r}${r}${g}${g}${b}${b}`
  }

  return null
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = normalizeHexColor(hex) || DEFAULT_BRAND.primaryColor
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  }
}

/**
 * Luminância relativa (WCAG 2.x) de uma cor hex — 0 (preto) a 1 (branco).
 */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex)
  const linearize = (channel: number): number => {
    const s = channel / 255
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
}

/**
 * Cor de texto sobre a cor da marca, decidida por luminância.
 * Cores claras (> 0.45) recebem texto escuro; escuras recebem texto claro.
 */
export function getBrandForeground(hex: string): string {
  return relativeLuminance(hex) > 0.45 ? '#030712' : '#f8fafc'
}

// ============================================================================
// CSS OVERRIDES
// ============================================================================

/** color-mix com transparência (para glows/muted) */
function alphaMix(hex: string, alphaPercent: number): string {
  return `color-mix(in srgb, ${hex} ${alphaPercent}%, transparent)`
}

/** color-mix em oklab com white/black (para a escala 50..950) */
function toneMix(hex: string, tone: 'white' | 'black', percent: number): string {
  return `color-mix(in oklab, ${hex}, ${tone} ${percent}%)`
}

/**
 * Gera o bloco CSS que sobrescreve os tokens de marca (emerald) pelo hex do
 * cliente. Injetado no layout como <style id="brand-overrides"> DEPOIS do
 * globals.css, então vence por ordem de declaração em :root e .dark.
 */
export function buildBrandCssOverrides(hex: string): string {
  const color = normalizeHexColor(hex) || DEFAULT_BRAND.primaryColor
  const foreground = getBrandForeground(color)

  const declarations = [
    `--ds-brand-primary: ${color};`,
    `--ds-brand-primary-hover: ${toneMix(color, 'black', 12)};`,
    `--ds-brand-primary-muted: ${alphaMix(color, 10)};`,
    `--ds-border-focus: ${color};`,
    `--ds-glow-brand-sm: 0 0 12px ${alphaMix(color, 20)};`,
    `--ds-glow-brand-md: 0 0 24px ${alphaMix(color, 30)};`,
    `--ds-glow-brand-ring: 0 0 0 3px ${alphaMix(color, 20)};`,
    `--ds-shadow-button-primary: 0 2px 6px 0 rgba(0, 0, 0, 0.4), 0 0 12px ${alphaMix(color, 20)};`,
    `--ds-shadow-button-primary-hover: 0 4px 12px -2px rgba(0, 0, 0, 0.4), 0 0 24px ${alphaMix(color, 30)};`,
    `--primary: ${color};`,
    `--primary-foreground: ${foreground};`,
    `--ring: ${color};`,
    `--sidebar-primary: ${color};`,
    `--sidebar-primary-foreground: ${foreground};`,
    // Escala primary (Tailwind v4 @theme usa var() em runtime)
    `--color-primary-50: ${toneMix(color, 'white', 92)};`,
    `--color-primary-100: ${toneMix(color, 'white', 80)};`,
    `--color-primary-200: ${toneMix(color, 'white', 60)};`,
    `--color-primary-300: ${toneMix(color, 'white', 35)};`,
    `--color-primary-400: ${toneMix(color, 'white', 18)};`,
    `--color-primary-500: ${color};`,
    `--color-primary-600: ${toneMix(color, 'black', 12)};`,
    `--color-primary-700: ${toneMix(color, 'black', 24)};`,
    `--color-primary-800: ${toneMix(color, 'black', 40)};`,
    `--color-primary-900: ${toneMix(color, 'black', 55)};`,
    `--color-primary-950: ${toneMix(color, 'black', 70)};`,
  ]

  const block = declarations.map((d) => `  ${d}`).join('\n')

  return `:root {\n${block}\n}\n.dark {\n${block}\n}`
}

// ============================================================================
// CONFIG LOADER
// ============================================================================

/**
 * Lê a configuração de marca do banco com fallback nos defaults.
 *
 * Decisões:
 * - `brand_name` ausente cai para `company_name` (comportamento pré-whitelabel:
 *   deploys existentes continuam mostrando o nome da empresa) e por fim 'Dispara'.
 * - Nunca lança: Supabase não configurado / erro de rede => DEFAULT_BRAND
 *   (crítico para o install wizard rodar sem env vars).
 */
export async function getBrandConfig(): Promise<BrandConfig> {
  try {
    if (!isSupabaseConfigured()) return DEFAULT_BRAND

    const [name, logoUrl, primaryColor, companyName] = await Promise.all([
      settingsDb.get('brand_name').catch(() => null),
      settingsDb.get('brand_logo_url').catch(() => null),
      settingsDb.get('brand_primary_color').catch(() => null),
      settingsDb.get('company_name').catch(() => null),
    ])

    return {
      name: name?.trim() || companyName?.trim() || DEFAULT_BRAND.name,
      logoUrl: logoUrl?.trim() || DEFAULT_BRAND.logoUrl,
      primaryColor: normalizeHexColor(primaryColor) || DEFAULT_BRAND.primaryColor,
    }
  } catch {
    return DEFAULT_BRAND
  }
}
