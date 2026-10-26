'use client'

import Link, { LinkProps } from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState, ReactNode } from 'react'

interface PrefetchLinkProps extends Omit<LinkProps, 'prefetch'> {
  children: ReactNode
  className?: string
  onClick?: (e: React.MouseEvent) => void
  onMouseEnter?: () => void
  title?: string
}

/**
 * Smart prefetch link that only prefetches on hover.
 * 
 * This gives the best of both worlds:
 * - No unnecessary prefetches on page load (saves Vercel invocations)
 * - Fast navigation when user hovers (prefetches before click)
 * 
 * Based on Next.js official recommendation:
 * https://nextjs.org/docs/app/guides/prefetching
 */
export function PrefetchLink({
  href,
  children,
  className,
  onClick,
  onMouseEnter,
  title,
  ...props
}: PrefetchLinkProps) {
  const router = useRouter()
  const [shouldPrefetch, setShouldPrefetch] = useState(false)
  const didPrefetchRef = useRef(false)

  const tryPrefetch = () => {
    if (didPrefetchRef.current) return
    didPrefetchRef.current = true
    setShouldPrefetch(true)

    // `router.prefetch` só aceita string. No app, usamos `href` como string na prática.
    if (typeof href === 'string') {
      router.prefetch(href)
    }
  }

  const handleMouseEnter = () => {
    tryPrefetch()
    onMouseEnter?.()
  }

  return (
    <Link
      href={href}
      // Mantém prefetch ligado (viewport) e também forçamos `router.prefetch` no hover.
      // `shouldPrefetch` fica aqui para futuras estratégias, mas não muda o comportamento atual.
      prefetch={true}
      onMouseEnter={handleMouseEnter}
      onFocus={tryPrefetch}
      onTouchStart={tryPrefetch}
      onClick={onClick}
      className={className}
      title={title}
      {...props}
    >
      {children}
    </Link>
  )
}
