'use client'

// Navigation adapter for Next.js App Router
// This allows the existing hooks to work with Next.js routing

import { useRouter, useParams as useNextParams, usePathname } from 'next/navigation'

// Re-export useParams from Next.js
export { useParams as useNextParams } from 'next/navigation'

// Adapter for react-router-dom's useNavigate
export function useNavigate() {
  const router = useRouter()
  
  return (path: string, options?: { replace?: boolean }) => {
    if (options?.replace) {
      router.replace(path)
    } else {
      router.push(path)
    }
  }
}

// Adapter for react-router-dom's useParams
export function useParams<T extends Record<string, string>>(): T {
  const params = useNextParams()
  // Next.js params can be string | string[] | undefined
  // Convert to match react-router-dom format (string only)
  const normalized: Record<string, string> = {}
  
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string') {
        normalized[key] = value
      } else if (Array.isArray(value)) {
        normalized[key] = value[0] || ''
      }
    }
  }
  
  return normalized as T
}

// Adapter for react-router-dom's useLocation
export function useLocation() {
  const pathname = usePathname()
  
  return {
    pathname,
    search: '',
    hash: '',
    state: null,
    key: 'default'
  }
}
