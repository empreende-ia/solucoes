'use client'

/**
 * useBrand — configuração de marca do deploy (whitelabel)
 *
 * React Query sobre /api/brand (endpoint público).
 * Enquanto carrega (ou em erro), retorna o fallback padrão "Dispara".
 */

import { useQuery } from '@tanstack/react-query'

export interface Brand {
  name: string
  logoUrl: string
  primaryColor: string
}

export const BRAND_FALLBACK: Brand = {
  name: 'Dispara',
  logoUrl: '/brand/logo.svg',
  primaryColor: '#10b981',
}

async function fetchBrand(): Promise<Brand> {
  const response = await fetch('/api/brand')
  if (!response.ok) throw new Error('Failed to fetch brand')

  const data = await response.json()
  return {
    name: typeof data?.name === 'string' && data.name ? data.name : BRAND_FALLBACK.name,
    logoUrl: typeof data?.logoUrl === 'string' && data.logoUrl ? data.logoUrl : BRAND_FALLBACK.logoUrl,
    primaryColor:
      typeof data?.primaryColor === 'string' && data.primaryColor
        ? data.primaryColor
        : BRAND_FALLBACK.primaryColor,
  }
}

export function useBrand() {
  const { data, isLoading, isError } = useQuery<Brand>({
    queryKey: ['brand'],
    queryFn: fetchBrand,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  })

  return {
    brand: data ?? BRAND_FALLBACK,
    isLoading,
    isError,
  }
}
