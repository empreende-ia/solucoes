/**
 * Testes do módulo de branding (whitelabel)
 */

import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase-db', () => ({
  settingsDb: {
    get: vi.fn(),
    set: vi.fn(),
  },
}))

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: vi.fn(() => false),
}))

import {
  DEFAULT_BRAND,
  getBrandConfig,
  buildBrandCssOverrides,
  normalizeHexColor,
  relativeLuminance,
  getBrandForeground,
} from './branding'
import { settingsDb } from '@/lib/supabase-db'
import { isSupabaseConfigured } from '@/lib/supabase'

const mockedGet = vi.mocked(settingsDb.get)
const mockedIsConfigured = vi.mocked(isSupabaseConfigured)

describe('normalizeHexColor', () => {
  it('aceita #rrggbb e normaliza para lowercase', () => {
    expect(normalizeHexColor('#10B981')).toBe('#10b981')
    expect(normalizeHexColor('  #ff0000 ')).toBe('#ff0000')
  })

  it('expande #rgb para #rrggbb', () => {
    expect(normalizeHexColor('#f00')).toBe('#ff0000')
    expect(normalizeHexColor('#ABC')).toBe('#aabbcc')
  })

  it('retorna null para valores inválidos', () => {
    expect(normalizeHexColor('')).toBeNull()
    expect(normalizeHexColor(null)).toBeNull()
    expect(normalizeHexColor(undefined)).toBeNull()
    expect(normalizeHexColor('10b981')).toBeNull()
    expect(normalizeHexColor('#10b98')).toBeNull()
    expect(normalizeHexColor('#gggggg')).toBeNull()
    expect(normalizeHexColor('rgb(16,185,129)')).toBeNull()
  })
})

describe('relativeLuminance / getBrandForeground', () => {
  it('calcula luminância nos extremos', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5)
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5)
  })

  it('emerald default (#10b981) tem luminância < 0.45 => texto claro', () => {
    expect(relativeLuminance('#10b981')).toBeLessThan(0.45)
    expect(getBrandForeground('#10b981')).toBe('#f8fafc')
  })

  it('cores claras (> 0.45) recebem texto escuro', () => {
    expect(getBrandForeground('#ffffff')).toBe('#030712')
    expect(getBrandForeground('#facc15')).toBe('#030712') // amarelo
    expect(getBrandForeground('#a3e635')).toBe('#030712') // lime
  })

  it('cores escuras recebem texto claro', () => {
    expect(getBrandForeground('#000000')).toBe('#f8fafc')
    expect(getBrandForeground('#1d4ed8')).toBe('#f8fafc') // azul escuro
    expect(getBrandForeground('#7c3aed')).toBe('#f8fafc') // violeta
  })
})

describe('buildBrandCssOverrides', () => {
  const css = buildBrandCssOverrides('#3b82f6')

  it('sobrescreve em :root e .dark', () => {
    expect(css).toContain(':root {')
    expect(css).toContain('.dark {')
  })

  it('define os tokens de marca principais', () => {
    expect(css).toContain('--ds-brand-primary: #3b82f6;')
    expect(css).toContain('--ds-brand-primary-hover: color-mix(in oklab, #3b82f6, black 12%);')
    expect(css).toContain('--ds-brand-primary-muted: color-mix(in srgb, #3b82f6 10%, transparent);')
    expect(css).toContain('--ds-border-focus: #3b82f6;')
    expect(css).toContain('--primary: #3b82f6;')
    expect(css).toContain('--ring: #3b82f6;')
    expect(css).toContain('--sidebar-primary: #3b82f6;')
  })

  it('gera glows e sombras com color-mix de transparência', () => {
    expect(css).toContain('--ds-glow-brand-sm: 0 0 12px color-mix(in srgb, #3b82f6 20%, transparent);')
    expect(css).toContain('--ds-glow-brand-md: 0 0 24px color-mix(in srgb, #3b82f6 30%, transparent);')
    expect(css).toContain('--ds-glow-brand-ring: 0 0 0 3px color-mix(in srgb, #3b82f6 20%, transparent);')
    expect(css).toContain(
      '--ds-shadow-button-primary: 0 2px 6px 0 rgba(0, 0, 0, 0.4), 0 0 12px color-mix(in srgb, #3b82f6 20%, transparent);'
    )
    expect(css).toContain(
      '--ds-shadow-button-primary-hover: 0 4px 12px -2px rgba(0, 0, 0, 0.4), 0 0 24px color-mix(in srgb, #3b82f6 30%, transparent);'
    )
  })

  it('gera a escala 50..950 com as gradações especificadas', () => {
    expect(css).toContain('--color-primary-300: color-mix(in oklab, #3b82f6, white 35%);')
    expect(css).toContain('--color-primary-400: color-mix(in oklab, #3b82f6, white 18%);')
    expect(css).toContain('--color-primary-500: #3b82f6;')
    expect(css).toContain('--color-primary-600: color-mix(in oklab, #3b82f6, black 12%);')
    expect(css).toContain('--color-primary-700: color-mix(in oklab, #3b82f6, black 24%);')
    expect(css).toContain('--color-primary-50: color-mix(in oklab, #3b82f6, white 92%);')
    expect(css).toContain('--color-primary-950: color-mix(in oklab, #3b82f6, black 70%);')
  })

  it('decide --primary-foreground por luminância', () => {
    // Azul (escuro) => texto claro
    expect(css).toContain('--primary-foreground: #f8fafc;')
    // Amarelo (claro) => texto escuro
    const lightCss = buildBrandCssOverrides('#facc15')
    expect(lightCss).toContain('--primary-foreground: #030712;')
  })

  it('cai para o default se o hex for inválido', () => {
    const fallbackCss = buildBrandCssOverrides('lol')
    expect(fallbackCss).toContain(`--ds-brand-primary: ${DEFAULT_BRAND.primaryColor};`)
  })
})

describe('getBrandConfig', () => {
  it('retorna defaults quando Supabase não está configurado (install wizard)', async () => {
    mockedIsConfigured.mockReturnValue(false)
    const brand = await getBrandConfig()
    expect(brand).toEqual(DEFAULT_BRAND)
    expect(mockedGet).not.toHaveBeenCalled()
  })

  it('retorna defaults quando as keys não existem', async () => {
    mockedIsConfigured.mockReturnValue(true)
    mockedGet.mockResolvedValue(null)
    const brand = await getBrandConfig()
    expect(brand).toEqual(DEFAULT_BRAND)
  })

  it('retorna defaults quando o banco lança erro', async () => {
    mockedIsConfigured.mockReturnValue(true)
    mockedGet.mockRejectedValue(new Error('Supabase not configured'))
    const brand = await getBrandConfig()
    expect(brand).toEqual(DEFAULT_BRAND)
  })

  it('lê as 3 keys do settings quando existem', async () => {
    mockedIsConfigured.mockReturnValue(true)
    mockedGet.mockImplementation(async (key: string) => {
      const values: Record<string, string> = {
        brand_name: 'Acme Zap',
        brand_logo_url: 'https://cdn.acme.com/logo.svg',
        brand_primary_color: '#3B82F6',
        company_name: 'Acme LTDA',
      }
      return values[key] ?? null
    })

    const brand = await getBrandConfig()
    expect(brand).toEqual({
      name: 'Acme Zap',
      logoUrl: 'https://cdn.acme.com/logo.svg',
      primaryColor: '#3b82f6',
    })
  })

  it('brand_name ausente cai para company_name (compat pré-whitelabel)', async () => {
    mockedIsConfigured.mockReturnValue(true)
    mockedGet.mockImplementation(async (key: string) => {
      const values: Record<string, string> = {
        company_name: 'Empresa Antiga',
      }
      return values[key] ?? null
    })

    const brand = await getBrandConfig()
    expect(brand.name).toBe('Empresa Antiga')
    expect(brand.logoUrl).toBe(DEFAULT_BRAND.logoUrl)
    expect(brand.primaryColor).toBe(DEFAULT_BRAND.primaryColor)
  })

  it('cor inválida no banco cai para o default', async () => {
    mockedIsConfigured.mockReturnValue(true)
    mockedGet.mockImplementation(async (key: string) => {
      const values: Record<string, string> = {
        brand_name: 'Acme',
        brand_primary_color: 'azul',
      }
      return values[key] ?? null
    })

    const brand = await getBrandConfig()
    expect(brand.primaryColor).toBe(DEFAULT_BRAND.primaryColor)
  })
})
